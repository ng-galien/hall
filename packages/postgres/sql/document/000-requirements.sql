-- Documentary model requirement catalogue
-- =======================================
--
-- Functional identifiers use HALL-FR-DOC-NNN. Technical identifiers use
-- HALL-TR-DOC-NNN. Numbers advance by ten and are never reused.

-- @functional-requirement HALL-FR-DOC-010 RESOURCE_HAS_EXACTLY_ONE_NATURE:
-- A resource shares its identity with exactly one concrete technical
-- component. Its nature is derived from that component and is not stored as a
-- second discriminant.

-- @functional-requirement HALL-FR-DOC-020 RESOURCE_LOCATION_IS_NORMALIZED:
-- A resource has a normalized containing path and one non-empty local name.
-- Their composition is its unique full path.

-- @functional-requirement HALL-FR-DOC-030 FOLDER_IS_A_RESOURCE:
-- A folder is a durable resource nature. It has the same stable identity and
-- location rules as every other resource.

-- @functional-requirement HALL-FR-DOC-040 CONTAINER_IS_A_FOLDER:
-- Every non-root containing path resolves to an existing resource whose
-- concrete nature is folder.

-- @functional-requirement HALL-FR-DOC-050 ROOT_IS_IMPLICIT:
-- The empty containing path denotes the implicit workspace root. The root is
-- not persisted as a special resource row.

-- @functional-requirement HALL-FR-DOC-060 FOLDER_DELETION_IS_EXPLICIT:
-- A folder that contains resources cannot be deleted. Removing its last child
-- never deletes the folder automatically.

-- @functional-requirement HALL-FR-DOC-070 COMPLEX_CONTENT_IS_STRUCTURED:
-- Text, spreadsheet, geographic and legal-reference content keep their own
-- required component data. They are never nullable packages on resource.

-- @functional-requirement HALL-FR-DOC-080 BINARY_CONTENT_IS_SEPARATE:
-- Document bytes are immutable content-addressed objects. A document resource
-- references one such object without carrying a council classification.

-- @functional-requirement HALL-FR-DOC-090 RESOURCE_NATURE_IS_IMMUTABLE:
-- The concrete nature selected when a resource is created cannot later be
-- replaced by another union component.

-- @functional-requirement HALL-FR-DOC-100 RESOURCE_READ_MODEL_IS_STABLE:
-- A resource is opened by its stable identifier. Folder listings expose the
-- same lightweight resource summary as resource details, independently of the
-- concrete storage tables.

-- @functional-requirement HALL-FR-DOC-110 FOLDER_LISTS_DIRECT_CHILDREN:
-- Listing a folder returns exactly the resources whose containing path is that
-- folder. Descendants remain accessible through their own folder listing.

-- @functional-requirement HALL-FR-DOC-120 PARENT_FOLDERS_ARE_ENSURED:
-- Creating a resource ensures each missing folder in its containing path.
-- Existing folder identities are retained and a non-folder path is rejected.

-- @functional-requirement HALL-FR-DOC-130 LOCATION_CHANGE_IS_ATOMIC:
-- Renaming or moving a folder updates that folder and every descendant in one
-- namespace transaction without changing any resource identity or nature.

-- @functional-requirement HALL-FR-DOC-140 EDITABLE_CONTENT_IS_VERSIONED:
-- Updating editable content requires its current version and increments that
-- version exactly once. A stale writer cannot overwrite a newer value.

-- @functional-requirement HALL-FR-DOC-150 RESOURCE_DELETION_IS_COMPLETE:
-- Deleting a resource removes its envelope and its concrete component. An
-- immutable binary object remains content-addressed and may still be shared.

-- @functional-requirement HALL-FR-DOC-160 BINARY_METADATA_IS_CONSISTENT:
-- Reusing immutable bytes reuses their content-addressed object only when the
-- declared media type is identical. Conflicting metadata is rejected.

-- @functional-requirement HALL-FR-DOC-170 RESOURCE_SLUG_IS_STABLE:
-- Every resource receives one globally unique public slug when it is created.
-- The slug does not change when the resource is renamed or moved. UUID remains
-- the identity used by internal relations; the slug is a public lookup key.

