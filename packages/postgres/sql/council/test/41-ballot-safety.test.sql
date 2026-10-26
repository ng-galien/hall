BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='ballot-safety-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- Generated ballot safety invariants. Cases are produced by SQL generators:
-- exhaustive enumerations for small councils and deterministic md5-seeded
-- samples for large ones. The result oracle below never calls a hall function.

CREATE FUNCTION pg_temp.oracle(v_mode TEXT,v_approve INTEGER,v_reject INTEGER,v_chair TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
  WHEN v_approve>v_reject THEN '{"result":"approve","tieBreakApplied":false}'::jsonb
  WHEN v_approve<v_reject THEN '{"result":"reject","tieBreakApplied":false}'::jsonb
  WHEN v_mode='public' AND v_chair='approve' THEN '{"result":"approve","tieBreakApplied":true}'::jsonb
  WHEN v_mode='public' AND v_chair='reject' THEN '{"result":"reject","tieBreakApplied":true}'::jsonb
  ELSE '{"result":"reject","tieBreakApplied":false}'::jsonb END;
$$;

-- Public choices: the three expressed or abstaining choices, and a declined
-- participation (the former "notVoting").
CREATE FUNCTION pg_temp.choices_of(v_size INTEGER,v_ordinal BIGINT)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY(SELECT (ARRAY['approve','reject','abstain','declined'])[((v_ordinal/(4::bigint^(k-1))::bigint)%4)::int+1]
  FROM generate_series(1,v_size) k ORDER BY k);
$$;
CREATE FUNCTION pg_temp.seeded(v_seed TEXT,v_modulo INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
 SELECT (('x'||substr(md5(v_seed),1,7))::bit(28)::int)%v_modulo;
$$;
CREATE FUNCTION pg_temp.seeded_choices(v_seed TEXT,v_size INTEGER)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY(SELECT (ARRAY['approve','reject','abstain','declined'])[pg_temp.seeded(v_seed||':'||k,4)+1]
  FROM generate_series(1,v_size) k ORDER BY k);
$$;
CREATE FUNCTION pg_temp.ids(v_label TEXT,v_size INTEGER)
RETURNS UUID[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY(SELECT test_uuid(v_label||':att:'||k) FROM generate_series(1,v_size) k ORDER BY k);
$$;
CREATE FUNCTION pg_temp.public_candidate_of(v_ids UUID[],v_choices TEXT[],v_chair UUID)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('procedure','ordinaryMajority','mode','public',
  'participantAttendanceIds',to_jsonb(v_ids),'chairmanAttendanceId',v_chair,
  'votes',coalesce((SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',v_ids[k],'choice',v_choices[k]) ORDER BY k)
    FROM generate_subscripts(v_ids,1) k WHERE v_choices[k] IN ('approve','reject','abstain')),'[]'::jsonb),
  'nonParticipations',coalesce((SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',v_ids[k],'reason',v_choices[k]) ORDER BY k)
    FROM generate_subscripts(v_ids,1) k WHERE v_choices[k] IN ('declined','departed')),'[]'::jsonb));
$$;
CREATE FUNCTION pg_temp.secret_candidate_of(v_ids UUID[],v_chair UUID,v_totals JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('procedure','ordinaryMajority','mode','secret',
  'participantAttendanceIds',to_jsonb(v_ids),'chairmanAttendanceId',v_chair,'totals',v_totals);
$$;
CREATE FUNCTION pg_temp.count_of(v_choices TEXT[],v_choice TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
 SELECT count(*)::int FROM unnest(v_choices) c WHERE c=v_choice;
$$;
-- Returns NULL when the public candidate is accepted and evaluates exactly as
-- the oracle predicts, or a description of the first discrepancy.
CREATE FUNCTION pg_temp.public_discrepancy(v_ids UUID[],v_choices TEXT[])
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_calc JSONB; v_expected JSONB; v_size INTEGER:=cardinality(v_ids);
 v_approve INTEGER:=pg_temp.count_of(v_choices,'approve'); v_reject INTEGER:=pg_temp.count_of(v_choices,'reject');
BEGIN
 BEGIN
  v_calc:=calculate_ballot_candidate(normalize_ballot_candidate(pg_temp.public_candidate_of(v_ids,v_choices,v_ids[1])));
 EXCEPTION WHEN OTHERS THEN RETURN 'rejected '||SQLSTATE||' for '||array_to_string(v_choices,',');
 END;
 v_expected:=pg_temp.oracle('public',v_approve,v_reject,v_choices[1]);
 IF v_calc->>'result' IS DISTINCT FROM v_expected->>'result'
  OR (v_calc->>'tieBreakApplied')::boolean IS DISTINCT FROM (v_expected->>'tieBreakApplied')::boolean
  OR (v_calc#>>'{totals,approve}')::int<>v_approve OR (v_calc#>>'{totals,reject}')::int<>v_reject
  OR (v_calc#>>'{totals,abstain}')::int<>pg_temp.count_of(v_choices,'abstain')
  OR (v_calc#>>'{totals,nonParticipation}')::int<>pg_temp.count_of(v_choices,'declined')
  OR (v_calc#>>'{totals,blank}')::int<>0 OR (v_calc#>>'{totals,invalid}')::int<>0
  OR (SELECT sum(value::text::int) FROM jsonb_each(v_calc->'totals'))<>v_size
  OR (v_calc->>'participantCount')::int<>v_size
  OR (v_calc->>'expressedCount')::int<>v_approve+v_reject THEN
  RETURN 'evaluated '||v_calc::text||' for '||array_to_string(v_choices,',');
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION pg_temp.rejection_of(v_candidate JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
 PERFORM normalize_ballot_candidate(v_candidate);
 RETURN 'accepted';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;

-- One independent meeting scenario. statuses[k] gives attendance k; a
-- represented attendance names its holder by index in holders[k].
CREATE FUNCTION pg_temp.safety_meeting(v_label TEXT,v_statuses TEXT[],v_items INTEGER,
  v_holders INTEGER[] DEFAULT '{}',v_start BOOLEAN DEFAULT TRUE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE k INTEGER; v_meeting UUID:=test_uuid(v_label||':meeting');
BEGIN
 UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
 INSERT INTO council_meetings(id,number,scheduled_at,location)
 VALUES(v_meeting,(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
 FOR k IN 1..cardinality(v_statuses) LOOP
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document)
  VALUES(test_uuid(v_label||':att:'||k),test_uuid(v_label||':member:'||k),v_meeting,v_statuses[k]::meeting_attendance_status,
   CASE WHEN v_statuses[k]='represented' THEN test_uuid(v_label||':att:'||v_holders[k]) END,
   CASE WHEN v_statuses[k]='represented' THEN test_uuid(v_label||':proxy:'||k) END);
 END LOOP;
 PERFORM test_confirm_declared_membership(v_meeting);
 PERFORM set_council_meeting_officers(v_meeting,test_uuid(v_label||':member:1'),test_uuid(v_label||':member:1'));
 FOR k IN 1..v_items LOOP
  PERFORM test_create_decision_agenda_item(v_label||':'||k,v_meeting,k);
 END LOOP;
 PERFORM test_prepare_notice(v_meeting);
 IF v_start THEN PERFORM start_council_meeting(v_meeting,'2026-01-01 09:00Z'); END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
END $$;
CREATE FUNCTION pg_temp.item(v_label TEXT,v_number INTEGER)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$ SELECT test_uuid(v_label||':'||v_number||':agenda-item'); $$;
-- Starts, reviews and confirms one affair; returns the stored ballot.
CREATE FUNCTION pg_temp.confirm(v_item UUID,v_candidate JSONB)
RETURNS ballots LANGUAGE plpgsql AS $$
DECLARE v_preview JSONB; v_ballot ballots;
BEGIN
 IF (SELECT started_at IS NULL FROM council_agenda_item WHERE id=v_item) THEN
  PERFORM start_council_agenda_item(v_item,clock_timestamp());
 END IF;
 v_preview:=hall_api.create_ballot_result_preview(v_item,v_candidate);
 PERFORM hall_api.confirm_ballot_result_preview((v_preview->>'id')::uuid);
 SELECT * INTO v_ballot FROM ballots WHERE council_agenda_item=v_item;
 RETURN v_ballot;
END $$;
CREATE FUNCTION pg_temp.sqlstate_of(v_statement TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE v_statement;
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 RETURN 'accepted';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;

-- 1. Result oracle, exhaustive for public councils of two to seven voters.
-- @verifies-requirement HALL-FR-BAL-150
-- @verifies-requirement HALL-FR-BAL-160
-- @verifies-requirement HALL-FR-BAL-170
-- @verifies-requirement HALL-FR-BAL-180
-- @verifies-requirement HALL-FR-BAL-190
CREATE TEMP TABLE public_exhaustive AS
SELECT size,count(*)::int AS cases,min(discrepancy) AS first_discrepancy
FROM (SELECT size,pg_temp.public_discrepancy(pg_temp.ids('exhaustive',size),pg_temp.choices_of(size,ordinal)) discrepancy
 FROM generate_series(2,7) size CROSS JOIN LATERAL generate_series(0::bigint,(4::bigint^size)::bigint-1) ordinal) evaluated
GROUP BY size;
SELECT is((SELECT sum(cases)::int FROM public_exhaustive),21840,'every public combination of four choices for two to seven voters is generated');
SELECT is(cases,(4^size)::int,format('%s voters: all %s public combinations are enumerated',size,(4^size)::int)) FROM public_exhaustive ORDER BY size;
SELECT is(first_discrepancy,NULL,format('%s voters: every combination is accepted, conserves voices and matches the independent oracle',size)) FROM public_exhaustive ORDER BY size;

-- The persisted result is the reviewed one: exhaustive end-to-end confirmation
-- for two to four voters (336 ballots), the chairman being the first voter.
CREATE TEMP TABLE public_confirmed(size INTEGER,ordinal BIGINT,choices TEXT[],result TEXT,stored JSONB);
DO $$
DECLARE v_size INTEGER; v_chunk INTEGER; v_ordinal BIGINT; v_label TEXT; v_choices TEXT[]; v_ballot ballots; v_number INTEGER;
BEGIN
 FOR v_size IN 2..4 LOOP
  FOR v_chunk IN 0..((4^v_size)::int-1)/64 LOOP
   v_label:='confirmed-'||v_size||'-'||v_chunk;
   PERFORM pg_temp.safety_meeting(v_label,array_fill('present'::text,ARRAY[v_size]),least(64,(4^v_size)::int-v_chunk*64));
   FOR v_number IN 1..least(64,(4^v_size)::int-v_chunk*64) LOOP
    v_ordinal:=v_chunk*64+v_number-1;
    v_choices:=pg_temp.choices_of(v_size,v_ordinal);
    v_ballot:=pg_temp.confirm(pg_temp.item(v_label,v_number),pg_temp.public_candidate_of(pg_temp.ids(v_label,v_size),v_choices,test_uuid(v_label||':att:1')));
    INSERT INTO public_confirmed VALUES(v_size,v_ordinal,v_choices,v_ballot.result::text,jsonb_build_object(
     'approve',ballot_choice_count(v_ballot.id,'approve'),'reject',ballot_choice_count(v_ballot.id,'reject'),
     'abstain',ballot_choice_count(v_ballot.id,'abstain'),
     'nonParticipation',(SELECT count(*) FROM ballot_non_participation WHERE ballot=v_ballot.id),
     'participations',ballot_participation_count(v_ballot.id)));
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
SELECT is((SELECT count(*)::int FROM public_confirmed),336,'every public combination for two to four voters is confirmed end to end');
SELECT is((SELECT count(*)::int FROM public_confirmed
 WHERE result IS DISTINCT FROM pg_temp.oracle('public',pg_temp.count_of(choices,'approve'),pg_temp.count_of(choices,'reject'),choices[1])->>'result'
  OR stored<>jsonb_build_object('approve',pg_temp.count_of(choices,'approve'),'reject',pg_temp.count_of(choices,'reject'),
   'abstain',pg_temp.count_of(choices,'abstain'),'nonParticipation',pg_temp.count_of(choices,'declined'),'participations',size)),0,
 'stored results match the oracle and stored choices conserve every participation');

-- The tie rule itself, over a grid of tallies, modes and chairman choices.
SELECT is((SELECT count(*)::int FROM generate_series(0,20) a CROSS JOIN generate_series(0,20) r
 CROSS JOIN unnest(ARRAY['public','secret']) m CROSS JOIN unnest(ARRAY['approve','reject','abstain','blank','invalid',NULL]) c
 WHERE ordinary_majority_result(m::ballot_mode,a,r,c::vote_choice)::text IS DISTINCT FROM pg_temp.oracle(m,a,r,c)->>'result'),0,
 'the ordinary majority rule agrees with the oracle for every tally up to 20, both modes and every chairman choice');

-- 2. Quorum bounds, ordinary and reconvened, for one to eighty members.
-- @verifies-requirement HALL-FR-MTG-010
-- @verifies-requirement HALL-FR-MTG-270
-- @verifies-requirement HALL-FR-MTG-290
CREATE TEMP TABLE quorum_bounds(size INTEGER,present INTEGER,regime TEXT,item TEXT,facts JSONB);
CREATE TEMP TABLE forged_quorum(size INTEGER,stored JSONB,computed JSONB);
DO $$
DECLARE v_size INTEGER; v_present INTEGER; v_meeting UUID; v_label TEXT; v_failure UUID; v_at TIMESTAMPTZ;
BEGIN
 FOR v_size IN 1..80 LOOP
  v_label:='bounds-'||v_size; v_meeting:=test_uuid(v_label||':meeting');
  UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
  INSERT INTO council_meetings(id,number,scheduled_at,location)
  VALUES(v_meeting,(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
  SELECT test_uuid(v_label||':att:'||k),test_uuid('bounds:member:'||k),v_meeting,'absent' FROM generate_series(1,v_size) k;
  PERFORM test_confirm_declared_membership(v_meeting);
  PERFORM test_create_decision_agenda_item(v_label||':listed',v_meeting,1);
  PERFORM test_create_decision_agenda_item(v_label||':other',v_meeting,2);
  FOR v_present IN 0..v_size LOOP
   IF v_present>0 THEN
    UPDATE meeting_attendance SET status='present' WHERE id=test_uuid(v_label||':att:'||v_present);
   END IF;
   INSERT INTO quorum_bounds VALUES(v_size,v_present,'ordinary','meeting',calculate_meeting_quorum(v_meeting,NULL,'2026-01-01 09:00Z'));
  END LOOP;
  -- Supplied quorum facts are never trusted: the stored facts are recomputed.
  INSERT INTO meeting_quorum_observation(council_meeting,observed_at,facts)
  VALUES(v_meeting,'2026-01-01 09:00Z',jsonb_build_object('memberCount',99,'presentCount',v_size-1,'requiredPresent',99,'verdict','notMet'));
  INSERT INTO forged_quorum SELECT v_size,facts,calculate_meeting_quorum(v_meeting,NULL,'2026-01-01 09:00Z')
   FROM meeting_quorum_observation WHERE council_meeting=v_meeting;
  -- A real failure with nobody present, then a renewed convocation listing one affair.
  UPDATE meeting_attendance SET status='absent' WHERE council_meeting=v_meeting;
  v_failure:=(record_meeting_quorum(v_meeting,NULL,'2026-01-01 09:01Z')).id;
  INSERT INTO meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,first_notice_evidence,renewed_notice_evidence,agenda_item_ids)
  VALUES(v_meeting,v_failure,'2026-01-01 10:00Z','2026-01-05 09:00Z','Europe/Paris','first notice','renewed notice',ARRAY[test_uuid(v_label||':listed:agenda-item')]);
  INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
  SELECT council_meeting,'2026-01-05 09:00Z','Reconfirmed mandates',member_ids FROM meeting_membership_record WHERE council_meeting=v_meeting;
  INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status)
  SELECT id,'2026-01-05 09:00Z','absent' FROM meeting_attendance WHERE council_meeting=v_meeting;
  FOR v_present IN 0..v_size LOOP
   v_at:='2026-01-05 09:00Z'::timestamptz+make_interval(secs=>v_present);
   IF v_present>0 THEN
    INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid(v_label||':att:'||v_present),v_at,'present');
   END IF;
   INSERT INTO quorum_bounds VALUES
    (v_size,v_present,'reconvened','meeting',calculate_meeting_quorum(v_meeting,NULL,v_at)),
    (v_size,v_present,'reconvened','listed',calculate_meeting_quorum(v_meeting,test_uuid(v_label||':listed:agenda-item'),v_at)),
    (v_size,v_present,'reconvened','other',calculate_meeting_quorum(v_meeting,test_uuid(v_label||':other:agenda-item'),v_at));
  END LOOP;
 END LOOP;
END $$;
SELECT is((SELECT count(*)::int FROM quorum_bounds WHERE regime='ordinary'),3320,'every ordinary pair of active members (1..80) and present members (0..N) is observed');
SELECT is((SELECT count(*)::int FROM quorum_bounds WHERE regime='ordinary' AND (
  (facts->>'memberCount')::int<>size OR (facts->>'presentCount')::int<>present
  OR (facts->>'requiredPresent')::int<>floor(size/2.0)::int+1 OR facts->>'regime'<>'ordinary'
  OR facts->>'verdict'<>CASE WHEN present>=floor(size/2.0)::int+1 THEN 'met' ELSE 'notMet' END)),0,
 'ordinary quorum requires floor(N/2)+1 physically present members, exactly at the boundary');
SELECT is((SELECT count(*)::int FROM quorum_bounds WHERE regime='reconvened'),9960,'every reconvened pair is observed for the meeting, a listed affair and another affair');
SELECT is((SELECT count(*)::int FROM quorum_bounds WHERE regime='reconvened' AND item IN ('meeting','listed')
  AND (facts->>'verdict'<>'exempt' OR facts->>'regime'<>'secondConvocation' OR (facts->>'presentCount')::int<>present)),0,
 'a reconvened meeting and its listed affairs are exempt whatever the number present');
SELECT is((SELECT count(*)::int FROM quorum_bounds WHERE regime='reconvened' AND item='other'
  AND (facts->>'regime'<>'ordinary' OR facts->>'verdict'<>CASE WHEN present>=floor(size/2.0)::int+1 THEN 'met' ELSE 'notMet' END)),0,
 'an affair outside the renewed convocation keeps the ordinary boundary');
SELECT is((SELECT count(*)::int FROM forged_quorum WHERE stored<>computed OR (stored->>'presentCount')::int<>size),0,
 'forged quorum facts are replaced by the computed facts for every council size');
-- A council without members cannot be attested: the former zero-member case.
SELECT throws_ok($$INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
 VALUES(test_uuid('bounds-1:meeting'),'2026-01-05 10:00Z','empty roster','{}')$$,'HV137',NULL,'an empty roster is refused, so no quorum can be reached without members');

-- 3. Generated public ballots up to eighty voters: conservation and semantics.
CREATE TEMP TABLE public_generated AS
SELECT size,run,pg_temp.seeded_choices('generated:'||size||':'||run,size) AS choices
FROM generate_series(2,80) size CROSS JOIN generate_series(1,26) run;
SELECT is((SELECT count(*)::int FROM public_generated),2054,'2054 seeded public ballots of two to eighty voters are generated');
SELECT is((SELECT min(pg_temp.public_discrepancy(pg_temp.ids('generated:'||size,size),choices)) FROM public_generated),NULL,
 'generated public ballots are accepted, conserve every voice and match the oracle');

-- 4. Invariance under vote ordering and bijective renaming of attendances.
CREATE TEMP TABLE invariance AS
SELECT size,run,pg_temp.public_candidate_of(pg_temp.ids('invariance:'||size,size),choices,test_uuid('invariance:'||size||':att:1')) AS original
FROM (SELECT size,run,pg_temp.seeded_choices('invariance:'||size||':'||run,size) choices
 FROM generate_series(2,60) size CROSS JOIN generate_series(1,17) run) generated;
CREATE FUNCTION pg_temp.reversed(v_candidate JSONB) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT v_candidate||jsonb_build_object(
  'participantAttendanceIds',(SELECT coalesce(jsonb_agg(value ORDER BY ord DESC),'[]') FROM jsonb_array_elements(v_candidate->'participantAttendanceIds') WITH ORDINALITY e(value,ord)),
  'votes',(SELECT coalesce(jsonb_agg(value ORDER BY ord DESC),'[]') FROM jsonb_array_elements(v_candidate->'votes') WITH ORDINALITY e(value,ord)),
  'nonParticipations',(SELECT coalesce(jsonb_agg(value ORDER BY ord DESC),'[]') FROM jsonb_array_elements(v_candidate->'nonParticipations') WITH ORDINALITY e(value,ord)));
$$;
CREATE FUNCTION pg_temp.renamed_ids(v_candidate JSONB) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_text TEXT:=v_candidate::text; v_id TEXT;
BEGIN
 FOR v_id IN SELECT DISTINCT m[1] FROM regexp_matches(v_candidate::text,'"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"','g') m LOOP
  v_text:=replace(v_text,v_id,md5('renamed:'||v_id)::uuid::text);
 END LOOP;
 RETURN v_text::jsonb;
END $$;
SELECT is((SELECT count(*)::int FROM invariance),1003,'1003 seeded public ballots of two to sixty voters are generated');
SELECT is((SELECT count(*)::int FROM invariance
 WHERE normalize_ballot_candidate(pg_temp.reversed(original)) IS DISTINCT FROM normalize_ballot_candidate(original)),0,
 'reversing participants, votes and non-participations yields the same normalized ballot');
SELECT is((SELECT count(*)::int FROM invariance
 WHERE calculate_ballot_candidate(normalize_ballot_candidate(pg_temp.renamed_ids(original)))
  IS DISTINCT FROM calculate_ballot_candidate(normalize_ballot_candidate(original))),0,
 'a bijective renaming of every attendance yields the same totals, result and tie-break');

-- 5. Secret ballots: exhaustive compositions up to seven voters, seeded up to eighty.
CREATE TEMP TABLE secret_generated AS
SELECT size,jsonb_build_object('approve',a,'reject',r,'abstain',ab,'blank',bl,'invalid',inv,'nonParticipation',size-a-r-ab-bl-inv) AS totals
FROM generate_series(2,7) size,generate_series(0,7) a,generate_series(0,7) r,generate_series(0,7) ab,generate_series(0,7) bl,generate_series(0,7) inv
WHERE a+r+ab+bl+inv<=size
UNION ALL
SELECT size,jsonb_build_object('approve',a,'reject',r,'abstain',ab,'blank',bl,'invalid',inv,'nonParticipation',size-a-r-ab-bl-inv)
FROM (SELECT size,a,r,ab,bl,pg_temp.seeded('secret:inv:'||size||':'||run,size-a-r-ab-bl+1) inv
 FROM (SELECT size,run,a,r,ab,pg_temp.seeded('secret:bl:'||size||':'||run,size-a-r-ab+1) bl
  FROM (SELECT size,run,a,r,pg_temp.seeded('secret:ab:'||size||':'||run,size-a-r+1) ab
   FROM (SELECT size,run,a,pg_temp.seeded('secret:r:'||size||':'||run,size-a+1) r
    FROM (SELECT size,run,pg_temp.seeded('secret:a:'||size||':'||run,size+1) a
     FROM generate_series(8,80) size,generate_series(1,25) run) s1) s2) s3) s4) s5;
SELECT is((SELECT count(*)::int FROM secret_generated WHERE size<=7),1709,'every secret composition of six totals for two to seven voters is enumerated');
SELECT is((SELECT count(*)::int FROM secret_generated s
 WHERE pg_temp.rejection_of(pg_temp.secret_candidate_of(pg_temp.ids('secret:'||size,size),test_uuid('secret:'||size||':att:1'),totals))<>'accepted'),0,
 'every secret composition that accounts for each participation is accepted');
SELECT is((SELECT count(*)::int FROM secret_generated s CROSS JOIN LATERAL (SELECT calculate_ballot_candidate(normalize_ballot_candidate(
  pg_temp.secret_candidate_of(pg_temp.ids('secret:'||size,size),test_uuid('secret:'||size||':att:1'),totals))) calc) c
 WHERE calc->>'result' IS DISTINCT FROM pg_temp.oracle('secret',(totals->>'approve')::int,(totals->>'reject')::int,'approve')->>'result'
  OR (calc->>'tieBreakApplied')::boolean OR calc->'totals'<>totals OR (calc->>'participantCount')::int<>size
  OR (calc->>'expressedCount')::int<>(totals->>'approve')::int+(totals->>'reject')::int),0,
 'secret results match the oracle, conserve totals and never apply a chairman casting vote');
-- End to end for two and three voters: the stored secret result is the reviewed one.
CREATE TEMP TABLE secret_confirmed(size INTEGER,totals JSONB,result TEXT,stored JSONB);
DO $$
DECLARE v_size INTEGER; v_label TEXT; v_totals JSONB; v_number INTEGER; v_ballot ballots;
BEGIN
 FOR v_size IN 2..3 LOOP
  v_label:='secret-confirmed-'||v_size; v_number:=0;
  PERFORM pg_temp.safety_meeting(v_label,array_fill('present'::text,ARRAY[v_size]),(SELECT count(*)::int FROM secret_generated WHERE size=v_size));
  FOR v_totals IN SELECT totals FROM secret_generated WHERE size=v_size ORDER BY totals::text LOOP
   v_number:=v_number+1;
   v_ballot:=pg_temp.confirm(pg_temp.item(v_label,v_number),pg_temp.secret_candidate_of(pg_temp.ids(v_label,v_size),test_uuid(v_label||':att:1'),v_totals));
   INSERT INTO secret_confirmed VALUES(v_size,v_totals,v_ballot.result::text,jsonb_build_object(
    'approve',ballot_choice_count(v_ballot.id,'approve'),'reject',ballot_choice_count(v_ballot.id,'reject'),
    'abstain',ballot_choice_count(v_ballot.id,'abstain'),'blank',ballot_choice_count(v_ballot.id,'blank'),
    'invalid',ballot_choice_count(v_ballot.id,'invalid'),
    'nonParticipation',coalesce((SELECT sum(count)::int FROM ballot_non_participation WHERE ballot=v_ballot.id),0)));
  END LOOP;
 END LOOP;
END $$;
SELECT is((SELECT count(*)::int FROM secret_confirmed),77,'every secret composition for two and three voters is confirmed end to end');
SELECT is((SELECT count(*)::int FROM secret_confirmed WHERE stored<>totals
 OR result IS DISTINCT FROM pg_temp.oracle('secret',(totals->>'approve')::int,(totals->>'reject')::int,'approve')->>'result'),0,
 'stored anonymous totals equal the reviewed totals and the result matches the oracle');
SELECT ok(NOT EXISTS(SELECT FROM votes WHERE mode='secret' AND ballot_participation IS NOT NULL),'stored secret choices carry no participant identity');

-- 6. Malformed secret totals are refused even when their sum matches the electorate.
CREATE TEMP TABLE malformed_totals(label TEXT,totals JSONB);
INSERT INTO malformed_totals VALUES
 ('negative total','{"approve":-1,"reject":3,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}'),
 ('fractional totals','{"approve":0.5,"reject":1.5,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}'),
 ('decimal notation of an integer','{"approve":1.0,"reject":1,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}'),
 ('NaN serialized by PostgreSQL',jsonb_build_object('approve',to_jsonb('NaN'::numeric),'reject',1,'abstain',1,'blank',0,'invalid',0,'nonParticipation',0)),
 ('infinities serialized by PostgreSQL',jsonb_build_object('approve',to_jsonb('Infinity'::numeric),'reject',to_jsonb('-Infinity'::numeric),'abstain',1,'blank',1,'invalid',0,'nonParticipation',0)),
 ('numeric strings','{"approve":"1","reject":"1","abstain":0,"blank":0,"invalid":0,"nonParticipation":0}'),
 ('null total','{"approve":null,"reject":2,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}'),
 ('missing total','{"approve":1,"reject":1,"abstain":0,"blank":0,"invalid":0}'),
 ('unknown total','{"approve":1,"reject":1,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0,"notVoting":0}'),
 ('totals not an object','[1,1,0,0,0,0]');
SELECT is(pg_temp.rejection_of(pg_temp.secret_candidate_of(pg_temp.ids('malformed',2),test_uuid('malformed:att:1'),totals)),'HV420',
 'malformed secret totals are refused: '||label) FROM malformed_totals ORDER BY label;
SELECT is(pg_temp.rejection_of(pg_temp.secret_candidate_of(pg_temp.ids('malformed',2),test_uuid('malformed:att:1'),
 '{"approve":1,"reject":1,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}')),'accepted','the well-formed control totals are accepted');
SELECT throws_ok($$SELECT '{"approve":NaN}'::jsonb$$,'22P02',NULL,'JSON input cannot carry NaN or infinite totals');
SELECT is(pg_temp.rejection_of(pg_temp.secret_candidate_of(pg_temp.ids('malformed',2),test_uuid('malformed:att:1'),
 '{"approve":1,"reject":0,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}')),'HV420','secret totals must account for every participation');
SELECT is(pg_temp.rejection_of(pg_temp.secret_candidate_of(pg_temp.ids('malformed',2),test_uuid('malformed:att:1'),
 '{"approve":1,"reject":1,"abstain":0,"blank":0,"invalid":0,"nonParticipation":0}')||'{"votes":[]}'),'HV420','a secret candidate cannot carry named votes');
SELECT test_prepare_open_ballot('malformed-row','secret',2);
SELECT throws_ok($$SELECT record_secret_ballot_votes(test_uuid('malformed-row:ballot'),-1,3,0,0,0,0)$$,'HV514',NULL,'stored secret totals refuse a negative count even when the sum matches');
SELECT throws_ok($$SELECT record_secret_ballot_votes(test_uuid('malformed-row:ballot'),NULL,2,0,0,0,0)$$,'HV514',NULL,'stored secret totals refuse a missing count');

-- 7. Missing, duplicated and misattributed public votes are refused.
CREATE TEMP TABLE public_tampering AS
SELECT size,run,pg_temp.public_candidate_of(pg_temp.ids('tamper:'||size,size),pg_temp.seeded_choices('tamper:'||size||':'||run,size),test_uuid('tamper:'||size||':att:1')) AS candidate
FROM generate_series(2,40) size CROSS JOIN generate_series(1,26) run;
CREATE FUNCTION pg_temp.accounting(v_candidate JSONB) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT (SELECT coalesce(jsonb_agg(value),'[]') FROM jsonb_array_elements(v_candidate->'votes'))||
  (SELECT coalesce(jsonb_agg(value),'[]') FROM jsonb_array_elements(v_candidate->'nonParticipations'));
$$;
CREATE FUNCTION pg_temp.with_accounting(v_candidate JSONB,v_entries JSONB) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT v_candidate||jsonb_build_object(
  'votes',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(v_entries) WHERE value ? 'choice'),'[]'),
  'nonParticipations',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(v_entries) WHERE value ? 'reason'),'[]'));
$$;
SELECT is((SELECT count(*)::int FROM public_tampering),1014,'1014 seeded public ballots of two to forty voters are tampered');
SELECT is((SELECT count(*)::int FROM public_tampering WHERE pg_temp.rejection_of(candidate)<>'accepted'),0,'untampered controls are accepted');
SELECT is((SELECT count(*)::int FROM public_tampering
 WHERE pg_temp.rejection_of(pg_temp.with_accounting(candidate,pg_temp.accounting(candidate)-0))<>'HV420'),0,
 'a missing public vote is refused');
SELECT is((SELECT count(*)::int FROM public_tampering
 WHERE pg_temp.rejection_of(pg_temp.with_accounting(candidate,pg_temp.accounting(candidate)||jsonb_build_array(pg_temp.accounting(candidate)->0)))<>'HV420'),0,
 'a duplicated public vote is refused');
SELECT is((SELECT count(*)::int FROM public_tampering
 WHERE pg_temp.rejection_of(pg_temp.with_accounting(candidate,jsonb_set(pg_temp.accounting(candidate),'{0,meetingAttendanceId}',
  to_jsonb(CASE WHEN pg_temp.accounting(candidate)#>>'{0,meetingAttendanceId}'=test_uuid('tamper:'||size||':att:2')::text
   THEN test_uuid('tamper:'||size||':att:1') ELSE test_uuid('tamper:'||size||':att:2') END))))<>'HV420'),0,
 'a vote attributed to another participant is refused');
SELECT is((SELECT count(*)::int FROM public_tampering
 WHERE pg_temp.rejection_of(pg_temp.with_accounting(candidate,jsonb_set(pg_temp.accounting(candidate),'{0,meetingAttendanceId}',
  to_jsonb(test_uuid('tamper:outsider')))))<>'HV420'),0,
 'a vote attributed to a non-participant is refused');

-- 8. One valid proxy is accepted and the represented member is not physically present.
-- @verifies-requirement HALL-FR-ATT-030
CREATE TEMP TABLE proxied(size INTEGER,present_count INTEGER,represented_present BOOLEAN,result TEXT,expected TEXT);
DO $$
DECLARE v_size INTEGER; v_label TEXT; v_choices TEXT[]; v_ballot ballots; v_preview JSONB;
BEGIN
 FOR v_size IN 3..20 LOOP
  v_label:='proxy-'||v_size;
  PERFORM pg_temp.safety_meeting(v_label,array_fill('present'::text,ARRAY[2])||ARRAY['represented']||array_fill('present'::text,ARRAY[v_size-3]),1,ARRAY[0,0,2]);
  v_choices:=pg_temp.seeded_choices(v_label,v_size);
  v_ballot:=pg_temp.confirm(pg_temp.item(v_label,1),pg_temp.public_candidate_of(pg_temp.ids(v_label,v_size),v_choices,test_uuid(v_label||':att:1')));
  INSERT INTO proxied SELECT v_size,(p.quorum->>'presentCount')::int,bp.physically_present,v_ballot.result::text,
   pg_temp.oracle('public',pg_temp.count_of(v_choices,'approve'),pg_temp.count_of(v_choices,'reject'),v_choices[1])->>'result'
   FROM ballot_result_preview p, ballot_participation bp
   WHERE p.id=v_ballot.result_preview AND bp.ballot=v_ballot.id AND bp.meeting_attendance=test_uuid(v_label||':att:3');
 END LOOP;
END $$;
SELECT is((SELECT count(*)::int FROM proxied),18,'a represented member votes through a present holder in councils of three to twenty');
SELECT is((SELECT count(*)::int FROM proxied WHERE present_count<>size-1),0,'the represented member is excluded from physical presence');
SELECT is((SELECT count(*)::int FROM proxied WHERE represented_present),0,'the represented participation is recorded as not physically present');
SELECT is((SELECT count(*)::int FROM proxied WHERE result IS DISTINCT FROM expected),0,'ballots with a proxy match the oracle');

-- 9. Invalid proxies: several held by one member, held by an absent or unknown
-- member, and proxy metadata on a non-represented attendance.
-- @verifies-requirement HALL-FR-ATT-050
-- @verifies-requirement HALL-FR-ATT-070
SELECT pg_temp.safety_meeting('proxy-invalid',ARRAY['present','present','present','present','present'],1,'{}',FALSE);
SELECT is(pg_temp.sqlstate_of($$INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document) VALUES
 (test_uuid('proxy-invalid:att:6'),test_uuid('proxy-invalid:member:6'),test_uuid('proxy-invalid:meeting'),'represented',test_uuid('proxy-invalid:att:2'),test_uuid('proxy-invalid:proxy:6')),
 (test_uuid('proxy-invalid:att:7'),test_uuid('proxy-invalid:member:7'),test_uuid('proxy-invalid:meeting'),'represented',test_uuid('proxy-invalid:att:2'),test_uuid('proxy-invalid:proxy:7'))$$),
 '23505','one member cannot hold two proxies');
SELECT is(pg_temp.sqlstate_of($$UPDATE meeting_attendance SET status='absent' WHERE id=test_uuid('proxy-invalid:att:2');
 INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document) VALUES
 (test_uuid('proxy-invalid:att:6'),test_uuid('proxy-invalid:member:6'),test_uuid('proxy-invalid:meeting'),'represented',test_uuid('proxy-invalid:att:2'),test_uuid('proxy-invalid:proxy:6'))$$),
 'HV103','a proxy held by an absent member is refused');
SELECT is(pg_temp.sqlstate_of($$INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document) VALUES
 (test_uuid('proxy-invalid:att:6'),test_uuid('proxy-invalid:member:6'),test_uuid('proxy-invalid:meeting'),'represented',test_uuid('proxy-invalid:unknown-holder'),test_uuid('proxy-invalid:proxy:6'))$$),
 '23503','a proxy held by an unknown attendance is refused');
SELECT is(pg_temp.sqlstate_of($$INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document) VALUES
 (test_uuid('proxy-invalid:att:6'),test_uuid('proxy-invalid:member:6'),test_uuid('proxy-invalid:meeting'),'represented',test_uuid('proxy-invalid:att:2'),test_uuid('proxy-invalid:proxy:6')),
 (test_uuid('proxy-invalid:att:7'),test_uuid('proxy-invalid:member:7'),test_uuid('proxy-invalid:meeting'),'represented',test_uuid('proxy-invalid:att:3'),test_uuid('proxy-invalid:proxy:6'))$$),
 '23505','one written proxy cannot justify two representations');
SELECT is(pg_temp.sqlstate_of(format($$UPDATE meeting_attendance SET status=%L,proxy_holder=%s,proxy_document=%s WHERE id=test_uuid('proxy-invalid:att:5')$$,
  status,holder,document)),'23514',format('a %s attendance cannot carry %s',status,metadata))
FROM unnest(ARRAY['present','absent','excused']) status
CROSS JOIN (VALUES ('a proxy holder without document',$$test_uuid('proxy-invalid:att:2')$$,'NULL'),
 ('a proxy document without holder','NULL',$$test_uuid('proxy-invalid:proxy:5')$$),
 ('a proxy holder and document',$$test_uuid('proxy-invalid:att:2')$$,$$test_uuid('proxy-invalid:proxy:5')$$)) metadata(metadata,holder,document)
ORDER BY status,metadata;
SELECT is(pg_temp.sqlstate_of(format($$INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document) VALUES
 (test_uuid('proxy-invalid:att:6'),test_uuid('proxy-invalid:member:6'),test_uuid('proxy-invalid:meeting'),'represented',%s,%s)$$,holder,document)),
 '23514','a representation requires both holder and document: '||metadata)
FROM (VALUES ('holder only',$$test_uuid('proxy-invalid:att:2')$$,'NULL'),('document only','NULL',$$test_uuid('proxy-invalid:proxy:6')$$)) incomplete(metadata,holder,document)
ORDER BY metadata;

-- 10. Only present and represented members vote, with their exact identity.
-- @verifies-requirement HALL-FR-BAL-100
SELECT pg_temp.safety_meeting('voters',ARRAY['present','absent','excused','represented','present','present','present'],1,ARRAY[0,0,0,1]);
SELECT start_council_agenda_item(pg_temp.item('voters',1),'2026-01-01 09:01Z');
SELECT is(agenda_item_recusal_state(pg_temp.item('voters',1))->'eligibleParticipantAttendanceIds',
 (SELECT jsonb_agg(id ORDER BY id) FROM unnest(ARRAY[test_uuid('voters:att:1'),test_uuid('voters:att:4'),test_uuid('voters:att:5'),test_uuid('voters:att:6'),test_uuid('voters:att:7')]) id),
 'the voters are the present members and the represented member');
SELECT is((SELECT jsonb_build_object('holder',proxy_holder,'document',proxy_document) FROM meeting_attendance WHERE id=test_uuid('voters:att:4')),
 jsonb_build_object('holder',test_uuid('voters:att:1'),'document',test_uuid('voters:proxy:4')),'the represented member votes through the named holder and written proxy');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('voters',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('voters:att:1'),test_uuid('voters:att:2'),test_uuid('voters:att:5')],ARRAY['approve','approve','reject'],test_uuid('voters:att:1')))$$,
 'HV305',NULL,'an absent member cannot be a voter');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('voters',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('voters:att:1'),test_uuid('voters:att:3'),test_uuid('voters:att:5')],ARRAY['approve','approve','reject'],test_uuid('voters:att:1')))$$,
 'HV305',NULL,'an excused member cannot be a voter');
