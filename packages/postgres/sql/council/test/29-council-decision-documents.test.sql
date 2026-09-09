BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='decision-clerk';
\ir support/helpers.sql
\ir support/quorum.sql
SELECT no_plan();
CREATE FUNCTION pg_temp.freeze_decision(id UUID,v INTEGER,pdf BYTEA) RETURNS JSONB LANGUAGE sql AS $$
 SELECT hall_api.freeze_council_decision(id,v,hall_api.open_council_decision(id)->>'number',
   (hall_api.open_council_decision(id)->>'documentDate')::date,pdf);
$$;
-- HALL-FR-DEC-020 HALL-FR-DEC-040 HALL-FR-DEC-050 HALL-FR-DEC-060 HALL-TR-DEC-010
SELECT pg_temp.quorum_case('document-decision',3,3);
SELECT test_prepare_notice(test_uuid('document-decision:meeting'));
SELECT start_council_meeting(test_uuid('document-decision:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('document-decision:a:agenda-item'),'2026-01-01 09:01Z');
SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(test_uuid('document-decision:a:agenda-item'),pg_temp.public_candidate('document-decision',3,2))->>'id')::uuid);
CREATE TEMP TABLE origin AS SELECT hall_api.open_council_decision(id) payload,(SELECT facts FROM hall.council_decision_facts WHERE ballot=d.ballot) raw_facts FROM hall.council_decision d;
SELECT is((SELECT count(*)::int FROM hall.council_decision),1,'adoption creates exactly one draft');
SELECT is((SELECT payload->>'state' FROM origin),'draft','confirmation does not freeze or publish');
SELECT is((SELECT payload#>>'{facts,decisionNumber}' FROM origin),'1','first decision has its own order within meeting');
SELECT is((SELECT payload->>'number' FROM origin),'2026-01-01','draft proposes the next monthly number');
-- HALL-FR-DEC-080
SELECT ok((SELECT payload#>>'{facts,meeting,chairRole}' IS NOT NULL FROM origin),'confirmation retains the actual chair role');
SELECT is((SELECT payload#>>'{facts,opening,quorum,verdict}' FROM origin),'met','opening quorum comes from its own historical observation');
UPDATE hall.council_member SET role='deputyMayor';
UPDATE hall.contact SET last_name='Changed after the vote';
SELECT is((SELECT hall_api.open_council_decision(id)->'facts' FROM hall.council_decision),(SELECT payload->'facts' FROM origin),'later directory changes cannot rewrite documentary identities or role');
SELECT throws_ok($$SELECT hall_api.update_council_decision_draft(test_uuid('missing'),1,'x')$$,'HV737',NULL,'unknown draft is refused');
SELECT throws_ok($$SELECT hall_api.update_council_decision_draft((SELECT id FROM hall.council_decision),2,'x')$$,'HV738',NULL,'stale draft write is refused');
SELECT hall_api.update_council_decision_draft((SELECT id FROM hall.council_decision),1,'Faithful editorial wording');
SELECT is((SELECT version FROM hall.council_decision),2,'editing increments the version');
SELECT is((SELECT facts FROM hall.council_decision_facts),(SELECT raw_facts FROM origin),'editing does not rewrite facts');
SELECT throws_ok($$UPDATE hall.council_decision SET id=test_uuid('other')$$,'HV733',NULL,'origin cannot be reassigned');
SELECT throws_ok($$DELETE FROM hall.council_decision$$,'HV732',NULL,'draft history cannot be removed');
SELECT throws_ok($$SELECT pg_temp.freeze_decision((SELECT id FROM hall.council_decision),1,convert_to('%PDF-old','UTF8'))$$,'HV738',NULL,'rendering an obsolete version cannot freeze');
SELECT throws_ok($$SELECT pg_temp.freeze_decision((SELECT id FROM hall.council_decision),2,convert_to('not-a-pdf','UTF8'))$$,'HV736',NULL,'invalid PDF is refused');
SELECT is((SELECT count(*)::int FROM hall.council_decision_document),0,'failed generation retains no document');
SELECT pg_temp.freeze_decision((SELECT id FROM hall.council_decision),2,convert_to('%PDF-final','UTF8'));
SELECT is((SELECT hall_api.open_council_decision(id)->>'state' FROM hall.council_decision),'frozen','explicit freeze conserves the document');
SELECT is((SELECT hall_api.open_council_decision(id)->>'number' FROM hall.council_decision),'2026-01-01','freeze retains its allocated documentary number');
SELECT is((SELECT decode(hall_api.council_decision_content(id)->>'contentBase64','base64') FROM hall.council_decision),convert_to('%PDF-final','UTF8'),'conserved bytes are exactly the rendered PDF');
SELECT throws_ok($$SELECT hall_api.update_council_decision_draft((SELECT id FROM hall.council_decision),2,'rewrite')$$,'HV734',NULL,'frozen wording is immutable');
SELECT lives_ok($$SELECT pg_temp.freeze_decision((SELECT id FROM hall.council_decision),2,convert_to('%PDF-new','UTF8'))$$,'retry is idempotent');
SELECT is((SELECT decode(hall_api.council_decision_content(id)->>'contentBase64','base64') FROM hall.council_decision),convert_to('%PDF-final','UTF8'),'retry cannot replace retained bytes');
SELECT throws_ok($$DELETE FROM hall.council_decision_document$$,'HV735',NULL,'retained PDF cannot be removed');
SELECT throws_ok($$UPDATE hall.council_decision_document SET frozen_at=clock_timestamp()$$,'HV735',NULL,'retained PDF metadata cannot be rewritten');
SELECT start_council_agenda_item(test_uuid('document-decision:b:agenda-item'),clock_timestamp());
SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(test_uuid('document-decision:b:agenda-item'),pg_temp.public_candidate('document-decision',3,0))->>'id')::uuid);
SELECT is((SELECT count(*)::int FROM hall.council_decision),2,'rejection also creates a documentary draft');
SELECT is((SELECT facts#>>'{decisionNumber}' FROM hall.council_decision_facts WHERE facts#>>'{ballot,result}'='reject'),'2','rejection follows the same order of decisions');
SELECT is((SELECT hall_api.open_council_decision(d.id)->>'state' FROM hall.council_decision d JOIN hall.council_decision_facts f ON f.ballot=d.ballot WHERE f.facts#>>'{ballot,result}'='reject'),'draft','rejected draft remains editable before freeze');
SELECT * FROM finish();
ROLLBACK;
