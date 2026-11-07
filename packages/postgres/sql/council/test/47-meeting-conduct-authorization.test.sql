BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='conduct-authorization';
\ir support/helpers.sql
SELECT no_plan();
\ir support/quorum.sql

CREATE FUNCTION pg_temp.act_as(roles TEXT, contact UUID DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('hall.roles', roles, true), set_config('hall.contact_id', coalesce(contact::TEXT, ''), true);
$$;

-- 1. The role matrix, delivered with the schema, read back through the single predicate.
-- @verifies-requirement HALL-FR-DOC-350
-- @verifies-requirement HALL-FR-USR-030
-- @verifies-requirement HALL-FR-USR-040
-- @verifies-requirement HALL-FR-USR-050
-- @verifies-requirement HALL-TR-CTX-030
SELECT is((SELECT count(*)::int FROM hall.action_access), (SELECT count(DISTINCT action)::int FROM hall.action_access),
  'every action belongs to exactly one access');
SELECT is((SELECT count(*)::int FROM hall.action_access mapping WHERE NOT EXISTS (SELECT FROM hall.access a WHERE a.access = mapping.access)),
  0, 'every action access is in the access catalogue');
SELECT set_eq($$SELECT action, access FROM hall.action_access$$, $$VALUES
 ('application.read','read'),
 ('application.export','export'),
 ('role.list','authorization.manage'),
 ('role.create','authorization.manage'),
 ('role.update','authorization.manage'),
 ('role.delete','authorization.manage'),
 ('resource.search-legal-references','read'),
 ('template.preview','read'),
 ('template.preview-pdf','read'),
 ('resource.convert-spreadsheet-table','read'),
 ('council-business.export-bundle','export'),
 ('template.generate','export'),
 ('resource.generate-event-invitation','export'),
 ('meeting.generate-dossier','export'),
 ('session.logout','session'),
 ('session.change-password','session'),
 ('session.bootstrap','installation'),
 ('contact.create','contact.manage'),
 ('contact.update','contact.manage'),
 ('contact.archive','contact.manage'),
 ('member.create','member.manage'),
 ('member.update','member.manage'),
 ('council-term.configure','council-term.configure'),
 ('delegation.create','delegation.manage'),
 ('delegation.update','delegation.manage'),
 ('delegation.archive','delegation.manage'),
 ('delegation.add-membership','delegation.manage'),
 ('delegation.update-membership','delegation.manage'),
 ('delegation.end-membership','delegation.manage'),
 ('committee.create','committee.manage'),
 ('committee.update','committee.manage'),
 ('committee.archive','committee.manage'),
 ('committee.add-membership','committee.manage'),
 ('committee.update-membership','committee.manage'),
 ('committee.end-membership','committee.manage'),
 ('council-business.create','council-business.write'),
 ('council-business.create-prepared-subject','council-business.write'),
 ('council-business.import-bundle','council-business.write'),
 ('council-business.associate-committee','council-business.write'),
 ('council-business.dissociate-committee','council-business.write'),
 ('council-business.associate-resource','council-business.write'),
 ('council-business.dissociate-resource','council-business.write'),
 ('council-business.reorder-resources','council-business.write'),
 ('council-business.move-subject','council-business.write'),
 ('council-business.merge','council-business.delete'),
 ('council-business.delete','council-business.delete'),
 ('resource.create','common-resource.write'),
 ('resource.create-document','common-resource.write'),
 ('resource.import-spreadsheet','common-resource.write'),
 ('resource.import-geographic-layer','common-resource.write'),
 ('resource.create-editor-asset','common-resource.write'),
 ('resource.relocate','common-resource.write'),
 ('resource.update-metadata','common-resource.write'),
 ('resource.update-content','common-resource.write'),
 ('resource.replace-document-content','common-resource.write'),
 ('resource.link-geographic-layer','common-resource.write'),
 ('resource.unlink-geographic-layer','common-resource.write'),
 ('resource.create-geographic-feature-note','common-resource.write'),
 ('resource.resolve-legal-reference','common-resource.write'),
 ('resource.refresh-legal-reference','common-resource.write'),
 ('resource.delete','common-resource.delete'),
 ('personal-workspace.create','personal-workspace.manage'),
 ('personal-workspace.restructure','personal-workspace.manage'),
 ('template.create','template.write'),
 ('template.update','template.write'),
 ('template.delete','template.delete'),
 ('meeting.provision-initial','meeting.prepare'),
 ('meeting.schedule','meeting.prepare'),
 ('meeting.prepare','meeting.prepare'),
 ('meeting.set-officers','meeting.prepare'),
 ('meeting.create-and-schedule-business','meeting.prepare'),
 ('meeting.reorder-agenda','meeting.prepare'),
 ('meeting.reopen-agenda','meeting.prepare'),
 ('meeting.reset-agenda-revision','meeting.prepare'),
 ('meeting.generate-notice','meeting.prepare'),
 ('meeting.generate-notice-message','meeting.prepare'),
 ('agenda-item.schedule','agenda-item.prepare'),
 ('agenda-item.schedule-prepared','agenda-item.prepare'),
 ('agenda-item.deprogram','agenda-item.prepare'),
 ('agenda-item.reprogram','agenda-item.prepare'),
 ('council-business.schedule-decision-proposal','agenda-item.prepare'),
 ('council-business.schedule-open-question','agenda-item.prepare'),
 ('decision.update-draft','decision.draft'),
 ('decision.freeze','decision.draft'),
 ('minutes.update-draft','minutes.draft'),
 ('minutes.generate','minutes.draft'),
 ('meeting.record-attendance','meeting.conduct'),
 ('meeting.record-attendance-events','meeting.conduct'),
 ('meeting.record-quorum','meeting.conduct'),
 ('meeting.record-reconvocation','meeting.conduct'),
 ('meeting.record-opening','meeting.conduct'),
 ('meeting.add-open-question','meeting.conduct'),
 ('meeting.close','meeting.conduct'),
 ('meeting.mark-stale','meeting.conduct'),
 ('meeting.record-officer-change','meeting.conduct'),
 ('meeting.declare-auxiliary-attendance','meeting.conduct'),
 ('meeting.correct-auxiliary-attendance','meeting.conduct'),
 ('meeting.record-closed-session','meeting.conduct'),
 ('agenda-item.start','agenda-item.conduct'),
 ('agenda-item.complete','agenda-item.conduct'),
 ('agenda-item.adjourn','agenda-item.conduct'),
 ('agenda-item.record-recusal','agenda-item.conduct'),
 ('agenda-item.update-notes','agenda-item.conduct'),
 ('ballot.preview','ballot.record'),
 ('ballot.confirm','ballot.record'),
 ('user.list','user.list'),
 ('user.create','user.manage'),
 ('user.update','user.manage'),
 ('user.reset-password','user.manage'),
 ('user.disable','user.manage'),
 ('user.revoke-access','user.manage'),
 ('user.reactivate','user.manage'),
 ('user.generate-passphrase','user.manage'),
 ('user.assign-role','user.manage'),
 ('settings.update','settings.manage'),
 ('resource.import-municipal-property','settings.manage'),
 ('audit-event.list','audit.read')$$, 'each action is attached to the access of its line in the role matrix');
SELECT set_eq($$SELECT DISTINCT role FROM hall.role_access$$, $$VALUES ('administrator'),('clerk'),('contributor'),('councillor')$$,
  'the matrix knows four roles');
CREATE TEMP TABLE expected(role TEXT, action TEXT, allowed BOOLEAN);
INSERT INTO expected VALUES
 ('administrator','user.create',true),('clerk','user.create',false),('contributor','user.create',false),('councillor','user.create',false),
 ('administrator','user.list',true),('clerk','user.list',true),('contributor','user.list',false),('councillor','user.list',false),
 ('administrator','audit-event.list',true),('clerk','audit-event.list',true),('contributor','audit-event.list',false),('councillor','audit-event.list',false),
 ('administrator','council-business.delete',true),('clerk','council-business.delete',true),('contributor','council-business.delete',false),('councillor','council-business.delete',false),
 ('administrator','council-business.create',true),('clerk','council-business.create',true),('contributor','council-business.create',true),('councillor','council-business.create',false),
 ('administrator','template.update',true),('clerk','template.update',true),('contributor','template.update',false),('councillor','template.update',false),
 ('administrator','template.delete',true),('clerk','template.delete',true),('contributor','template.delete',false),('councillor','template.delete',false),
 ('administrator','settings.update',true),('clerk','settings.update',true),('contributor','settings.update',false),('councillor','settings.update',false),
 ('administrator','council-term.configure',true),('clerk','council-term.configure',true),('contributor','council-term.configure',false),('councillor','council-term.configure',false),
 ('clerk','resource.import-municipal-property',true),('contributor','resource.import-municipal-property',false),
 ('administrator','contact.create',true),('clerk','contact.create',true),('contributor','contact.create',false),('councillor','contact.create',false),
 ('clerk','meeting.prepare',true),('contributor','meeting.prepare',false),('councillor','meeting.prepare',false),
 ('clerk','minutes.generate',true),('contributor','minutes.generate',false),
 ('administrator','template.generate',true),('clerk','template.generate',true),('contributor','template.generate',true),('councillor','template.generate',true),
 ('councillor','council-business.export-bundle',true),('councillor','meeting.generate-dossier',true),
 ('councillor','session.change-password',true),('contributor','session.change-password',true),
 ('administrator','session.bootstrap',false),('administrator','unknown.action',false);
SELECT is((SELECT count(*)::int FROM expected e WHERE (SELECT pg_temp.act_as(jsonb_build_array(e.role)::text)) IS NOT NULL
  AND hall.allows(e.action) IS DISTINCT FROM e.allowed), 0, 'each role receives exactly the expected representative actions');
SELECT pg_temp.act_as('["contributor"]');
SELECT ok(hall.allows('resource.update-content', '{"location":"Commun/Note"}') AND NOT hall.allows('resource.delete', '{"location":"Commun/Note"}'),
  'a contributor writes but does not delete in the common workspace');
SELECT pg_temp.act_as('["clerk"]');
SELECT ok(hall.allows('resource.delete', '{"location":"Commun/Note"}'), 'the secretariat deletes in the common workspace');
SELECT pg_temp.act_as('[]');
SELECT is(hall_api.allowed_actions(), '[]'::jsonb, 'an account without role is allowed nothing');

-- 2. The database no longer hard-codes an administrator check nor reads computed permissions.
SELECT hasnt_function('hall', 'is_administrator', 'hall.is_administrator is removed');
SELECT hasnt_function('hall', 'has_permission', ARRAY['text'], 'hall.has_permission is removed');

-- 3. Meeting conduct follows the chair and the secretary in office.
-- @verifies-requirement HALL-FR-USR-030
SELECT pg_temp.quorum_case('conduct',3,3);
SELECT set_council_meeting_officers(test_uuid('conduct:meeting'),test_uuid('conduct:member:1'),test_uuid('conduct:member:2'));
SELECT pg_temp.act_as('["councillor"]', test_uuid('conduct:member:1'));
SELECT ok(hall.allows('meeting.record-opening', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'the account of the chair conducts the meeting');
SELECT ok(NOT hall.allows('meeting.record-opening'), 'conduct without a meeting target is refused');
SELECT pg_temp.act_as('["contributor"]', test_uuid('conduct:member:2'));
SELECT ok(hall.allows('ballot.preview', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'the account of the secretary records a ballot');
SELECT pg_temp.act_as('["clerk"]', test_uuid('conduct:member:3'));
SELECT ok(NOT hall.allows('agenda-item.start', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'the secretariat does not conduct a meeting where it is not an officer');
SELECT ok(NOT hall_api.allowed_actions(jsonb_build_object('meetingId', test_uuid('conduct:meeting'))) ? 'meeting.close',
  'the allowed actions of a non-officer exclude the closure');
SELECT pg_temp.act_as('["administrator"]');
SELECT ok(hall.allows('meeting.close', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'the administrator conducts any meeting');
SELECT test_prepare_notice(test_uuid('conduct:meeting'));
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('conduct:meeting'),'2026-01-01 09:00Z')$$, 'the meeting opens');
SELECT lives_ok($$SELECT record_meeting_officer_change(test_uuid('conduct:meeting'),'chair',test_uuid('conduct:member:3'),'2026-01-01 09:05Z')$$, 'the chair is handed over');
SELECT pg_temp.act_as('["clerk"]', test_uuid('conduct:member:3'));
SELECT ok(hall.allows('agenda-item.start', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'after the handover the new chair conducts the meeting');
SELECT pg_temp.act_as('["councillor"]', test_uuid('conduct:member:1'));
SELECT ok(NOT hall.allows('agenda-item.start', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'after the handover the former chair no longer conducts the meeting');
SELECT pg_temp.act_as('["councillor"]');
SELECT ok(NOT hall.allows('agenda-item.start', jsonb_build_object('meetingId', test_uuid('conduct:meeting'))),
  'an account without linked contact conducts no meeting');

SELECT * FROM finish();
ROLLBACK;