SELECT lives_ok($$SELECT pg_temp.confirm(pg_temp.item('voters',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('voters:att:1'),test_uuid('voters:att:4'),test_uuid('voters:att:5'),test_uuid('voters:att:6'),test_uuid('voters:att:7')],
 ARRAY['approve','reject','approve','abstain','declined'],test_uuid('voters:att:1')))$$,'present and represented voters are confirmed');
SELECT is((SELECT jsonb_object_agg(meeting_attendance,physically_present) FROM ballot_participation bp JOIN ballots b ON b.id=bp.ballot
 WHERE b.council_agenda_item=pg_temp.item('voters',1)),
 jsonb_build_object(test_uuid('voters:att:1'),true,test_uuid('voters:att:4'),false,test_uuid('voters:att:5'),true,test_uuid('voters:att:6'),true,test_uuid('voters:att:7'),true),
 'participations record exactly the derived voters and their physical presence');

-- 11. Recusals.
-- @verifies-requirement HALL-FR-BAL-310
SELECT pg_temp.safety_meeting('recusal',ARRAY['present','present','present','present','present'],4);
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
VALUES(pg_temp.item('recusal',1),test_uuid('recusal:member:3'),'personalInterest','2026-01-01 09:00:30Z');
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(pg_temp.item('recusal',1),test_uuid('recusal:member:3'),'personalInterest','2026-01-01 09:00:31Z')$$,'23505',NULL,'a duplicated recusal is refused');
SELECT start_council_agenda_item(pg_temp.item('recusal',1),clock_timestamp());
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('recusal',1),pg_temp.public_candidate_of(
 pg_temp.ids('recusal',5),ARRAY['approve','reject','abstain','approve','approve'],test_uuid('recusal:att:1')))$$,'HV305',NULL,'a recused member cannot vote');
