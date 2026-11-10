-- @implements-requirement HALL-FR-DOC-080
-- @implements-requirement HALL-TR-DOC-010
CREATE TABLE hall.binary_object (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_sha256 TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CONSTRAINT "binary_object_media_type_check" CHECK (media_type = btrim(media_type) AND media_type <> ''::text),
  byte_size BIGINT NOT NULL CONSTRAINT "binary_object_byte_size_check" CHECK (byte_size >= 0),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT "binary_object_sha256_shape" CHECK (content_sha256 ~ '^[0-9a-f]{64}$'::text),
  CONSTRAINT "binary_object_byte_size_matches" CHECK (byte_size = octet_length(content)),
  CONSTRAINT "binary_object_sha256_matches" CHECK (content_sha256 = encode(sha256(content), 'hex'::text))
);

COMMENT ON TABLE hall.binary_object IS
  'Immutable content-addressed bytes. Media type describes the bytes, not the resource nature.';

-- Concrete components intentionally do not reference hall.resource. Resource
-- owns one component through the structural XOR declared below.

-- @implements-requirement HALL-FR-DOC-030
CREATE TABLE hall.folder_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- @implements-requirement HALL-FR-DOC-070
CREATE TABLE hall.text_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "text_resource_version_check" CHECK (version > 0)
);

CREATE TABLE hall.remote_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "remote_resource_version_check" CHECK (version > 0)
);

-- @implements-requirement HALL-FR-DOC-190
CREATE TABLE hall.remote_resource_target (
  remote_resource_id UUID PRIMARY KEY REFERENCES hall.remote_resource(id) ON DELETE CASCADE,
  url TEXT NOT NULL CONSTRAINT "remote_resource_target_url_check" CHECK (url = btrim(url) AND url <> ''::text)
);

-- @implements-requirement HALL-FR-DOC-260
CREATE TABLE hall.spreadsheet_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CONSTRAINT "spreadsheet_resource_document_check" CHECK (COALESCE(jsonb_typeof(document) = 'object'::text AND (document ->> 'schemaVersion'::text) = '2'::text AND jsonb_typeof(document -> 'workbook'::text) = 'object'::text, false)),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "spreadsheet_resource_version_check" CHECK (version > 0)
);

CREATE TABLE hall.event_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CONSTRAINT "event_resource_document_check" CHECK (hall.is_valid_event_document(document)),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "event_resource_version_check" CHECK (version > 0)
);

