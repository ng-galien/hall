-- Two immutable observations: the programme at opening, the outcome at closure.
-- The workspace boundary enriches these facts with copied documentary content.
CREATE TABLE hall.council_meeting_snapshot (
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  phase TEXT NOT NULL CONSTRAINT "council_meeting_snapshot_phase_check" CHECK (phase = ANY (ARRAY['opening'::text, 'closing'::text])),
  captured_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL CONSTRAINT "council_meeting_snapshot_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text),
  PRIMARY KEY (council_meeting, phase)
);

CREATE FUNCTION hall.reject_meeting_snapshot_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'HV125', MESSAGE = 'council meeting snapshots are immutable';
END;
$$;
CREATE TRIGGER council_meeting_snapshot_immutable
BEFORE UPDATE OR DELETE ON hall.council_meeting_snapshot
FOR EACH ROW EXECUTE FUNCTION hall.reject_meeting_snapshot_mutation();
CREATE TRIGGER council_meeting_snapshot_no_truncate
BEFORE TRUNCATE ON hall.council_meeting_snapshot
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_meeting_snapshot_mutation();

CREATE FUNCTION hall.capture_council_meeting_snapshot(target_meeting UUID, snapshot_phase TEXT, snapshot_time TIMESTAMPTZ)
RETURNS VOID LANGUAGE sql VOLATILE SET search_path = pg_catalog, hall AS $$
  INSERT INTO hall.council_meeting_snapshot(council_meeting, phase, captured_at, payload)
  SELECT target_meeting, snapshot_phase, snapshot_time, jsonb_build_object(
    'meeting', to_jsonb(meeting) || CASE WHEN snapshot_phase = 'closing'
      THEN jsonb_build_object('closed_at', snapshot_time) ELSE '{}'::jsonb END,
    'agenda', coalesce((SELECT jsonb_agg(to_jsonb(item) ORDER BY abs(item.position), item.id)
      FROM hall.council_agenda_item item WHERE item.council_meeting = target_meeting
        AND (item.position > 0 OR item.adjourned_at IS NOT NULL)), '[]'::jsonb),
    'attendance', coalesce((SELECT jsonb_agg(to_jsonb(entry) ORDER BY entry.id)
      FROM hall.meeting_attendance entry WHERE entry.council_meeting = target_meeting), '[]'::jsonb),
    'conduct', hall.meeting_conduct_evidence(target_meeting),
    'recusals', coalesce((SELECT jsonb_agg(hall.agenda_item_recusal_projection(r) ORDER BY r.id)
      FROM hall.agenda_item_recusal r JOIN hall.council_agenda_item i ON i.id = r.agenda_item
      WHERE i.council_meeting = target_meeting), '[]'::jsonb),
    'ballots', coalesce((SELECT jsonb_agg(to_jsonb(ballot) ORDER BY ballot.id)
      FROM hall.ballots ballot JOIN hall.council_agenda_item item ON item.id = ballot.council_agenda_item
      WHERE item.council_meeting = target_meeting), '[]'::jsonb),
    'participations', coalesce((SELECT jsonb_agg(to_jsonb(participation) ORDER BY participation.id)
      FROM hall.ballot_participation participation JOIN hall.ballots ballot ON ballot.id = participation.ballot
      JOIN hall.council_agenda_item item ON item.id = ballot.council_agenda_item
      WHERE item.council_meeting = target_meeting), '[]'::jsonb),
    'nonParticipations', coalesce((SELECT jsonb_agg(to_jsonb(n))
      FROM hall.ballot_non_participation n JOIN hall.ballots b ON b.id=n.ballot
      JOIN hall.council_agenda_item item ON item.id=b.council_agenda_item
      WHERE item.council_meeting=target_meeting),'[]'::jsonb),
    'votes', coalesce((SELECT jsonb_agg(to_jsonb(vote))
      FROM hall.votes vote JOIN hall.ballots ballot ON ballot.id = vote.ballot
      JOIN hall.council_agenda_item item ON item.id = ballot.council_agenda_item
      WHERE item.council_meeting = target_meeting), '[]'::jsonb)
  ) FROM hall.council_meetings meeting WHERE meeting.id = target_meeting;
$$;

CREATE FUNCTION hall.snapshot_council_meeting_opening()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  PERFORM hall.capture_council_meeting_snapshot(NEW.id, 'opening', NEW.started_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_meeting_capture_opening
AFTER UPDATE ON hall.council_meetings
FOR EACH ROW WHEN (OLD.started_at IS NULL AND NEW.started_at IS NOT NULL)
EXECUTE FUNCTION hall.snapshot_council_meeting_opening();

-- @functional-requirement HALL-FR-AGI-400 AGENDA_PRESENTATION_NUMBERS_ARE_CONTINUOUS:
-- Position is an ordering key, never the number shown to a reader. Closing
-- observations remain the source after carry-over moves working occurrences.
CREATE FUNCTION hall.council_agenda_presentation_numbers(target_meeting UUID)
RETURNS TABLE(agenda_item UUID, agenda_number INTEGER)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT id, row_number() OVER (ORDER BY abs(position), id)::INTEGER
  FROM (
    SELECT item.id, item.position FROM hall.council_agenda_item item
    WHERE item.council_meeting = target_meeting
      AND (item.position > 0 OR item.adjourned_at IS NOT NULL)
      AND NOT EXISTS (SELECT FROM hall.council_meeting_snapshot snapshot
        WHERE snapshot.council_meeting = target_meeting AND snapshot.phase = 'closing')
    UNION ALL
    SELECT (item->>'id')::UUID, (item->>'position')::INTEGER
    FROM hall.council_meeting_snapshot snapshot,
      LATERAL jsonb_array_elements(snapshot.payload->'agenda') item
    WHERE snapshot.council_meeting = target_meeting AND snapshot.phase = 'closing'
  ) presented;
$$;
