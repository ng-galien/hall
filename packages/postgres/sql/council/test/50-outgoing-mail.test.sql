-- @verifies-requirement HALL-FR-EML-010
-- @verifies-requirement HALL-FR-EML-040
-- @verifies-requirement HALL-FR-EML-050
-- @verifies-requirement HALL-FR-EML-060
BEGIN;
SET LOCAL search_path=hall,public;
SELECT no_plan();
SELECT set_config('hall.request_id',gen_random_uuid()::text,true);
SELECT set_config('hall.action','mail.create',true);
SELECT set_config('hall.roles','["administrator"]',true);
SELECT set_config('hall.actor_id',hall_api.create_app_user('mail-test@example.test','Mail tester','unused',NULL,ARRAY['administrator'])->>'id',true);
CREATE TEMP TABLE mail_fixture (message JSONB, submission JSONB);
INSERT INTO mail_fixture(message) SELECT hall_api.create_mail('{"subject":"Subject","bodyMarkdown":"Body","recipients":[{"kind":"to","name":"Member","address":"member@example.test","contactId":null}]}');
SELECT is((SELECT (message->>'revision')::int FROM mail_fixture),1,'new shared draft starts at revision one');
SELECT is(jsonb_array_length(hall_api.list_mail()),1,'shared mailbox lists its draft');
SELECT is((SELECT message->>'createdBy' FROM mail_fixture),current_setting('hall.actor_id'),'draft records its creator');
SELECT throws_ok(format('SELECT hall_api.update_mail(%L::uuid,999,%L::jsonb)',(SELECT message->>'id' FROM mail_fixture),'{"subject":"lost","bodyMarkdown":"lost","recipients":[]}'),'HV850','Mail draft has changed','stale save cannot overwrite another revision');
SELECT throws_ok(format('SELECT hall_api.attach_mail_file(%L::uuid,1,%L,%L,decode(repeat(%L,50*1024*1024+1),%L),NULL)',(SELECT message->>'id' FROM mail_fixture),'large.bin','application/octet-stream','aa','hex'),'HV852','Mail attachments exceed 50 MiB','oversized attachments have a distinct error');
UPDATE mail_fixture SET message=hall_api.attach_mail_file((message->>'id')::uuid,1,'dossier.pdf','application/pdf',convert_to('old PDF','UTF8'),NULL);
SELECT is((SELECT (message->>'revision')::int FROM mail_fixture),2,'attachment advances the reviewed revision');
UPDATE mail_fixture SET submission=hall_api.begin_mail_submission((message->>'id')::uuid,2,'00000000-0000-4000-8000-000000000001','{"subject":"Subject"}');
SELECT is((SELECT (submission->>'created')::boolean FROM mail_fixture),true,'first submission claim is admitted');
SELECT is((SELECT (hall_api.begin_mail_submission((message->>'id')::uuid,2,'00000000-0000-4000-8000-000000000001','{"subject":"Subject"}')->>'created')::boolean FROM mail_fixture),false,'same request key does not create a second attempt');
SELECT throws_ok(format('SELECT hall_api.begin_mail_submission(%L::uuid,2,%L::uuid,%L::jsonb)',(SELECT message->>'id' FROM mail_fixture),'00000000-0000-4000-8000-000000000002','{}'),'HV851','Mail submission blocks draft changes','new request key cannot bypass an active send');
SELECT throws_ok(format('UPDATE hall.mail_submission SET payload=%L::jsonb WHERE id=%L::uuid','{}',(SELECT submission#>>'{submission,id}' FROM mail_fixture)),'23000','Mail submission payload is immutable','attempt content cannot change');
SELECT is((SELECT convert_from(b.content,'UTF8') FROM hall.mail_submission_attachment a JOIN hall.binary_object b ON b.id=a.binary_object_id),'old PDF','submission references the exact attachment bytes');
SELECT hall_api.finish_mail_submission((SELECT (submission#>>'{submission,id}')::uuid FROM mail_fixture),'unknown','outlook_submission_uncertain');
SELECT throws_ok(format('SELECT hall_api.update_mail(%L::uuid,2,%L::jsonb)',(SELECT message->>'id' FROM mail_fixture),'{"subject":"again","bodyMarkdown":"again","recipients":[]}'),'HV851','Mail submission blocks draft changes','uncertain result requires verification');
SELECT throws_ok(format('SELECT hall_api.verify_mail_submission(%L::uuid,%L,%L)',(SELECT submission#>>'{submission,id}' FROM mail_fixture),'not-sent',''),'23000','Outlook verification is unavailable or incomplete','verification requires a recorded check');
SELECT hall_api.verify_mail_submission((SELECT (submission#>>'{submission,id}')::uuid FROM mail_fixture),'not-sent','Checked both Sent Items and Outbox in Outlook');
UPDATE mail_fixture SET message=hall_api.update_mail((message->>'id')::uuid,2,'{"subject":"Corrected","bodyMarkdown":"Body","recipients":[]}');
SELECT is((SELECT (message->>'revision')::int FROM mail_fixture),3,'verified absence allows editing again');
SELECT is((SELECT count(*)::int FROM hall.mail_submission),1,'verification preserves the uncertain attempt');
SELECT set_config('hall.roles','["contributor"]',true);
SELECT ok(hall.allows('mail.create'),'contributor can create');
SELECT ok(hall.allows('mail.update'),'contributor can edit shared drafts');
SELECT ok(NOT hall.allows('mail.send'),'contributor cannot send initially');
SELECT ok(NOT hall.allows('mail.delete'),'contributor cannot delete initially');
SELECT throws_ok(format('SELECT hall_api.begin_mail_submission(%L::uuid,3,%L::uuid,%L::jsonb)',(SELECT message->>'id' FROM mail_fixture),'00000000-0000-4000-8000-000000000002','{}'),'42501','Mail action is not authorized','SQL also rejects unauthorized sending');
SELECT set_config('hall.roles','["clerk"]',true);
SELECT ok(hall.allows('mail.send'),'clerk can send initially');
SELECT ok(hall.allows('mail-group.create'),'clerk can manage groups initially');
SELECT ok(EXISTS(SELECT FROM hall_meta.data_migration WHERE name='mail-authorization-defaults'),'fresh installation records initialized defaults');
DELETE FROM hall.authorization_grant WHERE role='clerk' AND access='mail.send';
\ir ../../migrations/008-mail-authorization-defaults.sql
SELECT ok(NOT hall.allows('mail.send'),'later upgrades preserve a revoked send grant');
DELETE FROM hall_meta.data_migration WHERE name='mail-authorization-defaults';
\ir ../../migrations/008-mail-authorization-defaults.sql
SELECT ok(hall.allows('mail.send'),'upgrade of an older installation adds the new defaults once');
SELECT * FROM finish();
ROLLBACK;
