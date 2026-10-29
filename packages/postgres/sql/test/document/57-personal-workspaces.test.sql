BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
\ir ../../council/test/support/helpers.sql
SET LOCAL hall.request_id = 'pgtap-personal-workspaces';
SET LOCAL hall.action = 'pgtap';
SELECT no_plan();

CREATE FUNCTION pg_temp.act_as(roles TEXT, contact UUID DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('hall.roles', roles, true),
    set_config('hall.contact_id', coalesce(contact::TEXT, ''), true);
$$;

CREATE FUNCTION pg_temp.as_administrator() RETURNS VOID LANGUAGE sql AS $$
  SELECT pg_temp.act_as('["administrator"]');
$$;
CREATE FUNCTION pg_temp.as_clerk() RETURNS VOID LANGUAGE sql AS $$
  SELECT pg_temp.act_as('["clerk"]');
$$;
CREATE FUNCTION pg_temp.as_contributor() RETURNS VOID LANGUAGE sql AS $$
  SELECT pg_temp.act_as('["contributor"]');
$$;
CREATE FUNCTION pg_temp.as_councillor(contact UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT pg_temp.act_as('["councillor"]', contact);
$$;

SELECT test_ensure_council_member(test_uuid('member:alice'));
SELECT test_ensure_council_member(test_uuid('member:bruno'));
UPDATE hall.contact SET first_name = 'Alice', last_name = 'Martin' WHERE id = test_uuid('member:alice');
UPDATE hall.contact SET first_name = 'Bruno', last_name = 'Durand' WHERE id = test_uuid('member:bruno');
INSERT INTO hall.contact (id, first_name, last_name) VALUES (test_uuid('contact:no-mandate'), 'Claire', 'Petit');

-- Step 1: provisioning and ownership.

-- @verifies-requirement HALL-FR-DIR-150
-- @verifies-requirement HALL-FR-WSP-380
SELECT pg_temp.as_contributor();
SELECT throws_ok(
  $$SELECT hall_api.provision_personal_workspace(test_uuid('member:alice'))$$,
  'HV614', NULL, 'only the secretariat or an administrator provisions a personal workspace'
);

SELECT pg_temp.as_administrator();
SELECT is(
  hall_api.provision_personal_workspace(test_uuid('member:alice')) ->> 'fullPath',
  'Espaces personnels/Alice Martin',
  'the personal folder of an elected member is named after the member under the reserved root'
);
SELECT is(
  hall_api.provision_personal_workspace(test_uuid('member:alice')) ->> 'fullPath',
  'Espaces personnels/Alice Martin',
  'provisioning is idempotent'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM hall.personal_workspace WHERE contact = test_uuid('member:alice')),
  1,
  'one personal folder per contact'
);
SELECT throws_ok(
  $$SELECT hall_api.provision_personal_workspace(test_uuid('contact:no-mandate'))$$,
  'HV617', NULL, 'a contact without an active mandate receives no personal folder'
);
SELECT lives_ok(
  $$SELECT hall_api.provision_personal_workspace(test_uuid('member:bruno'))$$,
  'a second elected member receives a personal folder'
);

-- The ownership relation survives a rename by an administrator.
SELECT lives_ok(
  $$SELECT hall_api.rename_resource(
    (SELECT folder_resource FROM hall.personal_workspace WHERE contact = test_uuid('member:bruno')), 'Bruno D.')$$,
  'an administrator renames a personal folder'
);
SELECT is(
  hall.personal_workspace_owner('Espaces personnels/Bruno D./notes'),
  test_uuid('member:bruno'),
  'the renamed folder still belongs to its member'
);
SELECT ok(hall_api.create_folder('', 'Ailleurs') IS NOT NULL, 'a common folder exists outside the personal root');
SELECT throws_ok(
  $$SELECT hall_api.move_resource(
      (SELECT folder_resource FROM hall.personal_workspace WHERE contact = test_uuid('member:bruno')), 'Ailleurs');
    SET CONSTRAINTS ALL IMMEDIATE$$,
  'HV616', NULL, 'a personal folder stays directly under the personal workspaces root'
);


-- Step 2: who writes where, and the matching Siren affordances.
SELECT pg_temp.as_administrator();
CREATE TEMP TABLE fixture AS
SELECT
  (hall_api.create_text_resource('Commun', 'Note commune', 'texte') ->> 'id')::UUID AS common_text,
  (SELECT folder_resource FROM hall.personal_workspace WHERE contact = test_uuid('member:alice')) AS alice_folder;

-- @verifies-requirement HALL-FR-DOC-550
SELECT pg_temp.as_clerk();
SELECT lives_ok($$SELECT hall_api.create_text_resource('Commun', 'Du secrétariat', '')$$,
  'the clerk creates in a common folder');
SELECT pg_temp.as_contributor();
SELECT lives_ok($$SELECT hall_api.create_text_resource('Commun', 'Du contributeur', '')$$,
  'a contributor creates in a common folder');
SELECT lives_ok(
  $$SELECT hall_api.rename_resource((SELECT id FROM hall.resource WHERE full_path = 'Commun/Du contributeur'), 'Contribution')$$,
  'a contributor renames a common document');
-- @verifies-requirement HALL-FR-USR-040
SELECT throws_ok(
  $$SELECT hall_api.delete_resource((SELECT id FROM hall.resource WHERE full_path = 'Commun/Contribution'))$$,
  'HV614', NULL, 'a contributor does not delete a common document');
SELECT ok(
  hall.resource_siren_actions(hall_api.open_resource(common_text)) @> '[{"name":"resource.relocate"},{"name":"resource.update-content"}]'::JSONB
    AND NOT hall.resource_siren_actions(hall_api.open_resource(common_text)) @> '[{"name":"resource.delete"}]'::JSONB,
  'a contributor is offered move and edit, not delete, on a common document')
FROM fixture;
SELECT pg_temp.as_clerk();
SELECT ok(
  hall.resource_siren_actions(hall_api.open_resource(common_text)) @> '[{"name":"resource.delete"}]'::JSONB,
  'the secretariat is offered to delete a common document')
FROM fixture;
SELECT lives_ok(
  $$SELECT hall_api.delete_resource((SELECT id FROM hall.resource WHERE full_path = 'Commun/Contribution'))$$,
  'the secretariat deletes a common document');
SELECT pg_temp.as_contributor();
SELECT ok(
  hall.resource_collection_siren_actions('Commun') @> '[{"name":"resource.create"},{"name":"resource.create-document"},{"name":"resource.import-spreadsheet"},{"name":"resource.convert-spreadsheet-table"}]'::JSONB,
  'a contributor is offered creation and import in a common folder');

-- @verifies-requirement HALL-FR-WSP-390
-- @verifies-requirement HALL-FR-USR-030
SELECT pg_temp.as_councillor(test_uuid('member:alice'));
SELECT lives_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Brouillon', 'v1')$$,
  'a council member creates a text in their personal folder');