SELECT lives_ok($$SELECT pg_temp.confirm(pg_temp.item('recusal',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('recusal:att:1'),test_uuid('recusal:att:2'),test_uuid('recusal:att:4'),test_uuid('recusal:att:5')],ARRAY['approve','reject','approve','abstain'],test_uuid('recusal:att:1')))$$,
 'a valid recusal is accepted with the recused member left out');
SELECT pg_temp.safety_meeting('recused-proxy',ARRAY['present','present','represented','present','present'],2,ARRAY[0,0,2]);
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
VALUES(pg_temp.item('recused-proxy',1),test_uuid('recused-proxy:member:2'),'personalInterest','2026-01-01 09:00:30Z'),
 (pg_temp.item('recused-proxy',2),test_uuid('recused-proxy:member:3'),'personalInterest','2026-01-01 09:00:30Z');
SELECT start_council_agenda_item(pg_temp.item('recused-proxy',1),clock_timestamp());
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('recused-proxy',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('recused-proxy:att:1'),test_uuid('recused-proxy:att:3'),test_uuid('recused-proxy:att:4'),test_uuid('recused-proxy:att:5')],
 ARRAY['approve','approve','reject','approve'],test_uuid('recused-proxy:att:1')))$$,'HV305',NULL,'a recused proxy holder cannot cast the represented vote');
