BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SELECT no_plan();

-- Root folder a, child folder a/b, and text resource a/b/note.md.
INSERT INTO hall.folder_resource (id)
VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');

INSERT INTO hall.resource (id, path, name, slug, folder_resource_id)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '',
    'a',
    'a-folder',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'a',
    'b',
    'b-folder',
    '10000000-0000-0000-0000-000000000002'
  );

INSERT INTO hall.text_resource (id, content)
VALUES ('20000000-0000-0000-0000-000000000001', 'content');

INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'a/b',
  'note.md',
  'note-md',
  '20000000-0000-0000-0000-000000000001'
);

SET CONSTRAINTS ALL IMMEDIATE;

SELECT is(
  (SELECT full_path FROM hall.resource WHERE id = '20000000-0000-0000-0000-000000000001'),
  'a/b/note.md',
  'full path is derived from the containing path and local name'
);

SELECT is(
  (SELECT is_folder FROM hall.resource WHERE id = '10000000-0000-0000-0000-000000000002'),
  true,
  'folder nature is derived from the folder component'
);

-- @verifies-requirement HALL-FR-DOC-010
SELECT throws_ok(
  $$
    INSERT INTO hall.resource (id, path, name, slug)
    VALUES ('20000000-0000-0000-0000-000000000010', '', 'no-nature', 'no-nature')
  $$,
  '23514',
  NULL,
  'resource without a nature is rejected'
);

INSERT INTO hall.folder_resource (id)
VALUES ('20000000-0000-0000-0000-000000000011');
INSERT INTO hall.text_resource (id, content)
VALUES ('20000000-0000-0000-0000-000000000011', 'same identity');

SELECT throws_ok(
  $$
    INSERT INTO hall.resource (
      id, path, name, slug, folder_resource_id, text_resource_id
    ) VALUES (
      '20000000-0000-0000-0000-000000000011',
      '',
      'two-natures',
      'two-natures',
      '20000000-0000-0000-0000-000000000011',
      '20000000-0000-0000-0000-000000000011'
    )
  $$,
  '23514',
  NULL,
  'resource with two natures is rejected'
);

INSERT INTO hall.text_resource (id, content)
VALUES ('20000000-0000-0000-0000-000000000012', 'different identity');

SELECT throws_ok(
  $$
    INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
    VALUES (
      '20000000-0000-0000-0000-000000000013',
      '',
      'identity-mismatch',
      'identity-mismatch',
      '20000000-0000-0000-0000-000000000012'
    )
  $$,
  '23514',
  NULL,
  'resource and nature identities must match'
);

-- @verifies-requirement HALL-FR-DOC-090
INSERT INTO hall.text_resource (id, content)
VALUES ('10000000-0000-0000-0000-000000000002', 'alternate nature');

SELECT throws_ok(
  $$
    UPDATE hall.resource
    SET folder_resource_id = NULL,
        text_resource_id = '10000000-0000-0000-0000-000000000002'
    WHERE id = '10000000-0000-0000-0000-000000000002'
  $$,
  'HV606',
  'A resource nature is immutable',
  'resource nature cannot change after creation'
);

-- @verifies-requirement HALL-FR-DOC-170
SELECT throws_ok(
  $$
    UPDATE hall.resource
    SET slug = 'changed-slug'
    WHERE id = '10000000-0000-0000-0000-000000000001'
  $$,
  'HV611',
  'A resource slug is immutable',
  'resource slug cannot change after creation'
);

-- @verifies-requirement HALL-FR-DOC-020
SELECT throws_ok(
  $$
    INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
    VALUES (
      '20000000-0000-0000-0000-000000000012',
      '/a',
      'invalid-path',
      'invalid-path',
      '20000000-0000-0000-0000-000000000012'
    )
  $$,
  '23514',
  NULL,
  'leading slash is rejected'
);

-- @verifies-requirement HALL-FR-DOC-040

-- a missing containing folder fails at the deferred FK.
SET CONSTRAINTS resource_container_is_folder DEFERRED;
INSERT INTO hall.text_resource (id, content)
VALUES ('20000000-0000-0000-0000-000000000020', 'missing folder');
INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
VALUES (
  '20000000-0000-0000-0000-000000000020',
  'missing',
  'child',
  'missing-child',
  '20000000-0000-0000-0000-000000000020'
);

