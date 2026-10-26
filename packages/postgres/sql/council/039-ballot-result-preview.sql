-- @implements-requirement HALL-FR-BAL-320
-- Product decision: a preview retains a candidate, not votes or a decision.
-- Each replacement preview is a new version; only confirmation makes the act.
CREATE TABLE hall.ballot_result_preview (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item UUID NOT NULL REFERENCES hall.council_agenda_item(id),
  revision INTEGER NOT NULL CONSTRAINT "ballot_result_preview_revision_check" CHECK (revision > 0),
  candidate JSONB NOT NULL,
  context_fingerprint TEXT NOT NULL,
  calculation JSONB NOT NULL,
  quorum JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_by TEXT NOT NULL,
  UNIQUE(agenda_item,revision)
);
ALTER TABLE hall.ballots ADD COLUMN result_preview UUID UNIQUE REFERENCES hall.ballot_result_preview(id);

CREATE FUNCTION hall.ballot_preview_context(target_item UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object('item',to_jsonb(item),'meeting',to_jsonb(m),
   'conduct',hall.meeting_conduct_evidence(m.id),
   'recusals',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM hall.agenda_item_recusal r WHERE r.agenda_item=item.id),'[]'::jsonb))
 FROM hall.council_agenda_item item JOIN hall.council_meetings m ON m.id=item.council_meeting WHERE item.id=target_item;
$$;
CREATE FUNCTION hall.ballot_preview_fingerprint(target_item UUID)
RETURNS TEXT LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT encode(sha256(convert_to(hall.ballot_preview_context(target_item)::text,'UTF8')),'hex');
$$;

CREATE FUNCTION hall.normalize_ballot_candidate(input JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,hall AS $$
DECLARE mode TEXT:=input->>'mode'; participants UUID[]; chairman UUID; allowed TEXT[];
  normalized JSONB; accounted UUID[]; totals JSONB; total INTEGER;
BEGIN
 IF input->>'procedure' IS DISTINCT FROM 'ordinaryMajority' THEN
   RAISE EXCEPTION USING ERRCODE = 'HV416',MESSAGE='only the ordinary-majority decision procedure is supported';
 END IF;
 IF mode IS NULL OR mode NOT IN ('public','secret') OR jsonb_typeof(input->'participantAttendanceIds') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='invalid ballot candidate';
 END IF;
 participants:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(input->'participantAttendanceIds') value ORDER BY value::uuid);
 chairman:=(input->>'chairmanAttendanceId')::uuid;
 IF cardinality(participants)=0 OR cardinality(participants)<>(SELECT count(DISTINCT id) FROM unnest(participants) id)
   OR chairman IS NULL OR NOT chairman=ANY(participants) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='a candidate requires distinct participants and their chairman';
 END IF;
 allowed:=CASE mode WHEN 'public' THEN ARRAY['procedure','mode','participantAttendanceIds','chairmanAttendanceId','votes','nonParticipations']
   ELSE ARRAY['procedure','mode','participantAttendanceIds','chairmanAttendanceId','totals'] END;
 IF EXISTS(SELECT key FROM jsonb_object_keys(input) key WHERE NOT key=ANY(allowed)) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='candidate fields do not match ballot secrecy';
 END IF;
 normalized:=jsonb_build_object('procedure','ordinaryMajority','mode',mode,'participantAttendanceIds',participants,'chairmanAttendanceId',chairman);
 IF mode='public' THEN
   IF jsonb_typeof(input->'votes') IS DISTINCT FROM 'array' OR jsonb_typeof(input->'nonParticipations') IS DISTINCT FROM 'array'
     OR EXISTS(SELECT FROM jsonb_array_elements(input->'votes') v
       WHERE v->>'choice' IS NULL OR v->>'choice' NOT IN ('approve','reject','abstain') OR v->>'meetingAttendanceId' IS NULL
         OR (SELECT count(*) FROM jsonb_object_keys(v))<>2)
     OR EXISTS(SELECT FROM jsonb_array_elements(input->'nonParticipations') n
       WHERE n->>'reason' IS NULL OR n->>'reason' NOT IN ('declined','departed') OR n->>'meetingAttendanceId' IS NULL
         OR (SELECT count(*) FROM jsonb_object_keys(n))<>2) THEN
     RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='public accounting requires named votes or named non-participation';
   END IF;
   accounted:=ARRAY(SELECT (entry->>'meetingAttendanceId')::uuid FROM (
     SELECT value entry FROM jsonb_array_elements(input->'votes') UNION ALL
     SELECT value FROM jsonb_array_elements(input->'nonParticipations')) entries ORDER BY (entry->>'meetingAttendanceId')::uuid);
   IF accounted IS DISTINCT FROM participants THEN
     RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='every public participant must be accounted for exactly once';
   END IF;
   RETURN normalized||jsonb_build_object('votes',coalesce((SELECT jsonb_agg(value ORDER BY (value->>'meetingAttendanceId')::uuid)
     FROM jsonb_array_elements(input->'votes')),'[]'::jsonb),'nonParticipations',coalesce((SELECT jsonb_agg(value ORDER BY (value->>'meetingAttendanceId')::uuid)
     FROM jsonb_array_elements(input->'nonParticipations')),'[]'::jsonb));
 END IF;
 totals:=input->'totals';
 IF jsonb_typeof(totals) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(totals))<>6
   OR NOT totals ?& ARRAY['approve','reject','abstain','blank','invalid','nonParticipation']
   OR EXISTS(SELECT FROM jsonb_each(totals) t WHERE jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]+$') THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='secret accounting contains anonymous nonnegative integer totals only';
 END IF;
 SELECT sum(value::text::integer)::integer INTO total FROM jsonb_each(totals);
 IF total<>cardinality(participants) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='secret totals must account for every declared participation';
 END IF;
 RETURN normalized||jsonb_build_object('totals',totals);