SELECT lives_ok($$SELECT hall_api.create_folder('Espaces personnels/Alice Martin', 'Dossiers')$$,
  'a council member creates a sub-folder in their personal folder');
SELECT lives_ok(
  $$SELECT hall_api.move_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Brouillon'),
    'Espaces personnels/Alice Martin/Dossiers')$$,
  'a council member moves a document between their own folders');
SELECT lives_ok(
  $$SELECT hall_api.update_text_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon'), 1, 'v2', '{}')$$,
  'a council member edits their own document');
SELECT lives_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Jetable', '')$$,
  'a council member creates a draft to discard');
SELECT lives_ok(
  $$SELECT hall_api.delete_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Jetable'))$$,
  'a council member deletes their own work in their personal folder');
SELECT throws_ok(
  $$SELECT hall_api.delete_resource((SELECT common_text FROM fixture))$$,
  'HV614', NULL, 'a council member does not delete a common document');
SELECT throws_ok($$SELECT hall_api.create_text_resource('Commun', 'Intrusion', '')$$,
  'HV614', NULL, 'a council member does not create in a common folder');
SELECT throws_ok(
  $$SELECT hall_api.update_text_resource((SELECT common_text FROM fixture), 1, 'modifié', '{}')$$,
  'HV614', NULL, 'a council member does not edit a common document');
SELECT throws_ok(
  $$SELECT hall_api.move_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon'), 'Commun')$$,
  'HV614', NULL, 'a council member does not move their document into a common folder');
SELECT throws_ok($$SELECT hall_api.rename_resource((SELECT alice_folder FROM fixture), 'Alice')$$,
  'HV615', NULL, 'a council member does not rename their personal folder');
SELECT throws_ok($$SELECT hall_api.delete_resource((SELECT alice_folder FROM fixture))$$,
  'HV615', NULL, 'a council member does not delete their personal folder');
