BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
SET LOCAL hall.request_id = 'pgtap-feature-notes';
SET LOCAL hall.action = 'pgtap';
SET LOCAL hall.actor_id = 'actor-1';
SELECT no_plan();

-- @verifies-requirement HALL-FR-DOC-360
-- @verifies-requirement HALL-FR-DOC-370
-- @verifies-requirement HALL-FR-DOC-390
-- @verifies-requirement HALL-FR-DOC-400
CREATE TEMP TABLE parcel_source AS
SELECT '{"format":"geojson","fileName":"parcelles.geojson","byteSize":10,"contentSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","importedAt":"2026-10-10T08:00:00Z"}'::JSONB AS source,
  '[
    {"sourceId":"999990000A0221","key":"999990000A0221","label":"A 221","geometry":{"type":"Point","coordinates":[4.49,47.53]},"properties":{"id":"999990000A0221","section":"A","numero":"0221"},"bbox":[4.49,47.53,4.49,47.53]},
    {"sourceId":"999990000A0222","key":"999990000A0222","label":"A 222","geometry":{"type":"Point","coordinates":[4.50,47.53]},"properties":{"id":"999990000A0222","section":"A","numero":"0222"},"bbox":[4.50,47.53,4.50,47.53]}
  ]'::JSONB AS features;

CREATE TEMP TABLE note_fixture AS
SELECT
  (hall_api.create_geographic_layer_resource('Cartes', 'Parcelles 2026', source, '{"kind":"cadastreParcel","property":"id"}'::JSONB, ARRAY['id', 'numero', 'section'], features) ->> 'id')::UUID AS vintage_2026,
  (hall_api.create_geographic_layer_resource('Cartes', 'Repères', source, '{"kind":"sourceId"}'::JSONB, ARRAY[]::TEXT[],
    '[{"sourceId":"R-1","key":"R-1","label":null,"geometry":{"type":"Point","coordinates":[4.49,47.53]},"properties":{},"bbox":[4.49,47.53,4.49,47.53]}]'::JSONB) ->> 'id')::UUID AS markers,
  (hall_api.create_geographic_layer_resource('Cartes', 'Sans clé', source, '{"kind":"none"}'::JSONB, ARRAY[]::TEXT[],
    '[{"sourceId":null,"geometry":{"type":"Point","coordinates":[4.49,47.53]},"properties":{},"bbox":[4.49,47.53,4.49,47.53]}]'::JSONB) ->> 'id')::UUID AS keyless
FROM parcel_source;

SELECT is(hall_api.open_resource(vintage_2026) -> 'featureKey', '{"kind":"cadastreParcel","property":"id"}'::JSONB,
  'the layer representation gives its key rule')
