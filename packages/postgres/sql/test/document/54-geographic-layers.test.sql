BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
SELECT no_plan();

-- @verifies-requirement HALL-FR-DOC-310
-- @verifies-requirement HALL-FR-DOC-320
-- @verifies-requirement HALL-FR-DOC-330
-- @verifies-requirement HALL-TR-DOC-080
CREATE TEMP TABLE geographic_layer_fixture AS
SELECT
  (hall_api.create_geographic_resource('Cartes', 'Plan communal', jsonb_build_object(
    'view', jsonb_build_object('kind', 'center', 'center', jsonb_build_array(4.5, 47.5), 'zoom', 14),
    'layers', jsonb_build_array(jsonb_build_object('id', 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'visible', true, 'opacity', 1)),
    'hallLayer', jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb),
    'provenance', jsonb_build_object(
      'attribution', 'IGN', 'license', 'Licence Ouverte 2.0', 'metadataUrl', 'https://geoservices.ign.fr/',
      'configuredAt', '2026-10-10T00:00:00Z', 'sourceUpdatedAt', NULL)
  )) ->> 'id')::UUID AS map,
  hall_api.create_geographic_layer_resource(
    'Cartes',
    'Parcelles d''essai',
    '{"format":"geojson","fileName":"parcelles.geojson","byteSize":512,"contentSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","importedAt":"2026-10-10T08:00:00Z"}'::JSONB,
    '{"kind":"none"}'::JSONB, ARRAY[]::TEXT[],
    '[
      {"sourceId":"A-1","geometry":{"type":"Polygon","coordinates":[[[4.5,47.5],[4.48,47.5],[4.48,47.51],[4.5,47.5]]]},"properties":{"section":"A","numero":"1","owner":{"kind":"commune"}},"bbox":[4.5,47.5,4.48,47.51]},
      {"sourceId":null,"geometry":{"type":"Point","coordinates":[4.52,47.55]},"properties":null,"bbox":[4.52,47.55,4.52,47.55]}
    ]'::JSONB
  ) AS layer;

