-- Geographic layers
-- =================
-- A geographic layer is a resource nature whose features are stored one per
-- row. The server validates the uploaded GeoJSON and computes each feature
-- extent; PostgreSQL stores the rows, derives the layer extent and enforces
-- the WGS84 bounds and the closed geometry types.

-- @implements-requirement HALL-FR-DOC-310
-- @implements-requirement HALL-FR-DOC-320
-- @implements-requirement HALL-FR-DOC-360
-- The server determines the key rule and each feature key and label; the
-- database checks that keys follow the rule and are unique within the layer.
CREATE FUNCTION hall_api.create_geographic_layer_resource(
  parent_path TEXT,
  resource_name TEXT,
  layer_source JSONB,
  feature_key_rule JSONB,
  property_keys TEXT[],
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
          OR (feature ? 'label' AND jsonb_typeof(feature -> 'label') NOT IN ('string', 'null'))
          OR CASE feature_key_rule ->> 'kind'
               WHEN 'none' THEN jsonb_typeof(feature -> 'key') IS DISTINCT FROM 'null' AND feature ? 'key'
               WHEN 'cadastreParcel' THEN NOT coalesce(
                 feature ->> 'key' ~ '^([0-9]{2}|2A|2B)[0-9]{6}([0-9A-Z][A-Z]|[A-Z][0-9A-Z])[0-9]{4}$', false)
               ELSE jsonb_typeof(feature -> 'key') IS DISTINCT FROM 'string'
             END
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Geographic layer features are invalid';
  END IF;

  PERFORM hall.lock_resource_namespace();
  PERFORM hall.require_location_write(hall.child_full_path(parent_path, coalesce(resource_name, '')));
  PERFORM hall.ensure_folder_path(parent_path);

  WITH feature_extent AS (
    SELECT box(
      point((feature #>> '{bbox,0}')::double precision, (feature #>> '{bbox,1}')::double precision),
      point((feature #>> '{bbox,2}')::double precision, (feature #>> '{bbox,3}')::double precision)
    ) AS extent
    FROM jsonb_array_elements(layer_features) AS item(feature)
  )
  INSERT INTO hall.geographic_layer_resource (id, source, feature_count, extent, feature_key_rule, property_keys)
  SELECT resource_id,
         layer_source,
         count(*)::integer,
         box(
           point(min((feature_extent.extent[1])[0]), min((feature_extent.extent[1])[1])),
           point(max((feature_extent.extent[0])[0]), max((feature_extent.extent[0])[1]))
         ),
         feature_key_rule,
         coalesce(property_keys, ARRAY[]::TEXT[])
  FROM feature_extent;

  INSERT INTO hall.geographic_layer_feature (
    geographic_layer_resource_id, position, source_id, geometry, properties, extent, feature_key, label
  )
  SELECT resource_id,
         (item.ordinality - 1)::integer,
         item.feature ->> 'sourceId',
         item.feature -> 'geometry',
         coalesce(item.feature -> 'properties', 'null'::jsonb),
         box(
           point((item.feature #>> '{bbox,0}')::double precision, (item.feature #>> '{bbox,1}')::double precision),
           point((item.feature #>> '{bbox,2}')::double precision, (item.feature #>> '{bbox,3}')::double precision)
         ),
         item.feature ->> 'key',
         item.feature ->> 'label'
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
            'key', feature.feature_key,
            'label', feature.label,
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

-- @implements-requirement HALL-FR-DOC-380
-- JSONB does not keep key order: properties are written as text in the key
-- order recorded at import; keys absent from that order come last.
CREATE FUNCTION hall.geographic_ordered_properties(properties JSONB, property_keys TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(properties) = 'object' THEN (
      SELECT '{' || coalesce(
        string_agg(to_jsonb(entry.key)::text || ': ' || entry.value::text, ', '
          ORDER BY coalesce(array_position(property_keys, entry.key), 2147483647), entry.key),
        ''
      ) || '}'
      FROM jsonb_each(properties) AS entry
    )
    ELSE properties::text
  END
$function$;

-- @implements-requirement HALL-FR-DOC-310
-- @implements-requirement HALL-FR-DOC-380
-- The FeatureCollection served over HTTP, as text with properties in file order.
CREATE FUNCTION hall_api.geographic_layer_features_text(resource_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  keys TEXT[];
BEGIN
  PERFORM hall.require_resource(resource_id, 'geographicLayer');
  SELECT layer.property_keys INTO keys FROM hall.geographic_layer_resource AS layer WHERE layer.id = resource_id;
  RETURN '{"type": "FeatureCollection", "features": [' || coalesce((
    SELECT string_agg(
      '{"type": "Feature", "id": ' || feature.position
        || ', "sourceId": ' || coalesce(to_jsonb(feature.source_id)::text, 'null')
        || ', "key": ' || coalesce(to_jsonb(feature.feature_key)::text, 'null')
        || ', "label": ' || coalesce(to_jsonb(feature.label)::text, 'null')
        || ', "geometry": ' || feature.geometry::text
        || ', "properties": ' || hall.geographic_ordered_properties(feature.properties, keys) || '}',
      ', ' ORDER BY feature.position)
    FROM hall.geographic_layer_feature AS feature
    WHERE feature.geographic_layer_resource_id = resource_id
  ), '') || ']}';
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
  PERFORM hall.require_location_write((SELECT full_path FROM hall.require_resource(map_id, 'geographic')));
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
  PERFORM hall.require_location_write((SELECT full_path FROM hall.require_resource(map_id, 'geographic')));
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

-- @implements-requirement HALL-FR-DOC-390
CREATE FUNCTION hall.geographic_feature_note_entry(note hall.geographic_feature_note)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'key', note.subject_key,
    'subjectKind', note.subject_kind,
    'noteId', resource.id,
    'slug', resource.slug,
    'name', resource.name,
    'fullPath', resource.full_path
  )
  FROM hall.resource AS resource
  WHERE resource.text_resource_id = note.text_resource_id
$function$;

-- @implements-requirement HALL-FR-DOC-390
-- Lists the notes of the subjects present in a layer: cadastre parcel notes
-- follow the parcel id in any layer; other notes belong to their layer.
CREATE FUNCTION hall_api.geographic_feature_notes(layer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  rule TEXT;
BEGIN
  PERFORM hall.require_resource(layer_id, 'geographicLayer');
  SELECT layer.feature_key_rule ->> 'kind' INTO rule FROM hall.geographic_layer_resource AS layer WHERE layer.id = layer_id;
  RETURN coalesce((
    SELECT jsonb_agg(hall.geographic_feature_note_entry(note) ORDER BY note.subject_key)
    FROM hall.geographic_feature_note AS note
    WHERE (rule = 'cadastreParcel' AND note.subject_kind = 'cadastreParcel' AND EXISTS (
            SELECT FROM hall.geographic_layer_feature AS feature
            WHERE feature.geographic_layer_resource_id = layer_id AND feature.feature_key = note.subject_key))
       OR (rule = 'sourceId' AND note.subject_kind = 'layerFeature' AND note.geographic_layer_resource_id = layer_id)
  ), '[]'::jsonb);
END
$function$;

-- @implements-requirement HALL-FR-DOC-390
-- Returns the note of a feature, creating an empty text resource in the
-- "Notes cartographiques" folder of the layer's folder when none exists.
CREATE FUNCTION hall_api.create_geographic_feature_note(layer_id UUID, feature_position INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  layer_resource hall.resource;
  rule TEXT;
  feature_key_value TEXT;
  feature_label TEXT;
  note_kind TEXT;
  note_scope UUID;
  existing hall.geographic_feature_note;
  folder_path TEXT;
  base_name TEXT;
  note_name TEXT;
  suffix INTEGER := 2;
  created JSONB;
BEGIN
  PERFORM hall.lock_resource_namespace();
  SELECT * INTO layer_resource FROM hall.require_resource(layer_id, 'geographicLayer');
  SELECT layer.feature_key_rule ->> 'kind' INTO rule FROM hall.geographic_layer_resource AS layer WHERE layer.id = layer_id;
  SELECT feature.feature_key, feature.label INTO feature_key_value, feature_label
  FROM hall.geographic_layer_feature AS feature
  WHERE feature.geographic_layer_resource_id = layer_id AND feature.position = feature_position;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV601', MESSAGE = 'Geographic feature not found';
  END IF;
  IF rule = 'none' OR feature_key_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV609', MESSAGE = 'Geographic feature has no stable identifier';
  END IF;
  note_kind := CASE rule WHEN 'cadastreParcel' THEN 'cadastreParcel' ELSE 'layerFeature' END;
  note_scope := CASE rule WHEN 'cadastreParcel' THEN NULL ELSE layer_id END;
  SELECT * INTO existing FROM hall.geographic_feature_note AS note
  WHERE note.subject_kind = note_kind AND note.subject_key = feature_key_value
    AND note.geographic_layer_resource_id IS NOT DISTINCT FROM note_scope;
  IF FOUND THEN
    RETURN hall.geographic_feature_note_entry(existing);
  END IF;

  folder_path := CASE WHEN layer_resource.path = '' THEN 'Notes cartographiques'
                      ELSE layer_resource.path || '/Notes cartographiques' END;
  base_name := left(replace(CASE note_kind
    WHEN 'cadastreParcel' THEN 'Parcelle ' || coalesce(feature_label || ' (' || feature_key_value || ')', feature_key_value)
    ELSE layer_resource.name || ' - ' || feature_key_value
  END, '/', '-'), 190);
  note_name := base_name;
  WHILE EXISTS (SELECT FROM hall.resource AS resource WHERE resource.path = folder_path AND lower(resource.name) = lower(note_name)) LOOP
    note_name := base_name || ' (' || suffix::TEXT || ')';
    suffix := suffix + 1;
  END LOOP;
  created := hall_api.create_text_resource(folder_path, note_name, '');
  INSERT INTO hall.geographic_feature_note (text_resource_id, subject_kind, geographic_layer_resource_id, subject_key)
  VALUES ((created ->> 'id')::UUID, note_kind, note_scope, feature_key_value)
  RETURNING * INTO existing;
  RETURN hall.geographic_feature_note_entry(existing);
END
$function$;

-- @implements-requirement HALL-FR-DOC-430
-- Lists the notes linked to the drawn elements of a map.
CREATE FUNCTION hall_api.geographic_drawn_element_notes(map_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(map_id, 'geographic');
  RETURN coalesce((
    SELECT jsonb_agg(hall.geographic_feature_note_entry(note) ORDER BY note.subject_key)
    FROM hall.geographic_feature_note AS note
    WHERE note.subject_kind = 'drawnElement' AND note.geographic_resource_id = map_id
  ), '[]'::jsonb);
END
$function$;

-- @implements-requirement HALL-FR-DOC-430
-- Returns the note of a drawn element of the saved map, creating an empty text
-- resource in the "Notes cartographiques" folder of the map's folder when none exists.
CREATE FUNCTION hall_api.create_geographic_drawn_element_note(map_id UUID, element_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  map_resource hall.resource;
  element_label TEXT;
  element_kind TEXT;
  existing hall.geographic_feature_note;
  folder_path TEXT;
  base_name TEXT;
  note_name TEXT;
  suffix INTEGER := 2;
  created JSONB;
BEGIN
  PERFORM hall.lock_resource_namespace();
  SELECT * INTO map_resource FROM hall.require_resource(map_id, 'geographic');
  SELECT nullif(btrim(element.value #>> '{properties,label}'), ''), element.value #>> '{properties,kind}'
  INTO element_label, element_kind
  FROM hall.geographic_resource AS map,
       jsonb_array_elements(map.document #> '{hallLayer,features}') AS element(value)
  WHERE map.id = map_id AND element.value ->> 'id' = element_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV601', MESSAGE = 'Geographic feature not found';
  END IF;
  IF element_kind IN ('lengthMeasurement', 'areaMeasurement') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV613', MESSAGE = 'A saved measurement has no note';
  END IF;
  SELECT * INTO existing FROM hall.geographic_feature_note AS note
  WHERE note.subject_kind = 'drawnElement' AND note.geographic_resource_id = map_id AND note.subject_key = element_id;
  IF FOUND THEN
    RETURN hall.geographic_feature_note_entry(existing);
  END IF;

  folder_path := CASE WHEN map_resource.path = '' THEN 'Notes cartographiques'
                      ELSE map_resource.path || '/Notes cartographiques' END;
  base_name := left(replace(map_resource.name || ' - ' || coalesce(element_label, element_id), '/', '-'), 190);
  note_name := base_name;
  WHILE EXISTS (SELECT FROM hall.resource AS resource WHERE resource.path = folder_path AND lower(resource.name) = lower(note_name)) LOOP
    note_name := base_name || ' (' || suffix::TEXT || ')';
    suffix := suffix + 1;
  END LOOP;
  created := hall_api.create_text_resource(folder_path, note_name, '');
  INSERT INTO hall.geographic_feature_note (text_resource_id, subject_kind, geographic_resource_id, subject_key)
  VALUES ((created ->> 'id')::UUID, 'drawnElement', map_id, element_id)
  RETURNING * INTO existing;
  RETURN hall.geographic_feature_note_entry(existing);
END
$function$;

-- @implements-requirement HALL-FR-DOC-400
CREATE FUNCTION hall_api.municipal_property()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  WITH sources AS (
    SELECT source.id,
           jsonb_build_object(
             'id', source.id,
             'label', source.label,
             'fileName', source.file_name,
             'parcelCount', source.parcel_count,
             'importedAt', source.imported_at,
             'importedBy', source.imported_by_name
           ) AS entry,
           row_number() OVER (ORDER BY source.imported_at DESC, source.id DESC) AS recency
    FROM hall.municipal_property_source AS source
  )
  SELECT jsonb_build_object(
    'source', (SELECT sources.entry FROM sources WHERE sources.recency = 1),
    'sources', coalesce(
      (SELECT jsonb_agg(sources.entry ORDER BY sources.recency) FROM sources
       WHERE EXISTS (SELECT FROM hall.municipal_property_parcel AS parcel WHERE parcel.municipal_property_source_id = sources.id)),
      '[]'::jsonb
    ),
    'parcelIds', coalesce(
      (SELECT jsonb_agg(parcel.parcel_id ORDER BY parcel.parcel_id) FROM hall.municipal_property_parcel AS parcel),
      '[]'::jsonb
    ),
    'parcelSourceIds', coalesce(
      (SELECT jsonb_object_agg(parcel.parcel_id, parcel.municipal_property_source_id) FROM hall.municipal_property_parcel AS parcel),
      '{}'::jsonb
    ),
    'matchedParcelCount', (
      SELECT count(DISTINCT feature.feature_key)::INTEGER
      FROM hall.geographic_layer_feature AS feature
      JOIN hall.geographic_layer_resource AS layer ON layer.id = feature.geographic_layer_resource_id
      JOIN hall.municipal_property_parcel AS parcel ON parcel.parcel_id = feature.feature_key
      WHERE layer.feature_key_rule ->> 'kind' = 'cadastreParcel'
    )
  )
$function$;

-- @implements-requirement HALL-FR-DOC-400
-- Adds the parcels carried by a council business bundle that the list lacks,
-- each source recorded as "label (dossier d'affaire importé)".
CREATE FUNCTION hall.import_municipal_parcels(carried JSONB)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  carried_source JSONB;
  missing TEXT[];
  target_source UUID;
BEGIN
  IF carried IS NULL OR jsonb_typeof(carried) <> 'object' THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hall.municipal_property', 0));
  FOR carried_source IN SELECT value FROM jsonb_array_elements(coalesce(carried -> 'sources', '[]'::jsonb)) LOOP
    SELECT coalesce(array_agg(DISTINCT parcel ->> 'parcelId'), ARRAY[]::TEXT[]) INTO missing
    FROM jsonb_array_elements(coalesce(carried -> 'parcels', '[]'::jsonb)) AS item(parcel)
    WHERE parcel ->> 'sourceId' = carried_source ->> 'id'
      AND NOT EXISTS (SELECT FROM hall.municipal_property_parcel AS existing WHERE existing.parcel_id = parcel ->> 'parcelId');
    CONTINUE WHEN cardinality(missing) = 0;
    INSERT INTO hall.municipal_property_source (label, file_name, parcel_count, imported_by, imported_by_name)
    VALUES (
      left(carried_source ->> 'label', 170) || ' (dossier d’affaire importé)',
      carried_source ->> 'fileName',
      cardinality(missing),
      coalesce(hall.call_context() ->> 'actorId', 'unknown'),
      carried_source ->> 'importedBy'
    )
    RETURNING id INTO target_source;
    INSERT INTO hall.municipal_property_parcel (parcel_id, municipal_property_source_id)
    SELECT value, target_source FROM unnest(missing) AS value;
  END LOOP;
END
$function$;

-- @implements-requirement HALL-FR-DOC-400
-- Replaces the current list of municipal parcels and records its source.
CREATE FUNCTION hall_api.replace_municipal_property(
  source_label TEXT,
  source_file_name TEXT,
  importer_name TEXT,
  parcel_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  source_id UUID;
  actor TEXT := hall.call_context() ->> 'actorId';
BEGIN
  IF parcel_ids IS NULL OR cardinality(parcel_ids) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Municipal property parcel list is invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hall.municipal_property', 0));
  INSERT INTO hall.municipal_property_source (label, file_name, parcel_count, imported_by, imported_by_name)
  VALUES (source_label, source_file_name, (SELECT count(DISTINCT value)::INTEGER FROM unnest(parcel_ids) AS value),
          coalesce(actor, 'unknown'), importer_name)
  RETURNING id INTO source_id;
  DELETE FROM hall.municipal_property_parcel;
  INSERT INTO hall.municipal_property_parcel (parcel_id, municipal_property_source_id)
  SELECT DISTINCT value, source_id FROM unnest(parcel_ids) AS value;
  RETURN hall_api.municipal_property();
END
$function$;
