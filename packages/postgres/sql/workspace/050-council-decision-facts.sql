-- This observation exists independently of the policy selecting documentary drafts.
-- It does not allocate a publication number or record publication/transmission.
-- @functional-requirement HALL-FR-DEC-010 CONFIRMED_PROPOSAL_FACTS_ARE_PRESERVED:
CREATE TABLE hall.council_decision_facts (
  ballot UUID PRIMARY KEY REFERENCES hall.ballots(id),
  facts JSONB NOT NULL CONSTRAINT "council_decision_facts_facts_check" CHECK (jsonb_typeof(facts) = 'object'::text)
);

CREATE FUNCTION hall.protect_council_decision_facts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='HV730', MESSAGE='confirmed decision facts are immutable';
END $$;
CREATE TRIGGER council_decision_facts_immutable BEFORE UPDATE OR DELETE ON hall.council_decision_facts
FOR EACH ROW EXECUTE FUNCTION hall.protect_council_decision_facts();
CREATE TRIGGER council_decision_facts_no_truncate BEFORE TRUNCATE ON hall.council_decision_facts
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_council_decision_facts();

CREATE FUNCTION hall.capture_council_decision_facts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE item hall.council_agenda_item; meeting hall.council_meetings; preview hall.ballot_result_preview;
  ballot_facts JSONB; observed_quorum JSONB;
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id=NEW.council_agenda_item;
  IF item.council_decision_proposal IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM hall.council_decision_proposal WHERE id=item.council_decision_proposal FOR UPDATE;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=item.council_meeting;
  SELECT * INTO STRICT preview FROM hall.ballot_result_preview WHERE id=NEW.result_preview;
  observed_quorum:=preview.quorum;
  ballot_facts:=jsonb_build_object('id',NEW.id,'mode',NEW.mode,'result',NEW.result);
  IF NEW.mode='public' THEN
    ballot_facts:=ballot_facts||jsonb_build_object(
      'votes',coalesce((SELECT jsonb_agg(jsonb_build_object('member',hall.minutes_member_identity(a.council_member),'choice',v.choice) ORDER BY a.id)
        FROM hall.votes v JOIN hall.ballot_participation p ON p.id=v.ballot_participation
        JOIN hall.meeting_attendance a ON a.id=p.meeting_attendance WHERE v.ballot=NEW.id),'[]'::jsonb),
      'nonParticipations',coalesce((SELECT jsonb_agg(jsonb_build_object('member',hall.minutes_member_identity(a.council_member),'reason',n.reason) ORDER BY a.id)
        FROM hall.ballot_non_participation n JOIN hall.ballot_participation p ON p.id=n.ballot_participation
        JOIN hall.meeting_attendance a ON a.id=p.meeting_attendance WHERE n.ballot=NEW.id),'[]'::jsonb));
  ELSE
    ballot_facts:=ballot_facts||jsonb_build_object('totals',preview.candidate->'totals');
  END IF;
  INSERT INTO hall.council_decision_facts(ballot,facts)
  SELECT NEW.id,jsonb_build_object(
    'proposal',jsonb_build_object('id',item.council_decision_proposal,'title',resource.name,'submittedText',text.content),
    'agendaItemId',item.id,'agendaNumber',(SELECT agenda_number FROM hall.council_agenda_presentation_numbers(meeting.id) WHERE agenda_item=item.id),
    -- @functional-requirement HALL-FR-DEC-060 DECISIONS_HAVE_AN_ORDER_WITHIN_THE_MEETING:
    'decisionNumber',(SELECT count(*)+1 FROM hall.council_decision_facts WHERE facts#>>'{meeting,id}'=meeting.id::text),
    'confirmedAt',NEW.completed_at,
    'meeting',jsonb_build_object('id',meeting.id,'number',meeting.number,'scheduledAt',meeting.scheduled_at,'startedAt',meeting.started_at,
      'chairRole',(SELECT role FROM hall.council_member WHERE id=meeting.chair_member),
      'location',meeting.location,'chair',hall.minutes_member_identity(meeting.chair_member),'secretary',hall.minutes_member_identity(meeting.secretary_member)),
    'attendance',coalesce((SELECT jsonb_agg(jsonb_build_object('member',hall.minutes_member_identity(a.council_member),
      'status',a.status,'proxyHolder',hall.minutes_member_identity(holder.council_member)) ORDER BY a.id)
      FROM hall.current_meeting_attendance(meeting.id) a LEFT JOIN hall.meeting_attendance holder ON holder.id=a.proxy_holder),'[]'::jsonb),
    'quorum',jsonb_build_object('memberCount',observed_quorum->'memberCount','denominator',observed_quorum->'denominator',
      'requiredPresent',observed_quorum->'requiredPresent','presentCount',observed_quorum->'presentCount','regime',observed_quorum->'regime','verdict',observed_quorum->'verdict'),
    'recusals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'member',hall.minutes_member_identity(r.council_member),
      'declaredAt',r.declared_at,'legalBasis',r.legal_basis) ORDER BY r.id) FROM hall.agenda_item_recusal r WHERE r.agenda_item=item.id),'[]'::jsonb),
    'ballot',ballot_facts)
  FROM hall.council_decision_proposal_workspace workspace JOIN hall.text_resource text ON text.id=workspace.text_resource
  JOIN hall.resource resource ON resource.id=text.id WHERE workspace.council_decision_proposal=item.council_decision_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV731',MESSAGE='confirmed proposal requires its submitted text'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ballot_capture_decision_facts AFTER UPDATE ON hall.ballots
FOR EACH ROW WHEN(OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION hall.capture_council_decision_facts();