SELECT is(layer ->> 'kind', 'geographicLayer', 'a layer is a resource of nature geographicLayer')
FROM geographic_layer_fixture;
SELECT is((layer ->> 'featureCount')::INTEGER, 2, 'the layer records its feature count')
FROM geographic_layer_fixture;
SELECT is(layer -> 'extent', '[4.5, 47.5, 4.52, 47.55]'::JSONB, 'the layer extent is the union of the feature extents')
FROM geographic_layer_fixture;
SELECT is(layer #>> '{source,fileName}', 'parcelles.geojson', 'the layer keeps the source file name')
FROM geographic_layer_fixture;
SELECT is(
  (SELECT count(*)::INTEGER FROM hall.geographic_layer_feature WHERE geographic_layer_resource_id = (layer ->> 'id')::UUID),
  2,
  'each feature is stored in its own row'
)
FROM geographic_layer_fixture;
SELECT is(
  hall_api.geographic_layer_features((layer ->> 'id')::UUID) #> '{features,0,properties,owner}',
  '{"kind":"commune"}'::JSONB,
  'nested properties are kept as received'
)
FROM geographic_layer_fixture;
SELECT is(
  hall_api.geographic_layer_features((layer ->> 'id')::UUID) #>> '{features,0,sourceId}',
  'A-1',
  'the source identifier is returned as a foreign member'
)
FROM geographic_layer_fixture;
SELECT is(
  hall_api.geographic_layer_features((layer ->> 'id')::UUID) #> '{features,1,id}',
  '1'::JSONB,
  'the GeoJSON id is the rank of the feature in the file'
)
FROM geographic_layer_fixture;
SELECT is(
  (SELECT count(*)::INTEGER FROM hall.geographic_layer_feature
   WHERE extent && box(point(4.51, 47.54), point(4.53, 47.56))
     AND geographic_layer_resource_id = (layer ->> 'id')::UUID),
  1,
  'features are searchable by extent overlap'
)
FROM geographic_layer_fixture;
SELECT ok(
  EXISTS (
    SELECT FROM pg_index index
    JOIN pg_class relation ON relation.oid = index.indexrelid
    JOIN pg_am method ON method.oid = relation.relam
    WHERE relation.relname = 'geographic_layer_feature_extent_idx' AND method.amname = 'gist'
  ),
  'the feature extent has a GiST index'
);
SELECT ok(
  hall_api.list_geographic_layer_resources() @> jsonb_build_array(jsonb_build_object('id', layer ->> 'id')),
  'the layer is listed among the geographic layers'
)
FROM geographic_layer_fixture;
SELECT ok(
  hall.resource_siren_links(layer) @> '[{"rel":["features"],"type":"application/geo+json"}]'::JSONB,
  'the layer representation links to its features'
)
FROM geographic_layer_fixture;

SELECT throws_ok(
  $$SELECT hall_api.create_geographic_layer_resource('Cartes', 'Hors bornes',
    '{"format":"geojson","fileName":"x.geojson","byteSize":1,"contentSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","importedAt":"2026-10-10T08:00:00Z"}'::JSONB,
    '{"kind":"none"}'::JSONB, ARRAY[]::TEXT[],
    '[{"geometry":{"type":"Point","coordinates":[700000,6600000]},"properties":{},"bbox":[700000,6600000,700000,6600000]}]'::JSONB)$$,
  '23514', NULL,
  'an extent outside the WGS84 bounds is rejected'
);
SELECT throws_ok(
  $$SELECT hall_api.create_geographic_layer_resource('Cartes', 'Collection',
    '{"format":"geojson","fileName":"x.geojson","byteSize":1,"contentSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","importedAt":"2026-10-10T08:00:00Z"}'::JSONB,
    '{"kind":"none"}'::JSONB, ARRAY[]::TEXT[],
    '[{"geometry":{"type":"GeometryCollection","coordinates":[]},"properties":{},"bbox":[6,46,6,46]}]'::JSONB)$$,
  '23514', NULL,
  'a geometry type outside the closed list is rejected'
);
SELECT throws_ok(
  $$SELECT hall_api.create_geographic_layer_resource('Cartes', 'Vide',
    '{"format":"geojson","fileName":"x.geojson","byteSize":1,"contentSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","importedAt":"2026-10-10T08:00:00Z"}'::JSONB,
    '{"kind":"none"}'::JSONB, ARRAY[]::TEXT[],
    '[]'::JSONB)$$,
  'HV607', 'Geographic layer features are invalid',
  'a layer without features is rejected'
);

SELECT is(
  hall_api.set_geographic_map_overlay(map, (layer ->> 'id')::UUID, true, NULL) -> 'overlays',
  jsonb_build_array(jsonb_build_object(
    'layerId', layer ->> 'id', 'slug', layer ->> 'slug', 'name', 'Parcelles d''essai', 'featureCount', 2,
    'version', 1, 'position', 0, 'visible', true, 'opacity', 1
  )),
  'linking a layer adds it to the map overlays with rank 0 and opacity 1'
)
FROM geographic_layer_fixture;
SELECT is(
  hall_api.set_geographic_map_overlay(map, (layer ->> 'id')::UUID, false, NULL) #> '{overlays,0,visible}',
  'false'::JSONB,
  'linking again changes the saved visibility of the existing link'
)
FROM geographic_layer_fixture;
SELECT is(
  (SELECT count(*)::INTEGER FROM hall.geographic_map_overlay WHERE geographic_resource_id = map),
  1,
  'a layer is linked at most once to a map'
)
FROM geographic_layer_fixture;
SELECT is(
  hall_api.open_resource(map) #> '{overlays,0,visible}',
  'false'::JSONB,
  'the map representation carries its overlays'
)
FROM geographic_layer_fixture;
SELECT ok(
  hall.resource_siren_actions(hall_api.open_resource(map)) @> '[
    {"name":"resource.import-geographic-layer"},
    {"name":"resource.link-geographic-layer"},
    {"name":"resource.unlink-geographic-layer"}
  ]'::JSONB,
  'the map offers the layer import, link and unlink actions to an administrator'
)
FROM geographic_layer_fixture;
SELECT ok(
  NOT hall.resource_siren_actions(hall_api.open_resource((layer ->> 'id')::UUID)) @> '[{"name":"resource.delete"}]'::JSONB,
  'a linked layer does not offer the delete action'
)
FROM geographic_layer_fixture;
SELECT throws_ok(
  format('SELECT hall_api.delete_resource(%L::uuid)', layer ->> 'id'),
  '23503', NULL,
  'a linked layer cannot be deleted'
)
FROM geographic_layer_fixture;

