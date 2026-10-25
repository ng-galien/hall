CREATE TYPE hall.quorum_regime AS ENUM ('ordinary','secondConvocation');
CREATE TYPE hall.quorum_verdict AS ENUM ('met','notMet','exempt');

-- @implements-requirement HALL-FR-AGI-360
CREATE TABLE hall.meeting_quorum_observation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  agenda_item UUID REFERENCES hall.council_agenda_item(id),
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  facts JSONB NOT NULL
);

-- @implements-requirement HALL-FR-MTG-290
-- L2121-17 and CE 16 June 1997, 142691: three clear calendar days from
-- sending the renewed notice, including a quorum loss during proceedings.
-- Restricting the exemption to identified remaining affairs is a Hall guard.
CREATE TABLE hall.meeting_reconvocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  failed_observation UUID NOT NULL UNIQUE REFERENCES hall.meeting_quorum_observation(id),
  sent_at TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  time_zone TEXT NOT NULL,
  first_notice_evidence TEXT NOT NULL CONSTRAINT "meeting_reconvocation_first_notice_evidence_check" CHECK (btrim(first_notice_evidence) <> ''::text),
  renewed_notice_evidence TEXT NOT NULL CONSTRAINT "meeting_reconvocation_renewed_notice_evidence_check" CHECK (btrim(renewed_notice_evidence) <> ''::text),
  agenda_item_ids UUID[] NOT NULL CONSTRAINT "meeting_reconvocation_agenda_item_ids_check" CHECK (cardinality(agenda_item_ids) > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL
);