SELECT lives_ok($$SELECT pg_temp.confirm(pg_temp.item('recused-proxy',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('recused-proxy:att:1'),test_uuid('recused-proxy:att:4'),test_uuid('recused-proxy:att:5')],
 ARRAY['approve','reject','approve'],test_uuid('recused-proxy:att:1')))$$,'without the recused holder and the represented member the ballot is accepted');
SELECT lives_ok($$SELECT pg_temp.confirm(pg_temp.item('recused-proxy',2),pg_temp.public_candidate_of(
 ARRAY[test_uuid('recused-proxy:att:1'),test_uuid('recused-proxy:att:2'),test_uuid('recused-proxy:att:4'),test_uuid('recused-proxy:att:5')],
 ARRAY['approve','reject','approve','abstain'],test_uuid('recused-proxy:att:1')))$$,'the recusal of a represented member is accepted with that member left out');
-- Only a member present or represented can recuse (user decision of 26 October 2026, question 1).
-- @verifies-requirement HALL-FR-AGI-420
SELECT pg_temp.safety_meeting('recusal-absent',ARRAY['present','present','absent','excused'],1);
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(pg_temp.item('recusal-absent',1),test_uuid('recusal-absent:member:3'),'personalInterest','2026-01-01 09:00:30Z')$$,
 'HV236','a recusal requires a member present or represented','a recusal of an absent member is refused');
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(pg_temp.item('recusal-absent',1),test_uuid('recusal-absent:member:4'),'personalInterest','2026-01-01 09:00:30Z')$$,
 'HV236','a recusal requires a member present or represented','a recusal of an excused member is refused');