END $$;

CREATE FUNCTION hall.calculate_ballot_candidate(candidate JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,hall AS $$
DECLARE totals JSONB; chairman_choice hall.vote_choice; approve_count INTEGER; reject_count INTEGER;
BEGIN
 IF candidate->>'mode'='public' THEN
   SELECT jsonb_build_object('approve',count(*) FILTER(WHERE value->>'choice'='approve'),
     'reject',count(*) FILTER(WHERE value->>'choice'='reject'),'abstain',count(*) FILTER(WHERE value->>'choice'='abstain'),
     'blank',0,'invalid',0,'nonParticipation',jsonb_array_length(candidate->'nonParticipations')) INTO totals
     FROM jsonb_array_elements(candidate->'votes');
   SELECT (value->>'choice')::hall.vote_choice INTO chairman_choice FROM jsonb_array_elements(candidate->'votes')
     WHERE value->>'meetingAttendanceId'=candidate->>'chairmanAttendanceId';
 ELSE totals:=candidate->'totals'; END IF;
 approve_count:=(totals->>'approve')::integer; reject_count:=(totals->>'reject')::integer;
 RETURN jsonb_build_object('tieBreakApplied',candidate->>'mode'='public' AND approve_count=reject_count AND approve_count>0 AND coalesce(chairman_choice IN ('approve','reject'),false),'totals',totals,'expressedCount',approve_count+reject_count,
   'participantCount',jsonb_array_length(candidate->'participantAttendanceIds'),
   'result',hall.ordinary_majority_result((candidate->>'mode')::hall.ballot_mode,approve_count,reject_count,chairman_choice));
END $$;

CREATE FUNCTION hall.ballot_result_preview_projection(preview hall.ballot_result_preview)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object('id',preview.id,'agendaItemId',preview.agenda_item,'revision',preview.revision,
   'candidate',preview.candidate,'calculation',preview.calculation,'quorum',preview.quorum,
   'canConfirm',preview.revision=(SELECT max(revision) FROM hall.ballot_result_preview WHERE agenda_item=preview.agenda_item)
     AND preview.context_fingerprint=hall.ballot_preview_fingerprint(preview.agenda_item)
     AND EXISTS(SELECT FROM hall.council_agenda_item WHERE id=preview.agenda_item AND completed_at IS NULL AND position>0),
   'createdAt',preview.created_at,'createdBy',preview.created_by);
$$;
CREATE FUNCTION hall.candidate_accounts_for_departure(target_item UUID,candidate JSONB,target_attendance UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT hall.agenda_item_attendance_has_recorded_departure(target_item,target_attendance)
   AND (candidate->>'mode'='secret' OR EXISTS(SELECT FROM jsonb_array_elements(candidate->'nonParticipations') n
     WHERE n->>'meetingAttendanceId'=target_attendance::text AND n->>'reason'='departed'));
$$;

CREATE FUNCTION hall.enforce_ballot_result_preview()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE item hall.council_agenda_item; meeting hall.council_meetings; participant UUID; existing_ballot UUID; departed_count INTEGER:=0;
  chair_attendance UUID;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE = 'HV425',MESSAGE='result previews are immutable evidence'; END IF;
 SELECT m.* INTO meeting FROM hall.council_meetings m JOIN hall.council_agenda_item a ON a.council_meeting=m.id
   WHERE a.id=NEW.agenda_item FOR UPDATE OF m;
 SELECT * INTO item FROM hall.council_agenda_item WHERE id=NEW.agenda_item FOR UPDATE;
 IF item.id IS NULL OR item.started_at IS NULL OR item.position<0 OR item.completed_at IS NOT NULL
   OR meeting.closed_at IS NOT NULL OR item.subject_kind='openQuestion' THEN
   RAISE EXCEPTION USING ERRCODE = 'HV404',MESSAGE='a result preview requires an active ballot-eligible affair';
 END IF;
 -- @implements-requirement HALL-FR-BAL-140
 -- @implements-requirement HALL-FR-BAL-340
 -- The ballot chair is determined by the meeting, never chosen by the caller.
 chair_attendance:=hall.require_ballot_officers(item.id);
 IF jsonb_typeof(NEW.candidate)='object' THEN
   IF NEW.candidate ? 'chairmanAttendanceId'
     AND lower(NEW.candidate->>'chairmanAttendanceId') IS DISTINCT FROM chair_attendance::TEXT THEN
     RAISE EXCEPTION USING ERRCODE = 'HV410',MESSAGE='the ballot chair is determined by the meeting and cannot be chosen';
   END IF;
   IF jsonb_typeof(NEW.candidate->'participantAttendanceIds')='array' AND NOT EXISTS(
     SELECT FROM jsonb_array_elements_text(NEW.candidate->'participantAttendanceIds') value WHERE lower(value)=chair_attendance::TEXT) THEN
     RAISE EXCEPTION USING ERRCODE = 'HV410',MESSAGE='the ballot chair must take part in the ballot';
   END IF;
   NEW.candidate:=NEW.candidate||jsonb_build_object('chairmanAttendanceId',chair_attendance);
 END IF;
 NEW.candidate:=hall.normalize_ballot_candidate(NEW.candidate);
 SELECT id INTO existing_ballot FROM hall.ballots WHERE council_agenda_item=item.id;
 FOREACH participant IN ARRAY ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(NEW.candidate->'participantAttendanceIds')) LOOP
   IF NOT hall.agenda_item_attendance_is_eligible(item.id,participant)
     AND NOT hall.candidate_accounts_for_departure(item.id,NEW.candidate,participant)
     AND NOT EXISTS(SELECT FROM hall.ballot_participation WHERE ballot=existing_ballot AND meeting_attendance=participant) THEN
     RAISE EXCEPTION USING ERRCODE = 'HV305',MESSAGE='the candidate includes an ineligible participant';
   END IF;
   IF hall.candidate_accounts_for_departure(item.id,NEW.candidate,participant) THEN departed_count:=departed_count+1; END IF;
 END LOOP;
 IF NEW.candidate->>'mode'='secret' AND (NEW.candidate->'totals'->>'nonParticipation')::integer<departed_count THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='anonymous non-participation must include the recorded departures';
 END IF;
 IF NEW.candidate->>'mode'='public' AND EXISTS(SELECT FROM jsonb_array_elements(NEW.candidate->'nonParticipations') n
   WHERE n->>'reason'='departed' AND NOT hall.candidate_accounts_for_departure(item.id,NEW.candidate,(n->>'meetingAttendanceId')::uuid)) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV420',MESSAGE='a departure accounting requires an actual recorded departure after discussion';
 END IF;
 IF NOT EXISTS(SELECT FROM hall.current_meeting_attendance(meeting.id)
   WHERE id=(NEW.candidate->>'chairmanAttendanceId')::uuid AND status='present') THEN
   RAISE EXCEPTION USING ERRCODE = 'HV410',MESSAGE='the candidate chairman must be physically present';
 END IF;
 NEW.quorum:=hall.calculate_meeting_quorum(meeting.id,item.id,clock_timestamp());
 IF NEW.quorum->>'verdict'='notMet' THEN RAISE EXCEPTION USING ERRCODE = 'HV142',MESSAGE='the candidate cannot proceed without the applicable quorum'; END IF;
 NEW.calculation:=hall.calculate_ballot_candidate(NEW.candidate);
 NEW.context_fingerprint:=hall.ballot_preview_fingerprint(item.id);
 SELECT coalesce(max(revision),0)+1 INTO NEW.revision FROM hall.ballot_result_preview WHERE agenda_item=item.id;
 NEW.created_at:=clock_timestamp(); NEW.created_by:=nullif(current_setting('hall.actor_id',true),'');
 RETURN NEW;
END $$;
CREATE TRIGGER ballot_result_preview_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.ballot_result_preview
FOR EACH ROW EXECUTE FUNCTION hall.enforce_ballot_result_preview();
CREATE TRIGGER ballot_result_preview_no_truncate BEFORE TRUNCATE ON hall.ballot_result_preview
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_ballot_result_preview();

CREATE FUNCTION hall.ballot_candidate_from_rows(target_ballot UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,hall AS $$
DECLARE b hall.ballots; candidate JSONB;
BEGIN
 SELECT * INTO b FROM hall.ballots WHERE id=target_ballot;
 candidate:=jsonb_build_object('procedure','ordinaryMajority','mode',b.mode,
   'participantAttendanceIds',ARRAY(SELECT meeting_attendance FROM hall.ballot_participation WHERE ballot=b.id ORDER BY meeting_attendance),
   'chairmanAttendanceId',(SELECT meeting_attendance FROM hall.ballot_participation WHERE id=b.chairman));
 IF b.mode='public' THEN
   RETURN candidate||jsonb_build_object('votes',coalesce((SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',p.meeting_attendance,'choice',v.choice)
     ORDER BY p.meeting_attendance) FROM hall.votes v JOIN hall.ballot_participation p ON p.id=v.ballot_participation WHERE v.ballot=b.id),'[]'::jsonb),
     'nonParticipations',coalesce((SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',p.meeting_attendance,'reason',n.reason)
     ORDER BY p.meeting_attendance) FROM hall.ballot_non_participation n JOIN hall.ballot_participation p ON p.id=n.ballot_participation WHERE n.ballot=b.id),'[]'::jsonb));
 END IF;
 RETURN candidate||jsonb_build_object('totals',jsonb_build_object('approve',hall.ballot_choice_count(b.id,'approve'),
   'reject',hall.ballot_choice_count(b.id,'reject'),'abstain',hall.ballot_choice_count(b.id,'abstain'),
   'blank',hall.ballot_choice_count(b.id,'blank'),'invalid',hall.ballot_choice_count(b.id,'invalid'),
   'nonParticipation',coalesce((SELECT sum(count) FROM hall.ballot_non_participation WHERE ballot=b.id),0)));