CREATE TABLE hall.geographic_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CONSTRAINT "geographic_resource_document_check" CHECK (COALESCE(jsonb_typeof(document) = 'object'::text AND jsonb_typeof(document -> 'view'::text) = 'object'::text AND jsonb_typeof(document -> 'layers'::text) = 'array'::text AND jsonb_array_length(document -> 'layers'::text) > 0 AND (document #>> '{hallLayer,type}'::text[]) = 'FeatureCollection'::text AND jsonb_typeof(document #> '{hallLayer,features}'::text[]) = 'array'::text AND jsonb_typeof(document -> 'provenance'::text) = 'object'::text AND (document #>> '{provenance,license}'::text[]) = 'Licence Ouverte 2.0'::text, false)),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "geographic_resource_version_check" CHECK (version > 0)
);

CREATE TABLE hall.legal_reference_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CONSTRAINT "legal_reference_resource_document_check" CHECK (COALESCE(jsonb_typeof(document) = 'object'::text AND (document ->> 'provider'::text) = 'legifrance'::text AND (document ->> 'referenceKind'::text) = 'article'::text AND jsonb_typeof(document -> 'snapshots'::text) = 'array'::text AND ((document ->> 'resolutionStatus'::text) = 'draft'::text AND jsonb_array_length(document -> 'snapshots'::text) = 0 OR (document ->> 'resolutionStatus'::text) = 'resolved'::text AND jsonb_array_length(document -> 'snapshots'::text) > 0 AND (document ->> 'snapshotHash'::text) ~ '^[0-9a-f]{64}$'::text), false)),
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "legal_reference_resource_version_check" CHECK (version > 0)
);

-- @implements-requirement HALL-FR-DOC-310
-- @implements-requirement HALL-FR-DOC-320
CREATE TABLE hall.geographic_layer_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source JSONB NOT NULL CONSTRAINT "geographic_layer_resource_source_check" CHECK (COALESCE(jsonb_typeof(source) = 'object'::text AND (source ->> 'format'::text) = 'geojson'::text AND (source ->> 'fileName'::text) <> ''::text AND (source ->> 'contentSha256'::text) ~ '^[0-9a-f]{64}$'::text AND jsonb_typeof(source -> 'byteSize'::text) = 'number'::text AND jsonb_typeof(source -> 'importedAt'::text) = 'string'::text, false)),
  feature_count INTEGER NOT NULL CONSTRAINT "geographic_layer_resource_feature_count_check" CHECK (feature_count >= 1 AND feature_count <= 20000),
  extent BOX NOT NULL CONSTRAINT "geographic_layer_resource_extent_check" CHECK (extent <@ '(180,90),(-180,-90)'::box),
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT "geographic_layer_resource_version_check" CHECK (version > 0),
  -- @implements-requirement HALL-FR-DOC-360
  feature_key_rule JSONB NOT NULL DEFAULT '{"kind": "none"}'::jsonb CONSTRAINT "geographic_layer_resource_feature_key_rule_check" CHECK ((feature_key_rule ->> 'kind'::text) = ANY (ARRAY['cadastreParcel'::text, 'sourceId'::text, 'none'::text])),
  -- @implements-requirement HALL-FR-DOC-380
  property_keys TEXT[] NOT NULL DEFAULT '{}'::text[]
);

COMMENT ON TABLE hall.geographic_layer_resource IS
  'One reusable geographic dataset. Its features are stored one per row in hall.geographic_layer_feature.';