SELECT is(hall.resource_siren_actions(hall_api.open_resource(common_text)), '[]'::JSONB,
  'a council member is offered no change on a common document')
FROM fixture;
SELECT ok(
  hall.resource_siren_actions(hall_api.open_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon')))
    @> '[{"name":"resource.relocate"},{"name":"resource.update-content"},{"name":"resource.delete"}]'::JSONB,
  'a council member is offered move, edit and delete on their own document');
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_siren_actions(hall_api.open_resource(alice_folder))) AS action),
  ARRAY['resource.update-metadata'],
  'a council member is not offered to move or delete their personal folder')
FROM fixture;
SELECT ok(hall.resource_collection_siren_actions('Espaces personnels/Alice Martin') @> '[{"name":"resource.create"},{"name":"resource.create-document"},{"name":"resource.import-spreadsheet"}]'::JSONB,
  'a council member is offered creation and import in their personal folder');
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_collection_siren_actions('Commun')) AS action),
  ARRAY['resource.create-editor-asset'],
  'a council member is offered no creation in a common folder');

SELECT pg_temp.as_councillor(test_uuid('member:bruno'));
SELECT throws_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Chez Alice', '')$$,
  'HV614', NULL, 'a council member does not write in a colleague''s personal folder');
SELECT is(
  hall.resource_siren_actions(hall_api.open_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon'))),
  '[]'::JSONB,
  'a council member reads a colleague''s document without change actions');

-- @verifies-requirement HALL-FR-WSP-410
SELECT pg_temp.as_contributor();
SELECT throws_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Contribution', '')$$,
  'HV614', NULL, 'a contributor does not write in a personal folder');
SELECT throws_ok(
  $$SELECT hall_api.move_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon'), 'Commun')$$,
  'HV614', NULL, 'a contributor does not take over a document from a personal folder');
SELECT is(
  hall.resource_siren_actions(hall_api.open_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon'))),
  '[]'::JSONB,
  'a contributor reads a personal document without change actions');
SELECT pg_temp.act_as('[]');
SELECT throws_ok($$SELECT hall_api.create_text_resource('Commun', 'Sans rôle', '')$$,
  'HV614', NULL, 'an account without role does not create in a common folder');

SELECT pg_temp.as_clerk();
SELECT lives_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Ajout du secrétariat', '')$$,
  'the clerk writes in a council member''s personal folder');
SELECT lives_ok($$SELECT hall_api.rename_resource((SELECT alice_folder FROM fixture), 'Alice')$$,
  'the secretariat renames a personal folder');
SELECT lives_ok($$SELECT hall_api.rename_resource((SELECT alice_folder FROM fixture), 'Alice Martin')$$,
  'the secretariat gives the personal folder its name back');
SELECT ok(
  hall.resource_siren_actions(hall_api.open_resource(alice_folder)) @> '[{"name":"resource.relocate"},{"name":"resource.delete"}]'::JSONB,
  'the secretariat is offered to move and delete a personal folder')
FROM fixture;
SELECT lives_ok(
  $$SELECT hall_api.move_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Dossiers/Brouillon'), 'Commun')$$,
  'the clerk takes a document over into a common folder by moving it');
SELECT pg_temp.as_councillor(test_uuid('member:alice'));
SELECT throws_ok(
  $$SELECT hall_api.update_text_resource((SELECT id FROM hall.resource WHERE full_path = 'Commun/Brouillon'), 2, 'v3', '{}')$$,
  'HV614', NULL, 'a council member no longer edits a document taken over by the clerk');


-- Step 3: affairs keep their pieces in the common folders (D4).