END $$;

-- @implements-requirement HALL-TR-CON-200
CREATE FUNCTION hall.require_current_ballot_preview(target_ballot UUID,preview_id UUID)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,hall AS $$
DECLARE preview hall.ballot_result_preview; b hall.ballots;
BEGIN
 SELECT * INTO b FROM hall.ballots WHERE id=target_ballot;
 SELECT * INTO preview FROM hall.ballot_result_preview WHERE id=preview_id;
 IF preview.id IS NULL OR preview.agenda_item IS DISTINCT FROM b.council_agenda_item THEN
   RAISE EXCEPTION USING ERRCODE = 'HV423',MESSAGE='definitive confirmation requires a reviewed result preview';
 END IF;
 IF preview.revision<>(SELECT max(revision) FROM hall.ballot_result_preview WHERE agenda_item=preview.agenda_item)
   OR preview.context_fingerprint IS DISTINCT FROM hall.ballot_preview_fingerprint(preview.agenda_item) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV422',MESSAGE='the candidate or meeting context changed; review a new result preview';
 END IF;
 IF preview.candidate IS DISTINCT FROM hall.ballot_candidate_from_rows(b.id)
   OR preview.calculation->>'result' IS DISTINCT FROM hall.derive_ballot_result(b.id)::text THEN
   RAISE EXCEPTION USING ERRCODE = 'HV424',MESSAGE='the stored vote does not match the reviewed candidate';
 END IF;
END $$;
