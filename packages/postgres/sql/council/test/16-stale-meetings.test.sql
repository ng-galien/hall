BEGIN;
\ir support/helpers.sql
SELECT no_plan();
-- TODO REMOVE_STALE: temporary succession acceptance, remove with the marker.
CREATE TEMP TABLE stale_fixture AS SELECT hall_api.provision_initial_council_meeting() AS first;
ALTER TABLE stale_fixture ADD COLUMN transition jsonb;
UPDATE stale_fixture SET transition=hall_api.mark_council_meeting_stale((first->>'id')::uuid);
SELECT ok((transition#>>'{staleMeeting,stale}')::boolean,'previous meeting is stale') FROM stale_fixture;
SELECT is(transition#>'{staleMeeting,closedAt}','null'::jsonb,'stale is not closure') FROM stale_fixture;
SELECT is((SELECT count(*)::int FROM minutes),0,'no provisional minutes fabricated');
SELECT is((SELECT count(*)::int FROM council_agenda_item),0,'no minutes approval fabricated');
SELECT is((SELECT count(*)::int FROM ballots),0,'no votes fabricated');
SELECT is(hall_api.mark_council_meeting_stale((first->>'id')::uuid)#>>'{nextMeeting,id}',transition#>>'{nextMeeting,id}','repeated action reuses successor') FROM stale_fixture;
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE','one active successor satisfies deferred invariants');
SELECT throws_ok($$INSERT INTO council_meetings(id,number) VALUES(test_uuid('stale:second-active'),99)$$,'23505',NULL,'second active meeting rejected');
SET CONSTRAINTS ALL DEFERRED;
SELECT lives_ok($$SELECT hall_api.mark_council_meeting_stale((transition#>>'{nextMeeting,id}')::uuid) FROM stale_fixture$$,'another stale meeting can precede next active');
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE','chain with multiple stale predecessors remains valid');
SELECT is((SELECT count(*)::int FROM council_meetings WHERE stale),2,'multiple stale meetings retained');
SELECT is((SELECT count(*)::int FROM council_meetings WHERE closed_at IS NULL AND NOT stale),1,'only one active meeting');
SELECT is((SELECT count(*)::int FROM council_meetings WHERE closed_at IS NOT NULL),0,'marking does not close any meeting');
SELECT * FROM finish();
ROLLBACK;