-- @verifies-requirement HALL-FR-WSP-420
SELECT pg_temp.as_administrator();
CREATE TEMP TABLE affair AS
SELECT
  (hall_api.create_council_business('Commun', 'Affaire test', 'Rapport', '') ->> 'id')::UUID AS business,
  (hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Proposition', 'texte') ->> 'id')::UUID AS personal_text,
  (hall_api.create_text_resource('Commun', 'Pièce commune', 'texte') ->> 'id')::UUID AS common_piece;
SELECT throws_ok(
  $$SELECT hall_api.associate_council_business_resource((SELECT business FROM affair), (SELECT personal_text FROM affair))$$,
  'HV707', NULL, 'a document of a personal folder is not joined to an affair');
SELECT throws_ok(
  $$SELECT hall_api.create_council_business('Espaces personnels/Alice Martin', 'Affaire privée', 'Rapport', '')$$,
  'HV707', NULL, 'an affair folder is not created in a personal folder');
SELECT lives_ok(
  $$SELECT hall_api.associate_council_business_resource((SELECT business FROM affair), (SELECT common_piece FROM affair))$$,
  'a common document is joined to an affair');
SELECT throws_ok(
  $$SELECT hall_api.move_resource((SELECT common_piece FROM affair), 'Espaces personnels/Alice Martin')$$,
  'HV707', NULL, 'a piece of an affair is not moved into a personal folder');
SELECT lives_ok(
  $$SELECT hall_api.move_resource((SELECT personal_text FROM affair), 'Commun')$$,
  'the document is taken over into a common folder');
SELECT lives_ok(
  $$SELECT hall_api.associate_council_business_resource((SELECT business FROM affair), (SELECT personal_text FROM affair))$$,
  'once taken over, the document is joined to the affair');

-- @verifies-requirement HALL-FR-DIR-160
UPDATE hall.council_member SET term_ended_on = current_date WHERE contact = test_uuid('member:alice');
SELECT pg_temp.as_councillor(test_uuid('member:alice'));
SELECT throws_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Après le mandat', '')$$,
  'HV614', NULL, 'a former council member no longer writes in their folder');
SELECT ok(NOT hall.resource_collection_siren_actions('Espaces personnels/Alice Martin') @> '[{"name":"resource.create"}]'::JSONB,
  'a former council member is offered no creation');
SELECT pg_temp.as_clerk();
SELECT lives_ok($$SELECT hall_api.create_text_resource('Espaces personnels/Alice Martin', 'Suite du secrétariat', '')$$,
  'the clerk still writes in the folder of a former council member');
SELECT is((SELECT count(*)::INTEGER FROM hall.resource WHERE path = 'Espaces personnels/Alice Martin') > 0, TRUE,
  'the folder of a former council member stays in place');


-- Affairs are offered in common folders only, and personal resources are marked by the base.

-- @verifies-requirement HALL-FR-WSP-420
SELECT pg_temp.as_administrator();
SELECT ok(NOT hall.resource_collection_siren_actions('Espaces personnels/Alice Martin') @> '[{"name":"council-business.create"}]'::JSONB
    AND NOT hall.resource_collection_siren_actions('Espaces personnels/Alice Martin') @> '[{"name":"council-business.import-bundle"}]'::JSONB,
  'an administrator is not offered to create or import an affair in a personal folder');
SELECT ok(hall.resource_collection_siren_actions('Commun') @> '[{"name":"council-business.create"},{"name":"council-business.import-bundle"}]'::JSONB,
  'an administrator is offered to create and import an affair in a common folder');
SELECT pg_temp.as_clerk();
SELECT ok(NOT hall.resource_collection_siren_actions('Espaces personnels/Alice Martin') @> '[{"name":"council-business.create"}]'::JSONB,
  'the clerk is not offered to create an affair in a personal folder');
SELECT ok(hall.resource_collection_siren_actions('Commun') @> '[{"name":"council-business.create"}]'::JSONB,
  'the clerk is offered to create an affair in a common folder');
SELECT pg_temp.as_contributor();
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_collection_siren_actions('Espaces personnels/Alice Martin')) AS action),
  ARRAY['resource.create-editor-asset'],
  'a contributor is offered no creation and no affair in a personal folder');
SELECT pg_temp.as_councillor(test_uuid('member:bruno'));
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_collection_siren_actions('Espaces personnels/Bruno D.')) AS action),
  ARRAY['resource.create', 'resource.create-document', 'resource.import-spreadsheet',
    'resource.convert-spreadsheet-table', 'resource.create-editor-asset', 'resource.search-legal-references'],
  'a council member is offered creation and imports, but no affair, in their personal folder');

-- @verifies-requirement HALL-FR-WSP-420
SELECT pg_temp.as_administrator();
SELECT is(
  hall_api.present_resource(hall_api.open_resource((SELECT id FROM hall.resource WHERE full_path = 'Espaces personnels/Alice Martin/Suite du secrétariat'))) -> 'class',
  '["resource", "personal-workspace"]'::JSONB,
  'a resource of a personal folder carries the personal-workspace class');
SELECT is(
  hall_api.present_resource(hall_api.open_resource((SELECT common_text FROM fixture))) -> 'class',
  '["resource"]'::JSONB,
  'a common resource carries no personal-workspace class');

SELECT * FROM finish();
ROLLBACK;