-- @implements-requirement HALL-FR-DOC-310
-- @implements-requirement HALL-TR-DOC-080
CREATE TABLE hall.geographic_layer_feature (
  geographic_layer_resource_id UUID NOT NULL REFERENCES hall.geographic_layer_resource(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CONSTRAINT "geographic_layer_feature_position_check" CHECK (("position" >= 0)),
  source_id TEXT,
  geometry JSONB NOT NULL CONSTRAINT "geographic_layer_feature_geometry_check" CHECK (COALESCE(((geometry ->> 'type'::text) = ANY (ARRAY['Point'::text, 'MultiPoint'::text, 'LineString'::text, 'MultiLineString'::text, 'Polygon'::text, 'MultiPolygon'::text])) AND jsonb_typeof(geometry -> 'coordinates'::text) = 'array'::text, false)),
  properties JSONB NOT NULL CONSTRAINT "geographic_layer_feature_properties_check" CHECK (jsonb_typeof(properties) = ANY (ARRAY['object'::text, 'null'::text])),
  extent BOX NOT NULL CONSTRAINT "geographic_layer_feature_extent_check" CHECK (extent <@ '(180,90),(-180,-90)'::box),
  -- @implements-requirement HALL-FR-DOC-360
  feature_key TEXT CONSTRAINT "geographic_layer_feature_feature_key_check" CHECK (feature_key <> ''::text),
  -- @implements-requirement HALL-FR-DOC-370
  label TEXT CONSTRAINT "geographic_layer_feature_label_check" CHECK (label <> ''::text),
  PRIMARY KEY (geographic_layer_resource_id, position)
);

COMMENT ON TABLE hall.geographic_layer_feature IS
  'One GeoJSON feature of a geographic layer: WGS84 geometry, properties as received and a box extent.';

-- @implements-requirement HALL-TR-DOC-080
CREATE INDEX geographic_layer_feature_extent_idx ON hall.geographic_layer_feature USING gist (extent);

-- @implements-requirement HALL-FR-DOC-360
CREATE UNIQUE INDEX geographic_layer_feature_key_idx ON hall.geographic_layer_feature USING btree (geographic_layer_resource_id, feature_key) WHERE (feature_key IS NOT NULL);
CREATE INDEX geographic_layer_feature_key_lookup_idx ON hall.geographic_layer_feature USING btree (feature_key) WHERE (feature_key IS NOT NULL);

-- @implements-requirement HALL-FR-DOC-330
CREATE TABLE hall.geographic_map_overlay (
  geographic_resource_id UUID NOT NULL REFERENCES hall.geographic_resource(id) ON DELETE CASCADE,
  geographic_layer_resource_id UUID NOT NULL REFERENCES hall.geographic_layer_resource(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CONSTRAINT "geographic_map_overlay_position_check" CHECK (("position" >= 0)),
  visible BOOLEAN NOT NULL DEFAULT true,
  opacity NUMERIC(3,2) NOT NULL DEFAULT 1 CONSTRAINT "geographic_map_overlay_opacity_check" CHECK (opacity > 0::numeric AND opacity <= 1::numeric),
  PRIMARY KEY (geographic_resource_id, geographic_layer_resource_id),
  CONSTRAINT geographic_map_overlay_position_unique UNIQUE (geographic_resource_id, position)
);

-- @implements-requirement HALL-FR-DOC-390
-- @implements-requirement HALL-FR-DOC-430
-- A note is a text resource attached to a subject: its kind, its scope and its
-- stable key. Cadastre parcels are global subjects; other layer features are
-- scoped to their layer; drawn elements are scoped to their map.
CREATE TABLE hall.geographic_feature_note (
  text_resource_id UUID PRIMARY KEY REFERENCES hall.text_resource(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CONSTRAINT "geographic_feature_note_subject_kind_check" CHECK (subject_kind = ANY (ARRAY['cadastreParcel'::text, 'layerFeature'::text, 'drawnElement'::text])),
  geographic_layer_resource_id UUID REFERENCES hall.geographic_layer_resource(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL CONSTRAINT "geographic_feature_note_subject_key_check" CHECK (subject_key <> ''::text),
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  geographic_resource_id UUID REFERENCES hall.geographic_resource(id) ON DELETE CASCADE,
  CONSTRAINT "geographic_feature_note_scope_matches_kind" CHECK (subject_kind = 'cadastreParcel'::text AND geographic_layer_resource_id IS NULL AND geographic_resource_id IS NULL OR subject_kind = 'layerFeature'::text AND geographic_layer_resource_id IS NOT NULL AND geographic_resource_id IS NULL OR subject_kind = 'drawnElement'::text AND geographic_resource_id IS NOT NULL AND geographic_layer_resource_id IS NULL),
  CONSTRAINT geographic_feature_note_layer_subject_unique UNIQUE (geographic_layer_resource_id, subject_key),
  CONSTRAINT geographic_feature_note_map_subject_unique UNIQUE (geographic_resource_id, subject_key)
);

CREATE UNIQUE INDEX geographic_feature_note_parcel_subject_idx ON hall.geographic_feature_note USING btree (subject_key) WHERE (subject_kind = 'cadastreParcel'::text);

-- @implements-requirement HALL-FR-DOC-400
CREATE TABLE hall.municipal_property_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL CONSTRAINT "municipal_property_source_label_check" CHECK (label = btrim(label) AND label <> ''::text),
  file_name TEXT CONSTRAINT "municipal_property_source_file_name_check" CHECK (file_name <> ''::text),
  parcel_count INTEGER NOT NULL CONSTRAINT "municipal_property_source_parcel_count_check" CHECK (parcel_count >= 0),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  imported_by TEXT NOT NULL CONSTRAINT "municipal_property_source_imported_by_check" CHECK (imported_by <> ''::text),
  imported_by_name TEXT NOT NULL CONSTRAINT "municipal_property_source_imported_by_name_check" CHECK (imported_by_name <> ''::text)
);

COMMENT ON TABLE hall.municipal_property_source IS
  'Each import of the list of parcels owned by the commune; the latest one is the current list.';

-- @implements-requirement HALL-FR-DOC-400
CREATE TABLE hall.municipal_property_parcel (
  parcel_id TEXT PRIMARY KEY CONSTRAINT "municipal_property_parcel_parcel_id_check" CHECK (parcel_id ~ '^([0-9]{2}|2A|2B)[0-9]{6}([0-9A-Z][A-Z]|[A-Z][0-9A-Z])[0-9]{4}$'::text),
  municipal_property_source_id UUID NOT NULL REFERENCES hall.municipal_property_source(id) ON DELETE RESTRICT
);

COMMENT ON TABLE hall.geographic_map_overlay IS
  'Structural link from a map to a geographic layer, with the visibility, opacity and rank saved in the map.';

-- @implements-requirement HALL-FR-DOC-080
CREATE TABLE hall.document_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binary_object_id UUID NOT NULL REFERENCES hall.binary_object(id) ON DELETE RESTRICT
);

COMMENT ON TABLE hall.document_resource IS
  'One technical document resource. Business usages are modeled later by external relations.';

-- @implements-requirement HALL-FR-DOC-230
CREATE TABLE hall.editor_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_text_resource_id UUID NOT NULL REFERENCES hall.text_resource(id) ON DELETE CASCADE,
  binary_object_id UUID NOT NULL REFERENCES hall.binary_object(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CONSTRAINT "editor_asset_title_check" CHECK (title = btrim(title) AND title <> ''::text),
  file_name TEXT NOT NULL CONSTRAINT "editor_asset_file_name_check" CHECK (file_name = btrim(file_name) AND file_name <> ''::text),
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE hall.editor_asset IS
  'Private image owned by one text resource. It is intentionally outside the workspace Resource union.';

-- @implements-requirement HALL-FR-DOC-010
-- @implements-requirement HALL-FR-DOC-020
-- @implements-requirement HALL-FR-DOC-030
-- @implements-requirement HALL-FR-DOC-040
-- @implements-requirement HALL-FR-DOC-050
-- @implements-requirement HALL-FR-DOC-060
-- @implements-requirement HALL-TR-DOC-010
-- @implements-requirement HALL-TR-DOC-020
CREATE TABLE hall.resource (
  id UUID PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),

  folder_resource_id UUID UNIQUE REFERENCES hall.folder_resource(id) ON DELETE RESTRICT,
  text_resource_id UUID UNIQUE REFERENCES hall.text_resource(id) ON DELETE RESTRICT,
  remote_resource_id UUID UNIQUE REFERENCES hall.remote_resource(id) ON DELETE RESTRICT,
  spreadsheet_resource_id UUID UNIQUE REFERENCES hall.spreadsheet_resource(id) ON DELETE RESTRICT,
  event_resource_id UUID UNIQUE REFERENCES hall.event_resource(id) ON DELETE RESTRICT,
  geographic_resource_id UUID UNIQUE REFERENCES hall.geographic_resource(id) ON DELETE RESTRICT,
  document_resource_id UUID UNIQUE REFERENCES hall.document_resource(id) ON DELETE RESTRICT,
  legal_reference_resource_id UUID UNIQUE REFERENCES hall.legal_reference_resource(id) ON DELETE RESTRICT,

  full_path TEXT GENERATED ALWAYS AS (
    CASE
    WHEN (path = ''::text) THEN name
    ELSE ((path || '/'::text) || name)
END
  ) STORED,
  is_folder BOOLEAN GENERATED ALWAYS AS ((folder_resource_id IS NOT NULL)) STORED,
  container_path TEXT GENERATED ALWAYS AS (NULLIF(path, ''::text)) STORED,
  container_is_folder BOOLEAN GENERATED ALWAYS AS (true) STORED,
  -- Appended after the generated columns so an upgraded table keeps the same column order.
  geographic_layer_resource_id UUID UNIQUE REFERENCES hall.geographic_layer_resource(id) ON DELETE RESTRICT,
  -- @implements-requirement HALL-TR-SCH-060
  -- @implements-requirement HALL-FR-WSP-480
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "resource_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text),

  CONSTRAINT "resource_options_declared" CHECK ((options - 'color'::text) = '{}'::jsonb),
  CONSTRAINT "resource_options_color" CHECK (NOT (options ? 'color'::text) OR (folder_resource_id IS NOT NULL AND jsonb_typeof(options -> 'color'::text) = 'string'::text AND (options ->> 'color'::text) ~ '^#[0-9A-F]{6}$'::text)),

  CONSTRAINT "resource_path_shape" CHECK (hall.is_normalized_resource_path(path)),
  CONSTRAINT "resource_name_shape" CHECK (hall.is_valid_resource_name(name)),
  CONSTRAINT "resource_slug_shape" CHECK (hall.is_valid_resource_slug(slug)),
  CONSTRAINT resource_slug_unique UNIQUE (slug),
  CONSTRAINT "resource_one_nature" CHECK (num_nonnulls(folder_resource_id, text_resource_id, remote_resource_id, spreadsheet_resource_id, geographic_resource_id, event_resource_id, document_resource_id, legal_reference_resource_id, geographic_layer_resource_id) = 1),
  CONSTRAINT "resource_identity_matches_nature" CHECK (id = COALESCE(folder_resource_id, text_resource_id, remote_resource_id, spreadsheet_resource_id, geographic_resource_id, event_resource_id, document_resource_id, legal_reference_resource_id, geographic_layer_resource_id)),
  CONSTRAINT resource_location_unique UNIQUE (full_path) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT resource_folder_target UNIQUE (full_path, is_folder),
  CONSTRAINT resource_container_is_folder FOREIGN KEY (container_path, container_is_folder)
    REFERENCES hall.resource(full_path, is_folder)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE hall.resource IS
  'Flat resource namespace. Every non-root path references a durable folder resource.';

-- @implements-requirement HALL-FR-DOC-200
CREATE TABLE hall.resource_tag (
  resource_id UUID NOT NULL REFERENCES hall.resource(id) ON DELETE CASCADE,
  value TEXT NOT NULL CONSTRAINT "resource_tag_value_check" CHECK (value = btrim(value) AND value <> ''::text),
  PRIMARY KEY (resource_id, value)
);

-- @implements-requirement HALL-TR-DOC-030
CREATE INDEX resource_path_prefix_idx ON hall.resource USING btree (path text_pattern_ops);

-- @implements-requirement HALL-FR-WSP-380
-- Ownership is a relation to the folder identity, never derived from the
-- folder name or from the contact name.
CREATE TABLE hall.personal_workspace (
  contact UUID PRIMARY KEY REFERENCES hall.contact(id) ON DELETE RESTRICT,
  folder_resource UUID NOT NULL UNIQUE REFERENCES hall.folder_resource(id) ON DELETE CASCADE
);

COMMENT ON TABLE hall.personal_workspace IS
  'Personal folder of one council member contact, placed directly under the reserved personal workspaces root.';

-- Derived contact references enforce the same identity integrity as the directory.
CREATE TABLE hall.event_contact_reference (
  event_resource_id UUID NOT NULL REFERENCES hall.event_resource(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES hall.contact(id) ON DELETE RESTRICT,
  PRIMARY KEY (event_resource_id, contact_id)
);
CREATE FUNCTION hall.sync_event_contact_references()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $function$
BEGIN
  DELETE FROM hall.event_contact_reference WHERE event_resource_id = NEW.id;
  INSERT INTO hall.event_contact_reference(event_resource_id, contact_id)
    SELECT DISTINCT NEW.id, (participant ->> 'contactId')::uuid
    FROM jsonb_array_elements(NEW.document -> 'participants') AS participant
    WHERE participant ->> 'kind' = 'contact';
  RETURN NEW;
END
$function$;
CREATE TRIGGER event_contact_references
AFTER INSERT OR UPDATE OF document ON hall.event_resource
FOR EACH ROW EXECUTE FUNCTION hall.sync_event_contact_references();
