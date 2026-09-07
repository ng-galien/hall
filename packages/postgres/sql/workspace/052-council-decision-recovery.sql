-- Controlled recovery uses retained evidence, never today's directory or attendance.
CREATE TABLE hall.council_decision_recovery (
  ballot UUID PRIMARY KEY REFERENCES hall.council_decision_facts(ballot),
  council_meeting UUID NOT NULL,
  snapshot_phase TEXT NOT NULL DEFAULT 'closing' CHECK(snapshot_phase='closing'),
  result_preview UUID NOT NULL REFERENCES hall.ballot_result_preview(id),
  recovered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recovered_by TEXT NOT NULL,
  FOREIGN KEY(council_meeting,snapshot_phase) REFERENCES hall.council_meeting_snapshot(council_meeting,phase)
);
CREATE TRIGGER council_decision_recovery_immutable BEFORE UPDATE OR DELETE ON hall.council_decision_recovery
FOR EACH ROW EXECUTE FUNCTION hall.protect_council_decision_facts();
CREATE TRIGGER council_decision_recovery_no_truncate BEFORE TRUNCATE ON hall.council_decision_recovery
FOR EACH STATEMENT EXECUTE FUNCTION hall.protect_council_decision_facts();

CREATE FUNCTION hall.decision_recovery_member(members JSONB,target_member UUID)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',entry->>'councilMemberId','name',entry->>'name')
 FROM jsonb_array_elements(members) entry WHERE entry->>'councilMemberId'=target_member::text;
$$;

