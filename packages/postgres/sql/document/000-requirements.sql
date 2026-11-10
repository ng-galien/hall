-- Documentary model requirement catalogue
-- =======================================
--
-- Functional identifiers use HALL-FR-DOC-NNN. Technical identifiers use
-- HALL-TR-DOC-NNN. Numbers advance by ten and are never reused.

-- @implements-requirement HALL-FR-DOC-010
-- A resource shares its identity with exactly one concrete technical
-- component. Its nature is derived from that component and is not stored as a
-- second discriminant.

-- @implements-requirement HALL-FR-DOC-020
-- A resource has a normalized containing path and one non-empty local name.
-- Their composition is its unique full path.

-- @implements-requirement HALL-FR-DOC-030
-- A folder is a durable resource nature. It has the same stable identity and
-- location rules as every other resource.

-- @implements-requirement HALL-FR-DOC-040
-- Every non-root containing path resolves to an existing resource whose
-- concrete nature is folder.

-- @implements-requirement HALL-FR-DOC-050
-- The empty containing path denotes the implicit workspace root. The root is
-- not persisted as a special resource row.

-- @implements-requirement HALL-FR-DOC-060
-- A folder that contains resources cannot be deleted. Removing its last child
-- never deletes the folder automatically.

-- @implements-requirement HALL-FR-DOC-070
-- Text, spreadsheet, geographic and legal-reference content keep their own
-- required component data. They are never nullable packages on resource.

-- @implements-requirement HALL-FR-DOC-080
-- Document bytes are immutable content-addressed objects. A document resource
-- references one such object without carrying a council classification.

-- @implements-requirement HALL-FR-DOC-090
-- The concrete nature selected when a resource is created cannot later be
-- replaced by another union component.

-- @implements-requirement HALL-FR-DOC-100
-- A resource is opened by its stable identifier. Folder listings expose the
-- same lightweight resource summary as resource details, independently of the
-- concrete storage tables.

-- @implements-requirement HALL-FR-DOC-110
-- Listing a folder returns exactly the resources whose containing path is that
-- folder. Descendants remain accessible through their own folder listing.

-- @implements-requirement HALL-FR-DOC-120
-- Creating a resource ensures each missing folder in its containing path.
-- Existing folder identities are retained and a non-folder path is rejected.

-- @implements-requirement HALL-FR-DOC-130
-- Renaming or moving a folder updates that folder and every descendant in one
-- namespace transaction without changing any resource identity or nature.

-- @implements-requirement HALL-FR-DOC-140
-- Updating editable content requires its current version and increments that
-- version exactly once. A stale writer cannot overwrite a newer value.

-- @implements-requirement HALL-FR-DOC-150
-- Deleting a resource removes its envelope and its concrete component. An
-- immutable binary object remains content-addressed and may still be shared.

-- @implements-requirement HALL-FR-DOC-160
-- Reusing immutable bytes reuses their content-addressed object only when the
-- declared media type is identical. Conflicting metadata is rejected.

-- @implements-requirement HALL-FR-DOC-170
-- Every resource receives one globally unique public slug when it is created.
-- The slug does not change when the resource is renamed or moved. UUID remains
-- the identity used by internal relations; the slug is a public lookup key.

-- @implements-requirement HALL-FR-DOC-180
-- The workspace can retrieve every resource identity and location in one
-- flat, deterministic catalogue. A catalogue entry carries the identity, the
-- location and the folder colour (HALL-FR-WSP-480); it carries no other
-- presentation, content, binary metadata or council aggregate. The client
-- renders its tree.

-- @implements-requirement HALL-FR-DOC-190
-- A remote resource exists before it has a target. A configured target is a
-- separate required row; the database never stores an empty or nullable URL.

-- @implements-requirement HALL-FR-DOC-200
-- Resource timestamps, tags and editable autosave preferences are stored by
-- their owning entities. Readiness and availability are derived from concrete
-- content; the HTTP edge never invents presentation defaults.

-- @implements-requirement HALL-FR-DOC-210
-- Presentation is loaded by direct folder or explicit search, never by
-- recursively opening each catalogue entry. Mutations can invalidate only the
-- affected identities and paths, ready for targeted server events.

-- @implements-requirement HALL-FR-DOC-220
-- Documentary links and affordances are projected from persisted state and
-- the PostgreSQL call context. The HTTP edge does not reconstruct them.

-- @implements-requirement HALL-FR-DOC-230
-- An editor image is not a workspace resource. It belongs to exactly one text
-- resource, keeps immutable binary bytes, and is reachable only by its stable
-- asset identity.

-- @implements-requirement HALL-FR-DOC-240
-- Updating text content atomically rejects references to another owner's
-- editor assets and removes this owner's assets that are no longer referenced.

-- @implements-requirement HALL-FR-DOC-250
-- A persisted editor directive resolves one binary identity without requiring
-- the client to guess whether it denotes a document resource or editor asset.

-- @implements-requirement HALL-FR-DOC-260
-- Every structured document keeps the minimum shape that identifies a valid
-- spreadsheet, geographic composition or legal-reference lifecycle state.
-- PostgreSQL rejects incomplete JSON packages before they can be projected.

-- @implements-requirement HALL-TR-DOC-010
-- Documentary entities use PostgreSQL UUID identities and real foreign keys.

-- @implements-requirement HALL-TR-DOC-020
-- Row-local and referential invariants use CHECK, UNIQUE and FOREIGN KEY
-- constraints declared inline whenever PostgreSQL permits it.

-- @implements-requirement HALL-TR-DOC-030
-- The materialized containing path has a B-tree operator-class index for
-- equality and anchored-prefix lookups.

-- @implements-requirement HALL-TR-DOC-040
-- Named hall_api functions return one documented JSONB projection. Binary
-- bytes use a separate typed function and never enter that JSON projection.

-- @implements-requirement HALL-TR-DOC-050
-- Every named operation that changes resource locations takes the same
-- transaction-scoped advisory lock before reading or writing the namespace.

-- @implements-requirement HALL-TR-DOC-060
-- Runtime roles mutate documentary state only through named hall_api
-- functions. They never receive direct privileges on the private tables.

-- @implements-requirement HALL-TR-DOC-070
-- Slug generation and suffix allocation run under the documentary namespace
-- lock. Concurrent creations therefore cannot observe and claim the same slug.
