BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='proxy-registration-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- Written proxies registered before the opening of a meeting (CGCT L2121-20;
-- owner decision of 7 November 2026).
-- @verifies-requirement HALL-FR-ATT-190

UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
INSERT INTO council_meetings(id,number,scheduled_at,location)
VALUES(test_uuid('reg:meeting'),(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
SELECT test_ensure_council_member(test_uuid('reg:member:'||k)) FROM generate_series(1,5) k;
SELECT test_ensure_document_resource(test_uuid('reg:document:'||k)) FROM generate_series(1,3) k;
CREATE FUNCTION pg_temp.register(grantor INTEGER,holder INTEGER,document INTEGER)
RETURNS JSONB LANGUAGE sql AS $$
 SELECT hall_api.register_meeting_proxy(test_uuid('reg:meeting'),test_uuid('reg:member:'||grantor),
  test_uuid('reg:member:'||holder),test_uuid('reg:document:'||document));
$$;

CREATE TEMP TABLE first_registration AS SELECT pg_temp.register(1,2,1) payload;
SELECT is((SELECT (payload->'proxyRegistrations'->0)-'registeredAt' FROM first_registration),
 jsonb_build_object('id',(SELECT id FROM meeting_proxy_registration),
  'grantorCouncilMemberId',test_uuid('reg:member:1'),'holderCouncilMemberId',test_uuid('reg:member:2'),
  'proxyDocumentId',test_uuid('reg:document:1')),
 'a proxy is registered with its document, the member who gives it and the member who receives it');
SELECT is((SELECT registered_by FROM meeting_proxy_registration),'fixture-clerk','the registration keeps its author');
SELECT is((hall_api.meeting_conduct(test_uuid('reg:meeting'))->>'canRegisterProxies')::boolean,true,
 'proxies are registered while the meeting is not opened');
SELECT is((SELECT count(*)::int FROM meeting_attendance WHERE council_meeting=test_uuid('reg:meeting')),0,
 'a registered proxy is not an attendance');

SELECT throws_ok($$SELECT pg_temp.register(3,2,2)$$,'HV154',NULL,'a second proxy for the same holder is refused');
SELECT throws_ok($$SELECT pg_temp.register(1,3,2)$$,'HV155',NULL,'a second proxy of the same member is refused');
SELECT throws_ok($$SELECT pg_temp.register(3,4,1)$$,'HV157',NULL,'a document supports one proxy of the meeting');
SELECT throws_ok($$SELECT pg_temp.register(3,3,2)$$,'HV156',NULL,'a member cannot hold his own proxy');
UPDATE council_member SET term_ended_on='2025-12-31' WHERE id=test_uuid('reg:member:5');
SELECT throws_ok($$SELECT pg_temp.register(5,3,2)$$,'HV156',NULL,'a member out of mandate gives no proxy');
SELECT throws_ok($$SELECT pg_temp.register(3,5,2)$$,'HV156',NULL,'a member out of mandate receives no proxy');
SELECT throws_ok($$SELECT hall_api.register_meeting_proxy(test_uuid('reg:meeting'),test_uuid('reg:member:3'),
 test_uuid('reg:member:4'),NULL)$$,'23502',NULL,'the document is required');

SELECT lives_ok($$SELECT hall_api.change_meeting_proxy_registration(test_uuid('reg:meeting'),
 (SELECT id FROM meeting_proxy_registration),test_uuid('reg:member:1'),test_uuid('reg:member:3'),test_uuid('reg:document:2'))$$,
 'a registered proxy changes before the opening');
SELECT is((SELECT holder_member FROM meeting_proxy_registration),test_uuid('reg:member:3'),'the changed holder is kept');
SELECT lives_ok($$SELECT pg_temp.register(2,4,1)$$,'the former holder and document are free again');
SELECT lives_ok($$SELECT hall_api.withdraw_meeting_proxy_registration(test_uuid('reg:meeting'),
 (SELECT id FROM meeting_proxy_registration WHERE grantor_member=test_uuid('reg:member:2')))$$,
 'a registered proxy is withdrawn before the opening');
SELECT is(jsonb_array_length(hall_api.meeting_conduct(test_uuid('reg:meeting'))->'proxyRegistrations'),1,
 'the withdrawn proxy is no longer listed');
SELECT throws_ok($$SELECT hall_api.withdraw_meeting_proxy_registration(test_uuid('reg:meeting'),test_uuid('reg:unknown'))$$,
 'HV156',NULL,'an unknown registration is refused');

-- Once the meeting is opened the registrations are read only.
INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
SELECT test_uuid('reg:att:'||k),test_uuid('reg:member:'||k),test_uuid('reg:meeting'),'present' FROM generate_series(1,4) k;
SELECT test_confirm_declared_membership(test_uuid('reg:meeting'));
SELECT set_council_meeting_officers(test_uuid('reg:meeting'),test_uuid('reg:member:2'),test_uuid('reg:member:3'));
SELECT test_create_decision_agenda_item('reg:1',test_uuid('reg:meeting'),1);
SELECT test_prepare_notice(test_uuid('reg:meeting'));
SELECT start_council_meeting(test_uuid('reg:meeting'),'2026-01-01 09:00Z');
SELECT is((hall_api.meeting_conduct(test_uuid('reg:meeting'))->>'canRegisterProxies')::boolean,false,
 'an opened meeting registers no proxy');
SELECT is(jsonb_array_length(hall_api.meeting_conduct(test_uuid('reg:meeting'))->'proxyRegistrations'),1,
 'the registered proxies stay listed after the opening');
SELECT throws_ok($$SELECT pg_temp.register(2,4,3)$$,'HV153',NULL,'no proxy is registered after the opening');
SELECT throws_ok($$SELECT hall_api.withdraw_meeting_proxy_registration(test_uuid('reg:meeting'),
 (SELECT id FROM meeting_proxy_registration))$$,'HV153',NULL,'no proxy is withdrawn after the opening');
SELECT throws_ok($$TRUNCATE meeting_proxy_registration$$,'HV156',NULL,'registrations are not truncated');

SELECT * FROM finish();
ROLLBACK;