-- 12. Meeting officers are identified and physically present; the ballot
-- chair is determined, never chosen (user decisions of 26 October 2026,
-- questions 2, 3 and 5).
-- @verifies-requirement HALL-FR-MTG-240
-- @verifies-requirement HALL-FR-MTG-250
-- @verifies-requirement HALL-FR-BAL-140
-- @verifies-requirement HALL-FR-BAL-340
-- @verifies-requirement HALL-FR-MTG-330
-- @verifies-requirement HALL-FR-MTG-340
SELECT pg_temp.safety_meeting('officers',ARRAY['present','present','present','absent','present'],1,'{}',FALSE);
SELECT throws_ok($$SELECT set_council_meeting_officers(test_uuid('officers:meeting'),NULL,test_uuid('officers:member:2'))$$,'HV124',NULL,'a missing chair is refused');
SELECT throws_ok($$SELECT set_council_meeting_officers(test_uuid('officers:meeting'),test_uuid('officers:member:1'),NULL)$$,'HV124',NULL,'a missing secretary is refused');
SELECT throws_ok($$SELECT set_council_meeting_officers(test_uuid('officers:meeting'),test_uuid('officers:unknown-chair'),test_uuid('officers:member:2'))$$,'HV124',NULL,'an unknown chair is refused');
SELECT throws_ok($$SELECT set_council_meeting_officers(test_uuid('officers:meeting'),test_uuid('officers:member:1'),test_uuid('officers:unknown-secretary'))$$,'HV124',NULL,'an unknown secretary is refused');
SELECT set_council_meeting_officers(test_uuid('officers:meeting'),test_uuid('officers:member:4'),test_uuid('officers:member:2'));
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('officers:meeting'),'2026-01-01 09:00Z')$$,'HV124',NULL,'an absent chair prevents the meeting');
SELECT set_council_meeting_officers(test_uuid('officers:meeting'),test_uuid('officers:member:1'),test_uuid('officers:member:4'));
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('officers:meeting'),'2026-01-01 09:00Z')$$,'HV124',NULL,'an absent secretary prevents the meeting');
SELECT set_council_meeting_officers(test_uuid('officers:meeting'),test_uuid('officers:member:1'),test_uuid('officers:member:2'));
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('officers:meeting'),'2026-01-01 09:00Z')$$,'present designated officers open the meeting');
SELECT start_council_agenda_item(pg_temp.item('officers',1),'2026-01-01 09:01Z');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('officers:att:1'),'2026-01-01 09:02Z','absent');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('officers',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('officers:att:1'),test_uuid('officers:att:2'),test_uuid('officers:att:3')],ARRAY['departed','approve','reject'],test_uuid('officers:att:1')))$$,
 'HV415',NULL,'a departed chair cannot chair the ballot');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('officers',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('officers:att:2'),test_uuid('officers:att:3')],ARRAY['approve','reject'],test_uuid('officers:att:2')))$$,
 'HV415','the ballot chair and the meeting secretary must be physically present',
 'a ballot is refused while the meeting chair is not physically present');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('officers',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('officers:att:2'),test_uuid('officers:att:3')],ARRAY['approve','reject'],test_uuid('officers:att:2'))-'chairmanAttendanceId')$$,
 'HV415',NULL,'a candidate without chair is also refused while the meeting chair is not physically present');