FROM note_fixture;
SELECT is((hall_api.geographic_layer_features(vintage_2026) #> '{features,0}') - 'geometry' - 'properties' - 'type',
  '{"id":0,"key":"999990000A0221","label":"A 221","sourceId":"999990000A0221"}'::JSONB,
  'each served feature carries its stable key and its label')
FROM note_fixture;
SELECT throws_ok(
  $$SELECT hall_api.create_geographic_layer_resource('Cartes', 'Clé invalide',
    '{"format":"geojson","fileName":"x.geojson","byteSize":1,"contentSha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","importedAt":"2026-10-10T08:00:00Z"}'::JSONB,
    '{"kind":"cadastreParcel","property":"id"}'::JSONB, ARRAY[]::TEXT[],
    '[{"key":"A221","geometry":{"type":"Point","coordinates":[6,46]},"properties":{},"bbox":[6,46,6,46]}]'::JSONB)$$,
  'HV607', 'Geographic layer features are invalid',
  'a cadastre parcel key must be a 14-character parcel identifier'
);
SELECT throws_ok(
  format($$SELECT hall_api.create_geographic_layer_resource('Cartes', 'Doublon', %L::JSONB, '{"kind":"sourceId"}'::JSONB, ARRAY[]::TEXT[],
    '[{"key":"X","geometry":{"type":"Point","coordinates":[6,46]},"properties":{},"bbox":[6,46,6,46]},
      {"key":"X","geometry":{"type":"Point","coordinates":[6,46]},"properties":{},"bbox":[6,46,6,46]}]'::JSONB)$$, source),
  '23505', NULL,
  'keys are unique within a layer'
)
FROM parcel_source;

CREATE TEMP TABLE first_note AS
SELECT hall_api.create_geographic_feature_note(vintage_2026, 0) AS note FROM note_fixture;
SELECT is(note ->> 'name', 'Parcelle A 221 (999990000A0221)', 'a parcel note is named after the parcel label and id')
FROM first_note;
SELECT is(note ->> 'fullPath', 'Cartes/Notes cartographiques/Parcelle A 221 (999990000A0221)',
  'the note is a text resource in the Notes cartographiques folder of the layer folder')
FROM first_note;
SELECT is(hall_api.open_resource((note ->> 'noteId')::UUID) ->> 'kind', 'text', 'the note is a workspace text')
FROM first_note;
SELECT is(hall_api.create_geographic_feature_note(vintage_2026, 0) ->> 'noteId', note ->> 'noteId',
  'creating the note again returns the existing note')
FROM first_note, note_fixture;
SELECT ok(
  hall_api.search_resources('Parcelle A 221') -> 'items' @> jsonb_build_array(jsonb_build_object('id', note ->> 'noteId')),
  'the workspace search finds the note like other texts'
)
FROM first_note;

CREATE TEMP TABLE vintage_2027 AS
SELECT (hall_api.create_geographic_layer_resource('Cartes', 'Parcelles 2027', source, '{"kind":"cadastreParcel","property":"id"}'::JSONB, ARRAY[]::TEXT[],
  features) ->> 'id')::UUID AS layer FROM parcel_source;
SELECT is(hall_api.geographic_feature_notes(layer) -> 0 ->> 'noteId', note ->> 'noteId',
  'a parcel note follows the parcel id into a layer imported from a new vintage')
FROM vintage_2027, first_note;
SELECT is(hall_api.create_geographic_feature_note(layer, 0) ->> 'noteId', note ->> 'noteId',
  'the new vintage reuses the parcel note instead of creating another one')
FROM vintage_2027, first_note;

SELECT is(hall_api.create_geographic_feature_note(markers, 0) ->> 'name', 'Repères - R-1',
  'a note under the source identifier rule is named after the layer and the identifier')
FROM note_fixture;
SELECT is(jsonb_array_length(hall_api.geographic_feature_notes(vintage_2026)), 1,
  'source identifier notes stay in their layer')
FROM note_fixture;
SELECT throws_ok(
  format('SELECT hall_api.create_geographic_feature_note(%L::uuid, 0)', keyless),
  'HV609', 'Geographic feature has no stable identifier',
  'a feature without stable identifier has no note'
)
FROM note_fixture;

SELECT set_config('hall.roles', '["contributor"]', true);
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(
    hall.resource_siren_actions(hall_api.open_resource((note ->> 'noteId')::UUID))) AS action),
  ARRAY['resource.relocate', 'resource.update-metadata', 'resource.update-content'],
  'a contributor edits, renames and moves a common feature note without deleting it'
)
FROM first_note;
SELECT is(hall_api.present_municipal_property(hall_api.municipal_property()) -> 'actions', NULL,
  'a contributor cannot import the municipal property list, reference data of the municipality');
SELECT set_config('hall.roles', '["clerk"]', true);
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(
    hall.resource_siren_actions(hall_api.open_resource((note ->> 'noteId')::UUID))) AS action),
  ARRAY['resource.relocate', 'resource.update-metadata', 'resource.update-content', 'resource.delete'],
  'the secretariat edits, renames, moves and deletes a common feature note'
)
FROM first_note;
SELECT ok(
  hall_api.present_municipal_property(hall_api.municipal_property()) -> 'actions' @> '[{"name":"resource.import-municipal-property"}]'::JSONB,
  'the secretariat may import the municipal property list'
);
SELECT set_config('hall.roles', '["councillor"]', true);
SELECT is(hall.resource_siren_actions(hall_api.open_resource((note ->> 'noteId')::UUID)), '[]'::JSONB,
  'a councillor reads a common note without editing it')
FROM first_note;
SELECT set_config('hall.roles', '["administrator"]', true);

