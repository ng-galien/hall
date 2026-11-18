BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();
-- @verifies-requirement HALL-FR-WSP-510 BUSINESS_DOCUMENTS_ARE_ITS_FOLDER_AND_ITS_ASSOCIATIONS:
CREATE TEMP TABLE scenario AS SELECT
  create_council_business_workspace('', 'Affaire', 'report', 'Report') business,
  create_council_business_workspace('', 'Autre', 'report', 'Report') other;
SELECT create_folder('', 'Ailleurs');
SELECT create_folder('Affaire', 'Pièces');
CREATE TEMP TABLE pieces AS SELECT
  (create_text_resource('Affaire/Pièces', 'filed', '')->>'id')::UUID filed,
  (create_text_resource('Affaire', 'moved folder child', '')->>'id')::UUID child,
  (create_text_resource('Ailleurs', 'outside', '')->>'id')::UUID outside;
SELECT associate_council_business_resource(business, filed) FROM scenario, pieces;
SELECT associate_council_business_resource(other, filed) FROM scenario, pieces;
SELECT associate_council_business_resource(business, outside) FROM scenario, pieces;

SELECT relocate_resource(filed, 'Affaire', 'filed renamed') FROM pieces;
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource = (SELECT filed FROM pieces)), 2,
  'moving and renaming inside the folder of the affair keeps the associations');

SELECT relocate_resource((SELECT id FROM resource WHERE full_path = 'Affaire'), '', 'Affaire renommée');
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource = (SELECT filed FROM pieces)), 2,
  'renaming the folder of the affair keeps its documents in the affair');

SELECT relocate_resource(filed, 'Ailleurs', 'filed renamed') FROM pieces;
SELECT is(ARRAY(SELECT council_business FROM council_business_resource WHERE resource = (SELECT filed FROM pieces)),
  ARRAY[(SELECT other FROM scenario)],
  'a document taken out of the folder leaves that affair and stays in the other one');

SELECT relocate_resource(outside, 'Affaire renommée', 'outside') FROM pieces;
SELECT relocate_resource(outside, 'Ailleurs', 'outside') FROM pieces;
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource = (SELECT outside FROM pieces)), 0,
  'a document filed into the folder then taken out again leaves the affair');

SELECT relocate_resource(child, 'Affaire renommée/Pièces', 'moved folder child') FROM pieces;
SELECT associate_council_business_resource(business, child) FROM scenario, pieces;
SELECT relocate_resource((SELECT id FROM resource WHERE full_path = 'Affaire renommée/Pièces'), 'Ailleurs', 'Pièces');
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource = (SELECT child FROM pieces)), 0,
  'a document leaving through a sub-folder leaves the affair');

SELECT is((SELECT count(*)::int FROM resource
  WHERE id = (SELECT report_resource FROM council_business_workspace WHERE council_business = (SELECT business FROM scenario))
    AND path = 'Affaire renommée'), 1, 'the report stays in the folder of the affair');
SELECT * FROM finish();
ROLLBACK;