SELECT is(agenda_item_ballot_officer_blockers(pg_temp.item('officers',1)),
 jsonb_build_array(jsonb_build_object('code','ballotChairNotPresent','councilMemberId',test_uuid('officers:member:1'))),
 'the conduct screen receives the absent chair as a ballot blocker');
SELECT is((SELECT jsonb_agg(option ORDER BY option->>'councilMemberId') FROM jsonb_array_elements(hall_api.meeting_conduct(test_uuid('officers:meeting'))#>'{officerHandoverOptions,chair}') option),
 (SELECT jsonb_agg(jsonb_build_object('councilMemberId',id,'basis','councilDesignation') ORDER BY id::text)
  FROM unnest(ARRAY[test_uuid('officers:member:2'),test_uuid('officers:member:3'),test_uuid('officers:member:5')]) id),
 'without mayor or deputy present, every present councillor can be designated');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('officers:meeting'),'chair',test_uuid('officers:member:3'),'2026-01-01 09:03Z')$$,
 'the chair is handed over in the meeting');
SELECT is(hall_api.meeting_conduct(test_uuid('officers:meeting'))#>>'{currentOfficers,chairMemberId}',test_uuid('officers:member:3')::text,
 'the member who took over is the chair in office');
SELECT is((SELECT jsonb_build_object('office',office,'basis',basis,'member',council_member,'observedAt',observed_at)
 FROM meeting_officer_change WHERE council_meeting=test_uuid('officers:meeting')),
 jsonb_build_object('office','chair','basis','councilDesignation','member',test_uuid('officers:member:3'),'observedAt','2026-01-01T09:03:00+00:00'::timestamptz),
 'the handover is a timestamped meeting event with its legal basis');