-- @functional-requirement HALL-FR-DEC-070 HISTORICAL_DECISION_RECOVERY_USES_RETAINED_EVIDENCE:
CREATE FUNCTION hall.recover_council_decision(target_ballot UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,hall AS $$
DECLARE b hall.ballots; item hall.council_agenda_item; snapshot hall.council_meeting_snapshot;
  preview hall.ballot_result_preview; existing_id UUID; proposal_text JSONB; resource JSONB;
  meeting JSONB; members JSONB; attendance JSONB; ballot_facts JSONB; recovered JSONB; ordinal INTEGER;
BEGIN
 SELECT id INTO existing_id FROM hall.council_decision WHERE ballot=target_ballot;
 IF FOUND THEN RETURN hall_api.open_council_decision(existing_id); END IF;
 SELECT * INTO b FROM hall.ballots WHERE id=target_ballot;
 SELECT * INTO item FROM hall.council_agenda_item WHERE id=b.council_agenda_item;
 IF b.completed_at IS NULL OR b.result_preview IS NULL OR item.council_decision_proposal IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='HV742',MESSAGE='recovery requires a confirmed proposal ballot';
 END IF;
 PERFORM 1 FROM hall.council_meetings WHERE id=item.council_meeting FOR UPDATE;
 SELECT id INTO existing_id FROM hall.council_decision WHERE ballot=target_ballot;
 IF FOUND THEN RETURN hall_api.open_council_decision(existing_id); END IF;
 SELECT * INTO snapshot FROM hall.council_meeting_snapshot WHERE council_meeting=item.council_meeting AND phase='closing';
 SELECT * INTO preview FROM hall.ballot_result_preview WHERE id=b.result_preview;
 IF snapshot.payload IS NULL OR preview.candidate IS DISTINCT FROM hall.ballot_candidate_from_rows(b.id)
   OR preview.calculation->>'result' IS DISTINCT FROM b.result::text
   OR NOT EXISTS(SELECT FROM jsonb_array_elements(snapshot.payload->'ballots') entry
     WHERE entry->>'id'=b.id::text AND entry->>'result'=b.result::text AND (entry->>'completed_at')::timestamptz=b.completed_at) THEN
   RAISE EXCEPTION USING ERRCODE='HV742',MESSAGE='recovery requires matching closing snapshot and confirmed review';
 END IF;
 SELECT entry INTO proposal_text FROM jsonb_array_elements(snapshot.payload->'proposals') entry WHERE entry->>'id'=item.council_decision_proposal::text;
 SELECT entry->'resource' INTO resource FROM jsonb_array_elements(snapshot.payload->'documents') entry
 WHERE entry#>>'{resource,id}'=(SELECT text_resource::text FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=item.council_decision_proposal);
 IF proposal_text->>'content' IS NULL OR resource->>'name' IS NULL OR resource->>'content' IS DISTINCT FROM proposal_text->>'content'
   OR NOT EXISTS(SELECT FROM hall.proposal_text_seal WHERE council_decision_proposal=item.council_decision_proposal AND ballot=b.id AND sealed_at<=b.completed_at) THEN
   RAISE EXCEPTION USING ERRCODE='HV742',MESSAGE='recovery requires the retained sealed proposal title and text';
 END IF;
 meeting:=snapshot.payload->'meeting'; members:=preview.quorum->'membersInOffice'; attendance:=preview.quorum->'attendance';
 IF jsonb_typeof(members) IS DISTINCT FROM 'array' OR jsonb_typeof(attendance) IS DISTINCT FROM 'array'
   OR NOT preview.quorum ?& ARRAY['memberCount','denominator','requiredPresent','presentCount','regime','verdict']
   OR hall.decision_recovery_member(members,(meeting->>'chair_member')::uuid) IS NULL
   OR hall.decision_recovery_member(members,(meeting->>'secretary_member')::uuid) IS NULL
   OR EXISTS(SELECT FROM jsonb_array_elements(attendance) a WHERE hall.decision_recovery_member(members,(a->>'councilMemberId')::uuid) IS NULL
      OR (a->>'proxyHolderAttendanceId' IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(attendance) holder WHERE holder->>'id'=a->>'proxyHolderAttendanceId'))) THEN
   RAISE EXCEPTION USING ERRCODE='HV742',MESSAGE='recovery requires retained member identities officers attendance and quorum';
 END IF;
 SELECT count(*)::integer INTO ordinal FROM jsonb_array_elements(snapshot.payload->'ballots') ballot
 JOIN jsonb_array_elements(snapshot.payload->'agenda') agenda ON agenda->>'id'=ballot->>'council_agenda_item'
 WHERE agenda->>'council_decision_proposal' IS NOT NULL AND ballot->>'completed_at' IS NOT NULL
 AND ((ballot->>'completed_at')::timestamptz,(ballot->>'id')::uuid)<=(b.completed_at,b.id);
 IF ordinal<1 OR EXISTS(SELECT FROM hall.council_decision_facts WHERE facts#>>'{meeting,id}'=item.council_meeting::text AND (facts->>'decisionNumber')::integer=ordinal) THEN
   RAISE EXCEPTION USING ERRCODE='HV742',MESSAGE='recovery cannot infer a unique retained decision order';
 END IF;
 ballot_facts:=jsonb_build_object('id',b.id,'mode',b.mode,'result',b.result);
 IF b.mode='secret' THEN ballot_facts:=ballot_facts||jsonb_build_object('totals',preview.candidate->'totals');
 ELSE
   ballot_facts:=ballot_facts||jsonb_build_object(
     'votes',(SELECT coalesce(jsonb_agg(jsonb_build_object('member',hall.decision_recovery_member(members,(a->>'councilMemberId')::uuid),'choice',v->>'choice')),'[]'::jsonb)
       FROM jsonb_array_elements(preview.candidate->'votes') v JOIN jsonb_array_elements(attendance) a ON a->>'id'=v->>'meetingAttendanceId'),
     'nonParticipations',(SELECT coalesce(jsonb_agg(jsonb_build_object('member',hall.decision_recovery_member(members,(a->>'councilMemberId')::uuid),'reason',n->>'reason')),'[]'::jsonb)
       FROM jsonb_array_elements(preview.candidate->'nonParticipations') n JOIN jsonb_array_elements(attendance) a ON a->>'id'=n->>'meetingAttendanceId'));
 END IF;
 recovered:=jsonb_build_object(
  'proposal',jsonb_build_object('id',item.council_decision_proposal,'title',resource->>'name','submittedText',proposal_text->>'content'),
  'agendaItemId',item.id,'agendaNumber',(SELECT agenda_number FROM hall.council_agenda_presentation_numbers(item.council_meeting) WHERE agenda_item=item.id),
  'decisionNumber',ordinal,'confirmedAt',b.completed_at,
  'meeting',jsonb_build_object('id',meeting->>'id','number',(meeting->>'number')::integer,'scheduledAt',meeting->>'scheduled_at','startedAt',meeting->>'started_at','location',meeting->>'location',
    'chair',hall.decision_recovery_member(members,(meeting->>'chair_member')::uuid),'secretary',hall.decision_recovery_member(members,(meeting->>'secretary_member')::uuid)),
  'attendance',(SELECT jsonb_agg(jsonb_build_object('member',hall.decision_recovery_member(members,(a->>'councilMemberId')::uuid),'status',a->>'status',
    'proxyHolder',(SELECT hall.decision_recovery_member(members,(holder->>'councilMemberId')::uuid) FROM jsonb_array_elements(attendance) holder WHERE holder->>'id'=a->>'proxyHolderAttendanceId')) ORDER BY a->>'id') FROM jsonb_array_elements(attendance) a),
  'quorum',jsonb_build_object('memberCount',preview.quorum->'memberCount','denominator',preview.quorum->'denominator','requiredPresent',preview.quorum->'requiredPresent','presentCount',preview.quorum->'presentCount','regime',preview.quorum->'regime','verdict',preview.quorum->'verdict'),
  'recusals',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','member',jsonb_build_object('id',r->>'councilMemberId','name',r->>'memberName'),'declaredAt',r->>'declaredAt','legalBasis',r->>'legalBasis')),'[]'::jsonb)
    FROM jsonb_array_elements(snapshot.payload->'recusals') r WHERE r->>'agendaItemId'=item.id::text AND (r->>'recordedAt')::timestamptz<=b.completed_at),
  'ballot',ballot_facts);
 INSERT INTO hall.council_decision_facts(ballot,facts) VALUES(b.id,recovered);
 INSERT INTO hall.council_decision_recovery(ballot,council_meeting,result_preview,recovered_by)
 VALUES(b.id,item.council_meeting,preview.id,nullif(current_setting('hall.actor_id',true),''));
 SELECT id INTO existing_id FROM hall.council_decision WHERE ballot=b.id;
 RETURN hall_api.open_council_decision(existing_id);
END $$;
