-- @functional-requirement HALL-FR-DOC-080 BINARY_CONTENT_IS_SEPARATE:
-- @technical-requirement HALL-TR-DOC-010 UUID_IDENTITIES:
CREATE TABLE hall.binary_object (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_sha256 TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type = btrim(media_type) AND media_type <> ''),
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT binary_object_sha256_shape CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT binary_object_byte_size_matches CHECK (byte_size = octet_length(content)),
  CONSTRAINT binary_object_sha256_matches CHECK (content_sha256 = encode(sha256(content), 'hex'))
);

COMMENT ON TABLE hall.binary_object IS
  'Immutable content-addressed bytes. Media type describes the bytes, not the resource nature.';

-- Concrete components intentionally do not reference hall.resource. Resource
-- owns one component through the structural XOR declared below.

-- @functional-requirement HALL-FR-DOC-030 FOLDER_IS_A_RESOURCE:
CREATE TABLE hall.folder_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- @functional-requirement HALL-FR-DOC-070 COMPLEX_CONTENT_IS_STRUCTURED:
CREATE TABLE hall.text_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE hall.remote_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- @functional-requirement HALL-FR-DOC-190 REMOTE_TARGET_IS_STRUCTURAL:
CREATE TABLE hall.remote_resource_target (
  remote_resource_id UUID PRIMARY KEY REFERENCES hall.remote_resource(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (url = btrim(url) AND url <> '')
);

-- @functional-requirement HALL-FR-DOC-260 STRUCTURED_CONTENT_HAS_A_VALID_SHAPE:
CREATE TABLE hall.spreadsheet_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CHECK (COALESCE((
    jsonb_typeof(document) = 'object'
    AND document ->> 'schemaVersion' = '2'
    AND jsonb_typeof(document -> 'workbook') = 'object'
  ), false)),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE hall.event_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CHECK (hall.is_valid_event_document(document)),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE hall.geographic_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CHECK (COALESCE((
    jsonb_typeof(document) = 'object'
    AND jsonb_typeof(document -> 'view') = 'object'
    AND jsonb_typeof(document -> 'layers') = 'array'
    AND jsonb_array_length(document -> 'layers') > 0
    AND document #>> '{hallLayer,type}' = 'FeatureCollection'
    AND jsonb_typeof(document #> '{hallLayer,features}') = 'array'
    AND jsonb_typeof(document -> 'provenance') = 'object'
    AND document #>> '{provenance,license}' = 'Licence Ouverte 2.0'
  ), false)),
  autosave_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE hall.legal_reference_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document JSONB NOT NULL CHECK (COALESCE((
    jsonb_typeof(document) = 'object'
    AND document ->> 'provider' = 'legifrance'
    AND document ->> 'referenceKind' = 'article'
    AND jsonb_typeof(document -> 'snapshots') = 'array'
    AND (
      (
        document ->> 'resolutionStatus' = 'draft'
        AND jsonb_array_length(document -> 'snapshots') = 0
      )
      OR (
        document ->> 'resolutionStatus' = 'resolved'
        AND jsonb_array_length(document -> 'snapshots') > 0
        AND document ->> 'snapshotHash' ~ '^[0-9a-f]{64}$'
      )
    )
  ), false)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- @requirement-reference HALL-FR-DOC-080 BINARY_CONTENT_IS_SEPARATE:
CREATE TABLE hall.document_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binary_object_id UUID NOT NULL REFERENCES hall.binary_object(id) ON DELETE RESTRICT
);

COMMENT ON TABLE hall.document_resource IS
  'One technical document resource. Business usages are modeled later by external relations.';

-- @functional-requirement HALL-FR-DOC-230 EDITOR_ASSET_BELONGS_TO_TEXT_CONTENT:
CREATE TABLE hall.editor_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_text_resource_id UUID NOT NULL REFERENCES hall.text_resource(id) ON DELETE CASCADE,
  binary_object_id UUID NOT NULL REFERENCES hall.binary_object(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (title = btrim(title) AND title <> ''),
  file_name TEXT NOT NULL CHECK (file_name = btrim(file_name) AND file_name <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE hall.editor_asset IS
  'Private image owned by one text resource. It is intentionally outside the workspace Resource union.';

-- @functional-requirement HALL-FR-DOC-010 RESOURCE_HAS_EXACTLY_ONE_NATURE:
-- @requirement-reference HALL-FR-DOC-020 RESOURCE_LOCATION_IS_NORMALIZED:
-- @requirement-reference HALL-FR-DOC-030 FOLDER_IS_A_RESOURCE:
-- @functional-requirement HALL-FR-DOC-040 CONTAINER_IS_A_FOLDER:
-- @functional-requirement HALL-FR-DOC-050 ROOT_IS_IMPLICIT:
-- @functional-requirement HALL-FR-DOC-060 FOLDER_DELETION_IS_EXPLICIT:
-- @requirement-reference HALL-TR-DOC-010 UUID_IDENTITIES:
-- @technical-requirement HALL-TR-DOC-020 DECLARATIVE_INVARIANTS_ARE_INLINE:
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
    CASE WHEN path = '' THEN name ELSE path || '/' || name END
  ) STORED,
  is_folder BOOLEAN GENERATED ALWAYS AS (folder_resource_id IS NOT NULL) STORED,
  container_path TEXT GENERATED ALWAYS AS (NULLIF(path, '')) STORED,
  container_is_folder BOOLEAN GENERATED ALWAYS AS (true) STORED,

  CONSTRAINT resource_path_shape CHECK (hall.is_normalized_resource_path(path)),
  CONSTRAINT resource_name_shape CHECK (hall.is_valid_resource_name(name)),
  CONSTRAINT resource_slug_shape CHECK (hall.is_valid_resource_slug(slug)),
  CONSTRAINT resource_slug_unique UNIQUE (slug),
  CONSTRAINT resource_one_nature CHECK (
    num_nonnulls(
      folder_resource_id,
      text_resource_id,
      remote_resource_id,
      spreadsheet_resource_id,
      geographic_resource_id,
      event_resource_id,
      document_resource_id,
      legal_reference_resource_id
    ) = 1
  ),
  CONSTRAINT resource_identity_matches_nature CHECK (
    id = coalesce(
      folder_resource_id,
      text_resource_id,
      remote_resource_id,
      spreadsheet_resource_id,
      geographic_resource_id,
      event_resource_id,
      document_resource_id,
      legal_reference_resource_id
    )
  ),
  CONSTRAINT resource_location_unique UNIQUE (full_path) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT resource_folder_target UNIQUE (full_path, is_folder),
  CONSTRAINT resource_container_is_folder FOREIGN KEY (container_path, container_is_folder)
    REFERENCES hall.resource(full_path, is_folder)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE hall.resource IS
  'Flat resource namespace. Every non-root path references a durable folder resource.';

-- @functional-requirement HALL-FR-DOC-200 RESOURCE_PRESENTATION_IS_AUTHORITATIVE:
CREATE TABLE hall.resource_tag (
  resource_id UUID NOT NULL REFERENCES hall.resource(id) ON DELETE CASCADE,
  value TEXT NOT NULL CHECK (value = btrim(value) AND value <> ''),
  PRIMARY KEY (resource_id, value)
);

-- @technical-requirement HALL-TR-DOC-030 PREFIX_LOOKUPS_ARE_INDEXED:
CREATE INDEX resource_path_prefix_idx
  ON hall.resource (path text_pattern_ops);

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