SELECT lives_ok($$SELECT pg_temp.confirm(pg_temp.item('officers',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('officers:att:1'),test_uuid('officers:att:2'),test_uuid('officers:att:3')],ARRAY['departed','approve','reject'],test_uuid('officers:att:3')))$$,
 'after the handover the ballot is chaired by the new chair in office');
SELECT is((SELECT p.meeting_attendance FROM ballots b JOIN ballot_participation p ON p.id=b.chairman WHERE b.council_agenda_item=pg_temp.item('officers',1)),
 test_uuid('officers:att:3'),'the stored ballot chairman is the chair in office at the vote');
SELECT pg_temp.safety_meeting('secretary-departure',ARRAY['present','present','present','present','present'],2,'{}',FALSE);
SELECT set_council_meeting_officers(test_uuid('secretary-departure:meeting'),test_uuid('secretary-departure:member:1'),test_uuid('secretary-departure:member:2'));
SELECT start_council_meeting(test_uuid('secretary-departure:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(pg_temp.item('secretary-departure',1),'2026-01-01 09:01Z');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('secretary-departure:att:2'),'2026-01-01 09:02Z','absent');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('secretary-departure',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('secretary-departure:att:1'),test_uuid('secretary-departure:att:2'),test_uuid('secretary-departure:att:3'),test_uuid('secretary-departure:att:4')],
 ARRAY['approve','departed','reject','approve'],test_uuid('secretary-departure:att:1')))$$,
 'HV415','the ballot chair and the meeting secretary must be physically present',
 'a ballot is refused while the meeting secretary is not physically present');