-- @functional-requirement HALL-FR-DOC-180 WORKSPACE_CATALOG_IS_FLAT:
-- The workspace can retrieve every resource identity and location in one
-- flat, deterministic catalogue. The catalogue carries no presentation,
-- content, binary metadata or council aggregate; the client renders its tree.

-- @functional-requirement HALL-FR-DOC-190 REMOTE_TARGET_IS_STRUCTURAL:
-- A remote resource exists before it has a target. A configured target is a
-- separate required row; the database never stores an empty or nullable URL.

-- @functional-requirement HALL-FR-DOC-200 RESOURCE_PRESENTATION_IS_AUTHORITATIVE:
-- Resource timestamps, tags and editable autosave preferences are stored by
-- their owning entities. Readiness and availability are derived from concrete
-- content; the HTTP edge never invents presentation defaults.

-- @functional-requirement HALL-FR-DOC-210 RESOURCE_HYDRATION_IS_SCOPED:
-- Presentation is loaded by direct folder or explicit search, never by
-- recursively opening each catalogue entry. Mutations can invalidate only the
-- affected identities and paths, ready for targeted server events.

-- @functional-requirement HALL-FR-DOC-220 DOCUMENTARY_SIREN_IS_DATABASE_OWNED:
-- Documentary links and affordances are projected from persisted state and
-- the PostgreSQL call context. The HTTP edge does not reconstruct them.

-- @functional-requirement HALL-FR-DOC-230 EDITOR_ASSET_BELONGS_TO_TEXT_CONTENT:
-- An editor image is not a workspace resource. It belongs to exactly one text
-- resource, keeps immutable binary bytes, and is reachable only by its stable
-- asset identity.

-- @functional-requirement HALL-FR-DOC-240 EDITOR_ASSETS_FOLLOW_REFERENCES:
-- Updating text content atomically rejects references to another owner's
-- editor assets and removes this owner's assets that are no longer referenced.

-- @functional-requirement HALL-FR-DOC-250 BINARY_REFERENCE_IS_UNIFIED:
-- A persisted editor directive resolves one binary identity without requiring
-- the client to guess whether it denotes a document resource or editor asset.

-- @functional-requirement HALL-FR-DOC-260 STRUCTURED_CONTENT_HAS_A_VALID_SHAPE:
-- Every structured document keeps the minimum shape that identifies a valid
-- spreadsheet, geographic composition or legal-reference lifecycle state.
-- PostgreSQL rejects incomplete JSON packages before they can be projected.

-- @technical-requirement HALL-TR-DOC-010 UUID_IDENTITIES:
-- Documentary entities use PostgreSQL UUID identities and real foreign keys.

-- @technical-requirement HALL-TR-DOC-020 DECLARATIVE_INVARIANTS_ARE_INLINE:
-- Row-local and referential invariants use CHECK, UNIQUE and FOREIGN KEY
-- constraints declared inline whenever PostgreSQL permits it.

-- @technical-requirement HALL-TR-DOC-030 PREFIX_LOOKUPS_ARE_INDEXED:
-- The materialized containing path has a B-tree operator-class index for
-- equality and anchored-prefix lookups.

-- @technical-requirement HALL-TR-DOC-040 JSON_PROJECTIONS_ARE_EXPLICIT:
-- Named hall_api functions return one documented JSONB projection. Binary
-- bytes use a separate typed function and never enter that JSON projection.

-- @technical-requirement HALL-TR-DOC-050 NAMESPACE_WRITES_ARE_SERIALIZED:
-- Every named operation that changes resource locations takes the same
-- transaction-scoped advisory lock before reading or writing the namespace.

-- @technical-requirement HALL-TR-DOC-060 DOCUMENTARY_WRITES_ARE_NAMED:
-- Runtime roles mutate documentary state only through named hall_api
-- functions. They never receive direct privileges on the private tables.

-- @technical-requirement HALL-TR-DOC-070 SLUG_ALLOCATION_IS_SERIALIZED:
-- Slug generation and suffix allocation run under the documentary namespace
-- lock. Concurrent creations therefore cannot observe and claim the same slug.