CREATE FUNCTION hall.calculate_meeting_quorum(target_meeting UUID, target_item UUID, observation_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE membership hall.meeting_membership_record; meeting hall.council_meetings;
  renewed hall.meeting_reconvocation; present_members UUID[]; excluded_members UUID[];
  special_members UUID[]; remaining_items UUID[]; denominator INTEGER; required INTEGER;
  regime hall.quorum_regime:='ordinary'; verdict hall.quorum_verdict;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=target_meeting;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901',MESSAGE='unknown council meeting'; END IF;
  IF target_item IS NOT NULL AND NOT EXISTS(SELECT FROM hall.council_agenda_item WHERE id=target_item AND council_meeting=target_meeting) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV904',MESSAGE='agenda item does not belong to the meeting';
  END IF;
  SELECT * INTO membership FROM hall.meeting_membership_record WHERE council_meeting=target_meeting ORDER BY observed_at DESC LIMIT 1;
  IF membership.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'HV140',MESSAGE='a confirmed nominal membership record is required'; END IF;
  IF observation_time IS NULL OR observation_time>clock_timestamp() OR meeting.scheduled_at IS NULL
    OR observation_time<meeting.scheduled_at OR observation_time < membership.observed_at
    OR EXISTS(SELECT FROM hall.agenda_item_recusal WHERE agenda_item=target_item AND declared_at>observation_time)
    OR EXISTS(SELECT FROM hall.current_meeting_attendance(target_meeting) WHERE observed_at>observation_time)
    OR EXISTS(SELECT FROM hall.meeting_quorum_observation WHERE council_meeting=target_meeting AND observed_at>observation_time)
  THEN RAISE EXCEPTION USING ERRCODE = 'HV143',MESSAGE='a quorum observation cannot precede its recorded inputs'; END IF;
  IF EXISTS(SELECT member FROM unnest(membership.member_ids) member
    WHERE NOT EXISTS(SELECT FROM hall.current_meeting_attendance(target_meeting) a WHERE a.council_member=member))
  THEN RAISE EXCEPTION USING ERRCODE = 'HV141',MESSAGE='every confirmed member requires an explicit attendance declaration'; END IF;
  SELECT coalesce(array_agg(council_member ORDER BY council_member),'{}'::uuid[]) INTO excluded_members
  FROM hall.agenda_item_recusal WHERE agenda_item=target_item AND council_member=ANY(membership.member_ids);
  SELECT coalesce(array_agg(council_member ORDER BY council_member),'{}'::uuid[]) INTO special_members
  FROM hall.agenda_item_recusal WHERE agenda_item=target_item AND council_member=ANY(membership.member_ids)
    AND legal_basis='designatedRepresentativeConflict';
  SELECT coalesce(array_agg(council_member ORDER BY council_member),'{}'::uuid[]) INTO present_members
  FROM hall.current_meeting_attendance(target_meeting)
  WHERE status='present' AND council_member=ANY(membership.member_ids) AND NOT council_member=ANY(excluded_members);
  denominator:=cardinality(membership.member_ids)-cardinality(special_members);
  -- @implements-requirement HALL-FR-MTG-010
  required:=denominator/2+1;
  SELECT * INTO renewed FROM hall.meeting_reconvocation WHERE council_meeting=target_meeting ORDER BY sent_at DESC LIMIT 1;
  IF renewed.id IS NOT NULL THEN
    IF membership.observed_at<renewed.scheduled_at OR EXISTS(
      SELECT FROM hall.current_meeting_attendance(target_meeting) a WHERE a.council_member=ANY(membership.member_ids)
        AND (a.observed_at IS NULL OR a.observed_at<renewed.scheduled_at)) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV149',MESSAGE='the renewed meeting requires fresh membership and attendance observations';
    END IF;
    IF observation_time<renewed.scheduled_at THEN
      RAISE EXCEPTION USING ERRCODE = 'HV144',MESSAGE='the renewed meeting has not reached its scheduled time';
    END IF;
    IF target_item IS NULL OR target_item=ANY(renewed.agenda_item_ids) THEN regime:='secondConvocation'; END IF;
  END IF;
  verdict:=CASE WHEN regime='secondConvocation' THEN 'exempt'::hall.quorum_verdict
    WHEN cardinality(present_members)>=required THEN 'met'::hall.quorum_verdict ELSE 'notMet'::hall.quorum_verdict END;
  SELECT coalesce(array_agg(id ORDER BY position),'{}'::uuid[]) INTO remaining_items
    FROM hall.council_agenda_item WHERE council_meeting=target_meeting AND position>0 AND completed_at IS NULL;
  RETURN jsonb_build_object('membershipRecordId',membership.id,'membersInOffice',membership.members,
    'membershipObservedAt',membership.observed_at,'membershipSourceReference',membership.source_reference,
    'memberCount',cardinality(membership.member_ids),'excludedMemberIds',excluded_members,
    'denominatorExcludedMemberIds',special_members,'denominator',denominator,'requiredPresent',required,
    'presentMemberIds',present_members,'presentCount',cardinality(present_members),
    'regime',regime,'verdict',verdict,'reconvocationId',CASE WHEN regime='secondConvocation' THEN renewed.id END,
    'attendance',hall.current_attendance_json(target_meeting),
    'remainingAgendaItemIds',remaining_items);
END $$;

CREATE FUNCTION hall.enforce_meeting_quorum_observation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE = 'HV145',MESSAGE='quorum observations are immutable'; END IF;
  PERFORM 1 FROM hall.council_meetings WHERE id=NEW.council_meeting AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV136',MESSAGE='quorum observation requires an unclosed meeting'; END IF;
  NEW.facts:=hall.calculate_meeting_quorum(NEW.council_meeting,NEW.agenda_item,NEW.observed_at);
  NEW.recorded_at:=clock_timestamp(); NEW.recorded_by:=nullif(current_setting('hall.actor_id',true),'');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_quorum_observation_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_quorum_observation
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_quorum_observation();
CREATE TRIGGER meeting_quorum_observation_no_truncate BEFORE TRUNCATE ON hall.meeting_quorum_observation
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_quorum_observation();

CREATE FUNCTION hall.record_meeting_quorum(target_meeting UUID,target_item UUID,observation_time TIMESTAMPTZ)
RETURNS hall.meeting_quorum_observation LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,hall AS $$
DECLARE observation hall.meeting_quorum_observation;
BEGIN
 INSERT INTO hall.meeting_quorum_observation(council_meeting,agenda_item,observed_at)
 VALUES(target_meeting,target_item,observation_time) RETURNING * INTO observation;
 RETURN observation;
END $$;

CREATE FUNCTION hall.enforce_meeting_reconvocation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE failure hall.meeting_quorum_observation;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE = 'HV146',MESSAGE='renewed convocation evidence is immutable'; END IF;
 PERFORM 1 FROM hall.council_meetings WHERE id=NEW.council_meeting AND closed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV136',MESSAGE='a closed or unknown meeting cannot be reconvened'; END IF;
 SELECT * INTO failure FROM hall.meeting_quorum_observation WHERE id=NEW.failed_observation;
 IF failure.council_meeting IS DISTINCT FROM NEW.council_meeting OR failure.facts->>'verdict' IS DISTINCT FROM 'notMet'
   OR NEW.sent_at>clock_timestamp() OR NEW.sent_at<failure.observed_at OR NOT EXISTS(SELECT FROM pg_timezone_names WHERE name=NEW.time_zone)
 THEN RAISE EXCEPTION USING ERRCODE = 'HV144',MESSAGE='renewed convocation requires a recorded quorum failure and valid notice'; END IF;
 IF (NEW.scheduled_at AT TIME ZONE NEW.time_zone)::date < (NEW.sent_at AT TIME ZONE NEW.time_zone)::date+4
 THEN RAISE EXCEPTION USING ERRCODE = 'HV147',MESSAGE='renewed convocation requires three clear calendar days after sending'; END IF;
 IF EXISTS(SELECT item FROM unnest(NEW.agenda_item_ids) item WHERE NOT EXISTS(
   SELECT FROM hall.council_agenda_item a WHERE a.id=item AND a.council_meeting=NEW.council_meeting AND a.completed_at IS NULL
     AND failure.facts->'remainingAgendaItemIds' ? item::text))
   OR cardinality(NEW.agenda_item_ids)<>(SELECT count(DISTINCT item) FROM unnest(NEW.agenda_item_ids) item)
 THEN RAISE EXCEPTION USING ERRCODE = 'HV148',MESSAGE='the exemption is limited to identified unfinished affairs from the failed meeting'; END IF;
 NEW.recorded_at:=clock_timestamp(); NEW.recorded_by:=nullif(current_setting('hall.actor_id',true),'');
 RETURN NEW;
END $$;
CREATE TRIGGER meeting_reconvocation_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_reconvocation
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_reconvocation();
CREATE TRIGGER meeting_reconvocation_no_truncate BEFORE TRUNCATE ON hall.meeting_reconvocation
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_reconvocation();

-- @implements-requirement HALL-FR-AGI-350
CREATE FUNCTION hall.guard_agenda_quorum()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE observation hall.meeting_quorum_observation;
BEGIN
 IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL THEN
   observation:=hall.record_meeting_quorum(NEW.council_meeting,NEW.id,NEW.started_at);
   IF (NEW.minutes_approval IS NOT NULL OR NEW.council_decision_proposal IS NOT NULL)
     AND observation.facts->>'verdict'='notMet' THEN
     RAISE EXCEPTION USING ERRCODE = 'HV142',MESSAGE='the affair cannot enter discussion without the applicable quorum';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER council_agenda_item_quorum BEFORE UPDATE ON hall.council_agenda_item
FOR EACH ROW EXECUTE FUNCTION hall.guard_agenda_quorum();

CREATE FUNCTION hall.meeting_conduct_evidence(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object(
 'membershipRecords',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'councilMeetingId',council_meeting,
   'observedAt',observed_at,'recordedAt',recorded_at,'recordedBy',recorded_by,'sourceReference',source_reference,'members',members)
   ORDER BY observed_at) FROM hall.meeting_membership_record WHERE council_meeting=target_meeting),'[]'::jsonb),
 'attendanceEvents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'meetingAttendanceId',e.meeting_attendance,
   'observedAt',e.observed_at,'recordedAt',e.recorded_at,'recordedBy',e.recorded_by,'status',e.status,
   'proxyHolderAttendanceId',e.proxy_holder,'proxyDocumentId',e.proxy_document) ORDER BY e.observed_at,e.id)
   FROM hall.meeting_attendance_event e JOIN hall.meeting_attendance a ON a.id=e.meeting_attendance
   WHERE a.council_meeting=target_meeting),'[]'::jsonb),
 'quorumObservations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'councilMeetingId',council_meeting,
   'agendaItemId',agenda_item,'observedAt',observed_at,'recordedAt',recorded_at,'recordedBy',recorded_by,'facts',facts)
   ORDER BY observed_at,recorded_at) FROM hall.meeting_quorum_observation WHERE council_meeting=target_meeting),'[]'::jsonb),
 'reconvocations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'councilMeetingId',council_meeting,
   'failedObservationId',failed_observation,'sentAt',sent_at,'scheduledAt',scheduled_at,'timeZone',time_zone,
   'firstNoticeEvidence',first_notice_evidence,'renewedNoticeEvidence',renewed_notice_evidence,'agendaItemIds',agenda_item_ids,
   'recordedAt',recorded_at,'recordedBy',recorded_by) ORDER BY sent_at)
   FROM hall.meeting_reconvocation WHERE council_meeting=target_meeting),'[]'::jsonb));
$$;