SELECT is(agenda_item_ballot_officer_blockers(pg_temp.item('secretary-departure',1)),
 jsonb_build_array(jsonb_build_object('code','meetingSecretaryNotPresent','councilMemberId',test_uuid('secretary-departure:member:2'))),
 'the conduct screen receives the absent secretary as a ballot blocker');
SELECT throws_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('secretary-departure:meeting'),'secretary',test_uuid('secretary-departure:member:2'),'2026-01-01 09:03Z')$$,
 'HV127',NULL,'an absent member cannot be nominated secretary');
SELECT lives_ok($$SELECT hall_api.record_meeting_officer_change(test_uuid('secretary-departure:meeting'),'secretary',test_uuid('secretary-departure:member:4'),'2026-01-01 09:03Z')$$,
 'the council nominates another present member as secretary');
SELECT is((SELECT basis::text FROM meeting_officer_change WHERE council_meeting=test_uuid('secretary-departure:meeting')),'councilNomination',
 'the secretary replacement is recorded as a council nomination');
SELECT lives_ok($$SELECT pg_temp.confirm(pg_temp.item('secretary-departure',1),pg_temp.public_candidate_of(
 ARRAY[test_uuid('secretary-departure:att:1'),test_uuid('secretary-departure:att:2'),test_uuid('secretary-departure:att:3'),test_uuid('secretary-departure:att:4')],
 ARRAY['approve','departed','reject','approve'],test_uuid('secretary-departure:att:1')))$$,
 'with the new secretary present the ballot is accepted');

-- The ballot chair is the chair in office and cannot be chosen.
SELECT start_council_agenda_item(pg_temp.item('secretary-departure',2),clock_timestamp());
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('secretary-departure',2),pg_temp.public_candidate_of(
 ARRAY[test_uuid('secretary-departure:att:1'),test_uuid('secretary-departure:att:3'),test_uuid('secretary-departure:att:4')],
 ARRAY['approve','reject','approve'],test_uuid('secretary-departure:att:3')))$$,
 'HV410','the ballot chair is determined by the meeting and cannot be chosen',
 'the tie-breaking ballot chairman is the present meeting chair');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(pg_temp.item('secretary-departure',2),pg_temp.public_candidate_of(
 ARRAY[test_uuid('secretary-departure:att:3'),test_uuid('secretary-departure:att:4')],
 ARRAY['approve','reject'],test_uuid('secretary-departure:att:3'))-'chairmanAttendanceId')$$,
 'HV410','the ballot chair must take part in the ballot','the ballot chair takes part in the ballot');
SELECT is((hall_api.create_ballot_result_preview(pg_temp.item('secretary-departure',2),pg_temp.public_candidate_of(
 ARRAY[test_uuid('secretary-departure:att:1'),test_uuid('secretary-departure:att:3')],
 ARRAY['approve','reject'],test_uuid('secretary-departure:att:1'))-'chairmanAttendanceId'))#>>'{candidate,chairmanAttendanceId}',
 test_uuid('secretary-departure:att:1')::text,'a candidate without chair receives the chair in office');
SELECT is((SELECT calculation->>'result' FROM ballot_result_preview WHERE agenda_item=pg_temp.item('secretary-departure',2) ORDER BY revision DESC LIMIT 1),
 'approve','the voice of the chair in office prevails on a public tie');

-- 13. Quorum evidence and attendance sets.
-- @verifies-requirement HALL-FR-ATT-020
SELECT pg_temp.safety_meeting('evidence',ARRAY['present','present','present'],1,'{}',FALSE);
SELECT throws_ok($$INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
 VALUES(test_uuid('evidence:att:duplicate'),test_uuid('evidence:member:1'),test_uuid('evidence:meeting'),'present')$$,'23505',NULL,'a member has one attendance declaration per meeting');
SELECT throws_ok($$INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
 VALUES(test_uuid('evidence:meeting'),'2026-01-01 09:00:01Z','duplicated roster',ARRAY[test_uuid('evidence:member:1'),test_uuid('evidence:member:1')])$$,'HV137',NULL,'a roster cannot name a member twice');
SELECT test_ensure_council_member(test_uuid('quorum:member:undeclared'));
INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
 VALUES(test_uuid('evidence:meeting'),'2026-01-01 09:00:02Z','roster with an undeclared member',
 ARRAY[test_uuid('evidence:member:1'),test_uuid('evidence:member:2'),test_uuid('evidence:member:3'),test_uuid('quorum:member:undeclared')]);
SELECT throws_ok($$SELECT calculate_meeting_quorum(test_uuid('evidence:meeting'),NULL,'2026-01-01 09:00:03Z')$$,'HV141',NULL,'a roster member without attendance makes the attendance set incomplete');
SELECT throws_ok($$UPDATE meeting_quorum_observation SET facts='{}' WHERE council_meeting=test_uuid('bounds-2:meeting')$$,'HV145',NULL,'recorded quorum facts cannot be rewritten');
-- @verifies-requirement HALL-FR-ATT-150
SELECT pg_temp.safety_meeting('outsider',ARRAY['present','present','present'],1,'{}',FALSE);
INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
 VALUES(test_uuid('outsider:meeting'),'2026-01-01 09:00:01Z','roster without the third declared member',ARRAY[test_uuid('outsider:member:1'),test_uuid('outsider:member:2')]);
SELECT throws_ok($$SELECT calculate_meeting_quorum(test_uuid('outsider:meeting'),NULL,'2026-01-01 09:00:02Z')$$,
 'HV150',format('Test %s has a member attendance but is not in the membership roster of this meeting',test_uuid('outsider:member:3')),
 'an attendance set naming a member outside the roster is refused and names the person');
SELECT is(meeting_attendance_outsider_name(test_uuid('outsider:meeting')),'Test '||test_uuid('outsider:member:3'),
 'the refused person is identified by name');

SELECT * FROM finish();
ROLLBACK;