SELECT throws_ok(
  'SET CONSTRAINTS resource_container_is_folder IMMEDIATE',
  '23503',
  NULL,
  'non-root path must resolve to an existing folder resource'
);

DELETE FROM hall.resource
WHERE id = '20000000-0000-0000-0000-000000000020';
SET CONSTRAINTS ALL IMMEDIATE;

-- A non-folder resource cannot serve as a containing path.
SET CONSTRAINTS resource_container_is_folder DEFERRED;
INSERT INTO hall.text_resource (id, content)
VALUES
  ('20000000-0000-0000-0000-000000000021', 'file'),
  ('20000000-0000-0000-0000-000000000022', 'child');
INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
VALUES
  (
    '20000000-0000-0000-0000-000000000021',
    '',
    'file',
    'file-resource',
    '20000000-0000-0000-0000-000000000021'
  ),
  (
    '20000000-0000-0000-0000-000000000022',
    'file',
    'child',
    'file-child',
    '20000000-0000-0000-0000-000000000022'
  );

SELECT throws_ok(
  'SET CONSTRAINTS resource_container_is_folder IMMEDIATE',
  '23503',
  NULL,
  'only a folder resource can be a containing path'
);

DELETE FROM hall.resource
WHERE id = '20000000-0000-0000-0000-000000000022';
SET CONSTRAINTS ALL IMMEDIATE;

-- Location uniqueness is global across all resource natures.
INSERT INTO hall.text_resource (id, content)
VALUES ('20000000-0000-0000-0000-000000000023', 'collision');

SELECT throws_ok(
  $$
    INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
    VALUES (
      '20000000-0000-0000-0000-000000000023',
      '',
      'a',
      'location-collision',
      '20000000-0000-0000-0000-000000000023'
    )
  $$,
  '23505',
  NULL,
  'two resource natures cannot occupy the same full path'
);

-- @verifies-requirement HALL-FR-DOC-060

-- a non-empty folder is protected by the same FK.
SET CONSTRAINTS resource_container_is_folder DEFERRED;
SELECT throws_ok(
  $$
    DELETE FROM hall.resource
    WHERE id = '10000000-0000-0000-0000-000000000002';
    SET CONSTRAINTS resource_container_is_folder IMMEDIATE
  $$,
  '23503',
  NULL,
  'non-empty folder cannot be deleted'
);

DELETE FROM hall.resource
WHERE id = '20000000-0000-0000-0000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;

SELECT is(
  (SELECT count(*)::INTEGER FROM hall.resource WHERE full_path = 'a/b' AND is_folder),
  1,
  'folder persists after its last child is removed'
);

-- Renaming a folder and its descendants is one variant-independent namespace transaction.
SET CONSTRAINTS resource_container_is_folder DEFERRED;
UPDATE hall.resource
SET name = 'renamed'
WHERE id = '10000000-0000-0000-0000-000000000001';

UPDATE hall.resource
SET path = 'renamed' || substr(path, length('a') + 1)
WHERE path = 'a'
   OR path LIKE 'a/%';

SET CONSTRAINTS ALL IMMEDIATE;

SELECT set_eq(
  $$
    SELECT full_path
    FROM hall.resource
    WHERE id IN (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002'
    )
  $$,
  $$VALUES ('renamed'), ('renamed/b')$$,
  'folder identity survives a prefix rename'
);

-- @verifies-requirement HALL-FR-DOC-080
INSERT INTO hall.binary_object (id, content_sha256, media_type, byte_size, content)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to('x', 'UTF8')), 'hex'),
  'text/plain',
  1,
  convert_to('x', 'UTF8')
);

SELECT throws_ok(
  $$
    UPDATE hall.binary_object
    SET media_type = 'application/octet-stream'
    WHERE id = '30000000-0000-0000-0000-000000000001'
  $$,
  'HV605',
  'A binary object is immutable',
  'binary objects cannot change in place'
);

SELECT * FROM finish();
ROLLBACK;
