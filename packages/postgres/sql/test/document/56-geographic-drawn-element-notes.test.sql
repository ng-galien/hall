BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
SET LOCAL hall.request_id = 'pgtap-drawn-element-notes';
SET LOCAL hall.action = 'pgtap';
SET LOCAL hall.actor_id = 'actor-1';
SELECT no_plan();

-- @verifies-requirement HALL-FR-DOC-430
CREATE TEMP TABLE drawn_fixture AS
SELECT jsonb_build_object(
    'view', jsonb_build_object('kind', 'center', 'center', jsonb_build_array(4.47, 47.50), 'zoom', 14),
    'layers', jsonb_build_array(jsonb_build_object('id', 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'visible', true, 'opacity', 1)),
    'hallLayer', jsonb_build_object('type', 'FeatureCollection', 'features', jsonb_build_array(
      jsonb_build_object('type', 'Feature', 'id', 'element-1',
        'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(4.47, 47.50)),
        'properties', jsonb_build_object('kind', 'marker', 'visible', true, 'label', 'Chêne remarquable', 'style', '{}'::jsonb)),
      jsonb_build_object('type', 'Feature', 'id', 'element-2',
        'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(4.57, 47.50)),
        'properties', jsonb_build_object('kind', 'marker', 'visible', true, 'style', '{}'::jsonb)),
      jsonb_build_object('type', 'Feature', 'id', 'measure-1',
        'geometry', jsonb_build_object('type', 'LineString', 'coordinates', jsonb_build_array(
          jsonb_build_array(4.47, 47.50), jsonb_build_array(4.57, 47.50))),
        'properties', jsonb_build_object('kind', 'lengthMeasurement', 'label', 'Haie', 'length', 7650))
    )),
    'provenance', jsonb_build_object(
      'attribution', 'IGN', 'license', 'Licence Ouverte 2.0', 'metadataUrl', 'https://geoservices.ign.fr/',
      'configuredAt', '2026-10-10T00:00:00Z', 'sourceUpdatedAt', NULL)
  ) AS document;

CREATE TEMP TABLE drawn_map AS
SELECT (hall_api.create_geographic_resource('Cartes', 'Repérage', document) ->> 'id')::UUID AS map FROM drawn_fixture;

SELECT is(hall_api.geographic_drawn_element_notes(map), '[]'::JSONB, 'a new map has no drawn element note')
FROM drawn_map;
SELECT ok(
  hall.resource_siren_actions(hall_api.open_resource(map)) @> '[{"name":"resource.create-geographic-feature-note"}]'::JSONB,
  'the map advertises the note action for its drawn elements'
)
FROM drawn_map;

CREATE TEMP TABLE drawn_note AS
SELECT hall_api.create_geographic_drawn_element_note(map, 'element-1') AS note FROM drawn_map;
SELECT is(note ->> 'subjectKind', 'drawnElement', 'the note subject is a drawn element') FROM drawn_note;
SELECT is(note ->> 'key', 'element-1', 'the note is keyed by the element id') FROM drawn_note;
SELECT is(note ->> 'fullPath', 'Cartes/Notes cartographiques/Repérage - Chêne remarquable',
  'the note is a text in the Notes cartographiques folder of the map folder, named after the element label')
FROM drawn_note;
SELECT is(hall_api.create_geographic_drawn_element_note(map, 'element-1') ->> 'noteId', note ->> 'noteId',
  'creating the note again returns the existing note')
FROM drawn_map, drawn_note;
SELECT is(hall_api.geographic_drawn_element_notes(map) -> 0 ->> 'noteId', note ->> 'noteId',
  'the map lists the note of its drawn element')
FROM drawn_map, drawn_note;
SELECT throws_ok(
  format($$SELECT hall_api.create_geographic_drawn_element_note(%L::UUID, 'missing')$$, map),
  'HV601', 'Geographic feature not found',
  'a note needs an element saved in the map'
)
FROM drawn_map;
SELECT throws_ok(
  format($$SELECT hall_api.create_geographic_drawn_element_note(%L::UUID, 'measure-1')$$, map),
  'HV613', 'A saved measurement has no note',
  'a saved measurement is refused as the subject of a note'
)
FROM drawn_map;
SELECT throws_ok(
  $$INSERT INTO hall.geographic_feature_note (text_resource_id, subject_kind, subject_key)
    SELECT (note ->> 'noteId')::UUID, 'drawnElement', 'element-3' FROM drawn_note$$,
  '23514', NULL,
  'a drawn element note requires its map'
);

SELECT lives_ok(
  format($$SELECT hall_api.update_geographic_resource(%L::UUID, 1, %L::JSONB)$$, map,
    jsonb_set(document, '{hallLayer,features}', (document #> '{hallLayer,features}') - 0)),
  'the drawing is saved without the noted element'
)
FROM drawn_map, drawn_fixture;
SELECT is(hall_api.geographic_drawn_element_notes(map), '[]'::JSONB, 'deleting the element detaches its note')
FROM drawn_map;
SELECT is(hall_api.open_resource((note ->> 'noteId')::UUID) ->> 'fullPath',
  'Cartes/Notes cartographiques/Repérage - Chêne remarquable',
  'the note text stays in Notes cartographiques')
FROM drawn_note;

SELECT * FROM finish();
ROLLBACK;
