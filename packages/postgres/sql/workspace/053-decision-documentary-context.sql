-- @functional-requirement HALL-FR-DEC-080 DOCUMENTARY_ENVELOPE_USES_HISTORICAL_EVIDENCE:
-- Read-only enrichment from immutable evidence. Missing observations remain null;
-- no current HallSettings, directory identity or PDF generation date is an attestation.
CREATE FUNCTION hall.decision_documentary_facts(source JSONB)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT source || jsonb_build_object(
  'hall',(SELECT facts->'hall' FROM hall.meeting_notice WHERE council_meeting=(source#>>'{meeting,id}')::uuid
    AND generated_at<=(source->>'confirmedAt')::timestamptz ORDER BY generated_at DESC,id DESC LIMIT 1),
  'meeting',source->'meeting'||jsonb_build_object('chairRole',source#>'{meeting,chairRole}'),
  'opening',(SELECT jsonb_build_object(
    'attendance',(SELECT jsonb_agg(jsonb_build_object(
      'member',hall.decision_recovery_member(o.facts->'membersInOffice',(a->>'councilMemberId')::uuid),
      'status',a->>'status','proxyHolder',(SELECT hall.decision_recovery_member(o.facts->'membersInOffice',(holder->>'councilMemberId')::uuid)
        FROM jsonb_array_elements(o.facts->'attendance') holder WHERE holder->>'id'=a->>'proxyHolderAttendanceId')) ORDER BY a->>'id')
      FROM jsonb_array_elements(o.facts->'attendance') a),
    'quorum',jsonb_build_object('memberCount',o.facts->'memberCount','denominator',o.facts->'denominator',
      'requiredPresent',o.facts->'requiredPresent','presentCount',o.facts->'presentCount','regime',o.facts->'regime','verdict',o.facts->'verdict'))
    FROM hall.meeting_quorum_observation o WHERE o.council_meeting=(source#>>'{meeting,id}')::uuid
      AND o.agenda_item IS NULL AND o.observed_at=(source#>>'{meeting,startedAt}')::timestamptz
    ORDER BY o.recorded_at,o.id LIMIT 1));
$$;
CREATE OR REPLACE FUNCTION hall_api.open_council_decision(target_decision UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT hall.council_decision_summary(d)||jsonb_build_object('content',d.content,'facts',hall.decision_documentary_facts(f.facts))
 FROM hall.council_decision d JOIN hall.council_decision_facts f ON f.ballot=d.ballot WHERE d.id=target_decision;
$$;
