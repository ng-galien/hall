-- Geographic layers
-- =================
-- A geographic layer is a resource nature whose features are stored one per
-- row. The server validates the uploaded GeoJSON and computes each feature
-- extent; PostgreSQL stores the rows, derives the layer extent and enforces
-- the WGS84 bounds and the closed geometry types.

-- @implements-requirement HALL-FR-DOC-310
-- @implements-requirement HALL-FR-DOC-320
CREATE FUNCTION hall_api.create_geographic_layer_resource(
  parent_path TEXT,
  resource_name TEXT,
  layer_source JSONB,
  layer_features JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  IF jsonb_typeof(layer_features) IS DISTINCT FROM 'array'
     OR jsonb_array_length(layer_features) NOT BETWEEN 1 AND 20000
     OR EXISTS (
       SELECT FROM jsonb_array_elements(layer_features) AS item(feature)
       WHERE jsonb_typeof(feature -> 'bbox') IS DISTINCT FROM 'array'
          OR jsonb_array_length(feature -> 'bbox') <> 4
          OR EXISTS (
            SELECT FROM jsonb_array_elements(feature -> 'bbox') AS bound(value)
            WHERE jsonb_typeof(value) <> 'number'
          )
          OR (feature ? 'sourceId' AND jsonb_typeof(feature -> 'sourceId') NOT IN ('string', 'null'))
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Geographic layer features are invalid';
  END IF;

  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);

  WITH feature_extent AS (
    SELECT box(
      point((feature #>> '{bbox,0}')::double precision, (feature #>> '{bbox,1}')::double precision),
      point((feature #>> '{bbox,2}')::double precision, (feature #>> '{bbox,3}')::double precision)
    ) AS extent
    FROM jsonb_array_elements(layer_features) AS item(feature)
  )
  INSERT INTO hall.geographic_layer_resource (id, source, feature_count, extent)
  SELECT resource_id,
         layer_source,
         count(*)::integer,
         box(
           point(min((feature_extent.extent[1])[0]), min((feature_extent.extent[1])[1])),
           point(max((feature_extent.extent[0])[0]), max((feature_extent.extent[0])[1]))
         )
  FROM feature_extent;

  INSERT INTO hall.geographic_layer_feature (
    geographic_layer_resource_id, position, source_id, geometry, properties, extent
  )
  SELECT resource_id,
         (item.ordinality - 1)::integer,
         item.feature ->> 'sourceId',
         item.feature -> 'geometry',
         coalesce(item.feature -> 'properties', 'null'::jsonb),
         box(
           point((item.feature #>> '{bbox,0}')::double precision, (item.feature #>> '{bbox,1}')::double precision),
           point((item.feature #>> '{bbox,2}')::double precision, (item.feature #>> '{bbox,3}')::double precision)
         )
  FROM jsonb_array_elements(layer_features) WITH ORDINALITY AS item(feature, ordinality);

  INSERT INTO hall.resource (id, path, name, slug, geographic_layer_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

-- @implements-requirement HALL-FR-DOC-310
CREATE FUNCTION hall_api.list_geographic_layer_resources()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.resource_detail(resource.id) ORDER BY resource.path, resource.name, resource.id),
    '[]'::jsonb
  )
  FROM hall.resource AS resource
  WHERE resource.geographic_layer_resource_id IS NOT NULL
$function$;

-- @implements-requirement HALL-FR-DOC-310
-- The whole layer is returned as one RFC 7946 FeatureCollection. Each feature
-- carries its rank as GeoJSON id and the identifier read from the source file
-- as the foreign member sourceId.
CREATE FUNCTION hall_api.geographic_layer_features(resource_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'geographicLayer');
  RETURN jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'id', feature.position,
            'sourceId', feature.source_id,
            'geometry', feature.geometry,
            'properties', feature.properties
          )
          ORDER BY feature.position
        )
        FROM hall.geographic_layer_feature AS feature
        WHERE feature.geographic_layer_resource_id = resource_id
      ),
      '[]'::jsonb
    )
  );
END
$function$;

-- @implements-requirement HALL-FR-DOC-330
-- Links a layer to a map, or changes the saved visibility and opacity of an
-- existing link. A new link takes the rank after the last rank of the map.
CREATE FUNCTION hall_api.set_geographic_map_overlay(
  map_id UUID,
  layer_id UUID,
  overlay_visible BOOLEAN,
  overlay_opacity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF overlay_visible IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Geographic overlay visibility is required';
  END IF;
  PERFORM hall.require_resource(map_id, 'geographic');
  PERFORM hall.require_resource(layer_id, 'geographicLayer');
  PERFORM 1 FROM hall.geographic_resource WHERE id = map_id FOR UPDATE;

  UPDATE hall.geographic_map_overlay
  SET visible = overlay_visible,
      opacity = coalesce(overlay_opacity, opacity)
  WHERE geographic_resource_id = map_id
    AND geographic_layer_resource_id = layer_id;
  IF NOT FOUND THEN
    INSERT INTO hall.geographic_map_overlay (
      geographic_resource_id, geographic_layer_resource_id, position, visible, opacity
    )
    SELECT map_id,
           layer_id,
           coalesce(max(overlay.position) + 1, 0),
           overlay_visible,
           coalesce(overlay_opacity, 1)
    FROM hall.geographic_map_overlay AS overlay
    WHERE overlay.geographic_resource_id = map_id;
  END IF;

  PERFORM hall.touch_resource(map_id);
  RETURN hall.resource_detail(map_id);
END
$function$;

-- @implements-requirement HALL-FR-DOC-330
CREATE FUNCTION hall_api.remove_geographic_map_overlay(map_id UUID, layer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(map_id, 'geographic');
  PERFORM 1 FROM hall.geographic_resource WHERE id = map_id FOR UPDATE;
  DELETE FROM hall.geographic_map_overlay
  WHERE geographic_resource_id = map_id
    AND geographic_layer_resource_id = layer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV601', MESSAGE = 'Geographic overlay not found';
  END IF;
  PERFORM hall.touch_resource(map_id);
  RETURN hall.resource_detail(map_id);
END
$function$;