SELECT is(hall_api.municipal_property() -> 'source', 'null'::JSONB, 'no municipal property list exists at first');
SELECT is(
  hall_api.replace_municipal_property('Liste du secrétariat', 'proprietes.csv', 'Secrétariat', ARRAY['999990000A0221', '999990000B0001', '999990000A0221'])
    - 'source' - 'sources' - 'parcelSourceIds',
  '{"parcelIds":["999990000A0221","999990000B0001"],"matchedParcelCount":1}'::JSONB,
  'the list keeps distinct parcel ids and counts those present in cadastre layers'
);
SELECT is(
  (hall_api.municipal_property() -> 'source') - 'id' - 'importedAt',
  '{"label":"Liste du secrétariat","fileName":"proprietes.csv","parcelCount":2,"importedBy":"Secrétariat"}'::JSONB,
  'the source of the list is recorded'
);
SELECT is(
  hall_api.replace_municipal_property('Liste collée', NULL, 'Secrétariat', ARRAY['999990000A0222']) -> 'parcelIds',
  '["999990000A0222"]'::JSONB,
  'a new import replaces the previous list'
);
SELECT is((SELECT count(*)::INTEGER FROM hall.municipal_property_source), 2, 'every import source is kept');
SELECT throws_ok(
  $$SELECT hall_api.replace_municipal_property('Liste', NULL, 'Secrétariat', ARRAY['A221'])$$,
  '23514', NULL,
  'a parcel id must be a 14-character parcel identifier'
);

SELECT lives_ok(
  format('SELECT hall_api.delete_resource(%L::uuid)', note ->> 'noteId'),
  'the note can be deleted from the workspace'
)
FROM first_note;
SELECT is(jsonb_array_length(hall_api.geographic_feature_notes(vintage_2026)), 0,
  'deleting the note detaches it from the parcel')
FROM note_fixture;

-- @verifies-requirement HALL-FR-DOC-380
SELECT is(hall_api.open_resource(vintage_2026) -> 'propertyKeys', '["id", "numero", "section"]'::JSONB,
  'the layer records the order of its property keys')
FROM note_fixture;
SELECT ok(
  hall_api.geographic_layer_features_text(vintage_2026) LIKE '%"properties": {"id": "999990000A0221", "numero": "0221", "section": "A"}%',
  'the served properties follow the recorded key order, not the JSONB order'
)
FROM note_fixture;
SELECT is(hall.geographic_ordered_properties('{"b": 1, "zz": 2, "a": 3}'::JSONB, ARRAY['zz', 'b']),
  '{"zz": 2, "b": 1, "a": 3}', 'a key absent from the recorded order comes last');
SELECT is((hall_api.geographic_layer_features_text(vintage_2026)::JSONB) -> 'features',
  hall_api.geographic_layer_features(vintage_2026) -> 'features',
  'the text and JSONB projections carry the same features')
FROM note_fixture;

-- @verifies-requirement HALL-FR-DOC-360
SELECT throws_ok(
  $$SELECT hall_api.replace_municipal_property('Liste', NULL, 'Secrétariat', ARRAY['12345678900012'])$$,
  '23514', NULL,
  'a 14-digit SIRET is not a parcel identifier'
);
SELECT lives_ok(
  $$SELECT hall_api.replace_municipal_property('Liste', NULL, 'Secrétariat', ARRAY['2A0040000C0100', '99999000AB0001'])$$,
  'a padded section or a two-letter section is a parcel identifier'
);

-- @verifies-requirement HALL-FR-DOC-230
SELECT set_config('hall.roles', '["contributor"]', true);
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_collection_siren_actions()) AS action),
  ARRAY['resource.create', 'resource.create-document', 'resource.import-spreadsheet',
    'resource.convert-spreadsheet-table', 'resource.create-editor-asset', 'resource.search-legal-references',
    'council-business.create', 'council-business.import-bundle'],
  'a contributor is offered creation, imports, the image upload and affairs in a common folder');
SELECT set_config('hall.roles', '[]', true);
SELECT is(hall.resource_collection_siren_actions(), '[]'::JSONB, 'an account without role is not offered the image upload');
SELECT set_config('hall.roles', '["administrator"]', true);

-- @verifies-requirement HALL-FR-DOC-500
-- @verifies-requirement HALL-FR-DOC-510
CREATE TEMP TABLE collection_upload_actions AS
SELECT action ->> 'name' AS name, action -> 'fields' -> 0 ->> 'accept' AS accept
FROM jsonb_array_elements(hall.resource_collection_siren_actions()) AS action;
SELECT is((SELECT accept FROM collection_upload_actions WHERE name = 'resource.create-document'),
  '.pdf,.jpg,.jpeg,.png,.docx,.odt,.pptx,.txt', 'the workspace document upload lists the accepted formats');
