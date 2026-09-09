BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='numbering-clerk';
\ir support/helpers.sql
\ir support/quorum.sql
SELECT no_plan();
-- HALL-FR-DEC-090
SELECT pg_temp.quorum_case('numbering',3,3);
SELECT test_prepare_notice(test_uuid('numbering:meeting'));
SELECT start_council_meeting(test_uuid('numbering:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('numbering:a:agenda-item'),'2026-01-01 09:01Z');
SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(test_uuid('numbering:a:agenda-item'),pg_temp.public_candidate('numbering',3,2))->>'id')::uuid);
SELECT start_council_agenda_item(test_uuid('numbering:b:agenda-item'),clock_timestamp());
SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(test_uuid('numbering:b:agenda-item'),pg_temp.public_candidate('numbering',3,0))->>'id')::uuid);
CREATE TEMP TABLE drafts AS SELECT id,row_number() OVER(ORDER BY created_at,id) rank,hall_api.open_council_decision(id) payload FROM hall.council_decision;
SELECT is((SELECT count(DISTINCT payload->>'number')::int FROM drafts),1,'two drafts may show the same candidate');
SELECT is((SELECT payload->>'number' FROM drafts WHERE rank=1),'2026-01-01','index starts at one');
SELECT is((SELECT count(*)::int FROM hall.council_decision_number_counter),0,'reads never reserve or consume a number');
CREATE FUNCTION pg_temp.freeze_numbered(rank_number BIGINT,number TEXT,day DATE,pdf TEXT) RETURNS JSONB LANGUAGE sql AS $$
 SELECT hall_api.freeze_council_decision((SELECT id FROM drafts WHERE rank=rank_number),1,number,day,convert_to(pdf,'UTF8'));
$$;
SAVEPOINT rolled_back;
SELECT pg_temp.freeze_numbered(1,'2026-01-01',(SELECT(payload->>'documentDate')::date FROM drafts WHERE rank=1),'%PDF-2026-01-01');
ROLLBACK TO SAVEPOINT rolled_back;
SELECT is((SELECT count(*)::int FROM hall.council_decision_number_counter),0,'rollback restores the unconsumed monthly sequence');
SELECT is((SELECT count(*)::int FROM hall.council_decision_document),0,'rollback retains no partial document');
SELECT throws_ok($$SELECT pg_temp.freeze_numbered(1,'2026-01-01',(SELECT(payload->>'documentDate')::date-1 FROM drafts WHERE rank=1),'%PDF-old-date')$$,'HV743',NULL,'a preview from the previous day must be rendered again');
SELECT is((SELECT count(*)::int FROM hall.council_decision_number_counter),0,'stale date does not consume index');
SELECT throws_ok($$SELECT pg_temp.freeze_numbered(1,'2026-01-01',(SELECT(payload->>'documentDate')::date FROM drafts WHERE rank=1),'invalid')$$,'HV736',NULL,'failed PDF validation rolls back allocation');
SELECT is((SELECT count(*)::int FROM hall.council_decision_number_counter),0,'invalid PDF does not consume index');
SELECT pg_temp.freeze_numbered(1,'2026-01-01',(SELECT(payload->>'documentDate')::date FROM drafts WHERE rank=1),'%PDF-2026-01-01');
SELECT throws_ok($$SELECT pg_temp.freeze_numbered(2,'2026-01-01',(SELECT(payload->>'documentDate')::date FROM drafts WHERE rank=2),'%PDF-old-number')$$,'HV743',NULL,'another freeze between preview and save invalidates candidate');
SELECT is((SELECT last_index FROM hall.council_decision_number_counter),1,'stale candidate does not leave a gap');
SELECT is(hall_api.open_council_decision((SELECT id FROM drafts WHERE rank=2))->>'number','2026-01-02','remaining draft now previews the next index');
SELECT pg_temp.freeze_numbered(2,'2026-01-02',(SELECT(payload->>'documentDate')::date FROM drafts WHERE rank=2),'%PDF-2026-01-02');
SELECT is((SELECT count(DISTINCT number)::int FROM hall.council_decision_document),2,'allocated documentary numbers are unique');
SELECT is((SELECT last_index FROM hall.council_decision_number_counter),2,'index follows without gaps');
SELECT pg_temp.freeze_numbered(1,'ignored-on-retry','2000-01-01','%PDF-never-replace');
SELECT is((SELECT last_index FROM hall.council_decision_number_counter),2,'successful retry does not allocate again');
SELECT is((SELECT decode(hall_api.council_decision_content(id)->>'contentBase64','base64') FROM drafts WHERE rank=1),convert_to('%PDF-2026-01-01','UTF8'),'retry preserves exact PDF and number');
SELECT ok((SELECT bool_and(document_date=hall.decision_document_date(f.facts,d.frozen_at)) FROM hall.council_decision_document d JOIN hall.council_decision c ON c.id=d.council_decision JOIN hall.council_decision_facts f ON f.ballot=c.ballot),'document date matches the actual freeze day in its historical time zone');
SELECT is(hall.next_decision_number(jsonb_set((SELECT facts FROM hall.council_decision_facts LIMIT 1),'{meeting,startedAt}','"2026-02-01T09:00:00Z"')),'2026-02-01','new month starts at one');
SELECT is(hall.next_decision_number(jsonb_set((SELECT facts FROM hall.council_decision_facts LIMIT 1),'{meeting,startedAt}','"2027-01-01T09:00:00Z"')),'2027-01-01','January of next year starts at one');
SELECT is(hall.format_decision_number('2026-01-01',100),'2026-01-100','indices above 99 are never truncated');
SELECT * FROM finish();
ROLLBACK;