SELECT set_config('hall.roles', '["reader"]', true);
SELECT ok(
  NOT hall.resource_siren_actions(hall_api.open_resource(map)) @> '[{"name":"resource.link-geographic-layer"}]'::JSONB,
  'a reader is not offered the link action'
)
FROM geographic_layer_fixture;
-- @verifies-requirement HALL-FR-DOC-350
-- @verifies-requirement HALL-FR-DOC-550
SELECT set_config('hall.roles', '["contributor"]', true);
SELECT set_config('hall.permissions', '["workspace.read","workspace.write"]', true);
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_siren_actions(hall_api.open_resource(map))) AS action),
  ARRAY['resource.relocate', 'resource.update-metadata', 'resource.update-content', 'resource.import-geographic-layer', 'resource.link-geographic-layer', 'resource.unlink-geographic-layer', 'resource.create-geographic-feature-note', 'resource.delete'],
  'a role with workspace.write edits, renames, moves and deletes a common map, its layers and the notes of its drawings'
)
FROM geographic_layer_fixture;
SELECT is(
  ARRAY(SELECT action ->> 'name' FROM jsonb_array_elements(hall.resource_siren_actions(hall_api.open_resource((layer ->> 'id')::UUID))) AS action),
  ARRAY['resource.relocate', 'resource.update-metadata', 'resource.create-geographic-feature-note'],
  'a linked layer offers feature notes, renaming and moving; its deletion stays blocked by the map link'
)
FROM geographic_layer_fixture;
SELECT ok(
  hall_api.present_geographic_layer_collection('[]'::JSONB) -> 'actions' @> '[{"name":"resource.import-geographic-layer"}]'::JSONB,
  'the layer list offers the import to a role with workspace.write'
);
SELECT set_config('hall.permissions', '["workspace.read"]', true);
SELECT is(
  hall_api.present_geographic_layer_collection('[]'::JSONB) -> 'actions',
  NULL,
  'the layer list offers no import without workspace.write'
);
SELECT set_config('hall.permissions', '', true);
SELECT set_config('hall.roles', '["administrator"]', true);

SELECT is(
  jsonb_array_length(hall_api.remove_geographic_map_overlay(map, (layer ->> 'id')::UUID) -> 'overlays'),
  0,
  'unlinking removes the overlay from the map'
)
FROM geographic_layer_fixture;
SELECT throws_ok(
  format('SELECT hall_api.remove_geographic_map_overlay(%L::uuid, %L::uuid)', map, layer ->> 'id'),
  'HV601', 'Geographic overlay not found',
  'unlinking a layer that is not linked is reported as not found'
)
FROM geographic_layer_fixture;
SELECT lives_ok(
  format('SELECT hall_api.set_geographic_map_overlay(%L::uuid, %L::uuid, true, 0.5)', map, layer ->> 'id'),
  'the layer can be linked again'
)
FROM geographic_layer_fixture;
SELECT lives_ok(
  format('SELECT hall_api.delete_resource(%L::uuid)', map),
  'deleting the map removes its links'
)
FROM geographic_layer_fixture;
SELECT is(
  (SELECT count(*)::INTEGER FROM hall.geographic_map_overlay),
  0,
  'no overlay remains after the map deletion'
);
SELECT lives_ok(
  format('SELECT hall_api.delete_resource(%L::uuid)', layer ->> 'id'),
  'an unlinked layer can be deleted'
)
FROM geographic_layer_fixture;
SELECT is(
  (SELECT count(*)::INTEGER FROM hall.geographic_layer_feature),
  0,
  'deleting the layer deletes its features'
);

SELECT ok(
  has_function_privilege('hall_api_authenticated', 'hall_api.geographic_layer_features(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('hall_api_anonymous', 'hall_api.geographic_layer_features(uuid)', 'EXECUTE')
  AND NOT has_table_privilege('hall_api_authenticated', 'hall.geographic_layer_feature', 'SELECT'),
  'runtime roles read features only through the named API function'
);

SELECT * FROM finish();
ROLLBACK;