SELECT is((SELECT accept FROM collection_upload_actions WHERE name = 'resource.import-spreadsheet'),
  '.csv,.xlsx', 'the workspace spreadsheet import lists the accepted formats');
SELECT is((SELECT accept FROM collection_upload_actions WHERE name = 'resource.convert-spreadsheet-table'),
  '.csv,.xlsx', 'the workspace offers the conversion of a spreadsheet into a table');

-- @verifies-requirement HALL-FR-DOC-390
CREATE TEMP TABLE deletion_notes AS
SELECT hall_api.create_geographic_feature_note(vintage_2026, 1) AS parcel_note,
       hall_api.create_geographic_feature_note(markers, 0) AS marker_note
FROM note_fixture;
SELECT lives_ok(format('SELECT hall_api.delete_resource(%L::uuid)', vintage_2026), 'a cadastre layer can be deleted')
FROM note_fixture;
SELECT lives_ok(format('SELECT hall_api.delete_resource(%L::uuid)', layer), 'its later vintage can be deleted too')
FROM vintage_2027;
SELECT ok(EXISTS (SELECT FROM hall.geographic_feature_note WHERE subject_key = '999990000A0222' AND subject_kind = 'cadastreParcel'),
  'deleting the cadastre layers keeps the parcel note link');
CREATE TEMP TABLE vintage_2028 AS
SELECT (hall_api.create_geographic_layer_resource('Cartes', 'Parcelles 2028', source, '{"kind":"cadastreParcel","property":"id"}'::JSONB,
  ARRAY[]::TEXT[], features) ->> 'id')::UUID AS layer FROM parcel_source;
SELECT is(hall_api.geographic_feature_notes(layer) -> 0 ->> 'noteId', parcel_note ->> 'noteId',
  'a layer imported after the deletion shows the parcel note again')
FROM vintage_2028, deletion_notes;
SELECT lives_ok(format('SELECT hall_api.delete_resource(%L::uuid)', markers), 'a source identifier layer can be deleted')
FROM note_fixture;
SELECT ok(NOT EXISTS (SELECT FROM hall.geographic_feature_note WHERE text_resource_id = (marker_note ->> 'noteId')::UUID),
  'deleting the layer detaches its source identifier notes')
FROM deletion_notes;
SELECT is(hall_api.open_resource((marker_note ->> 'noteId')::UUID) ->> 'kind', 'text',
  'the detached note text stays in the workspace')
FROM deletion_notes;

-- @verifies-requirement HALL-FR-DOC-400
SELECT lives_ok($$SELECT hall_api.replace_municipal_property('Liste communale', NULL, 'Secrétariat', ARRAY['999990000A0221'])$$,
  'a commune list is recorded');
SELECT lives_ok($$SELECT hall.import_municipal_parcels('{"sources":[{"id":"00000000-0000-4000-8000-000000000001","label":"Liste source","fileName":"a.csv","importedBy":"Mairie voisine"}],
  "parcels":[{"parcelId":"999990000A0221","sourceId":"00000000-0000-4000-8000-000000000001"},{"parcelId":"999990000A0222","sourceId":"00000000-0000-4000-8000-000000000001"}]}'::JSONB)$$,
  'bundle parcels are merged into the list');
SELECT is(hall_api.municipal_property() -> 'parcelIds', '["999990000A0221", "999990000A0222"]'::JSONB,
  'only the missing parcel is added and the existing one stays');
SELECT is(
  (SELECT source.label FROM hall.municipal_property_source AS source
   JOIN hall.municipal_property_parcel AS parcel ON parcel.municipal_property_source_id = source.id
   WHERE parcel.parcel_id = '999990000A0222'),
  'Liste source (dossier d’affaire importé)',
  'the added parcel records its bundle source'
);
SELECT is(
  hall_api.municipal_property() #>> '{parcelSourceIds,999990000A0221}',
  (SELECT id::TEXT FROM hall.municipal_property_source WHERE label = 'Liste communale'),
  'each parcel keeps the source that brought it'
);

SELECT * FROM finish();
ROLLBACK;
