BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
SELECT no_plan();

-- @verifies-requirement HALL-TR-SCH-060
SELECT set_eq(
  $$
    SELECT columns.table_name::TEXT
    FROM information_schema.columns
    JOIN information_schema.tables USING (table_schema, table_name)
    WHERE columns.table_schema = 'hall' AND columns.column_name = 'options' AND tables.table_type = 'BASE TABLE'
  $$,
  $$VALUES ('resource'), ('contact'), ('council_member'), ('council_committee'),
    ('council_delegation'), ('app_user'), ('document_template')$$,
  'exactly the seven stable entities carry an options column'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM information_schema.columns
    WHERE table_schema = 'hall'
      AND column_name = 'options'
      AND column_default IS NOT NULL
      AND data_type = 'jsonb'
      AND is_nullable = 'NO'
      AND column_default = '''{}''::jsonb'
  ),
  7,
  'every options column is a non-null JSONB object defaulting to an empty object'
);

SELECT set_eq(
  $$
    SELECT relation.relname::TEXT, later.attname::TEXT
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute AS later ON later.attrelid = relation.oid
      AND later.attnum > attribute.attnum AND NOT later.attisdropped
    WHERE namespace.nspname = 'hall'
      AND relation.relkind = 'r'
      AND attribute.attname = 'options'
  $$,
  $$VALUES ('contact', 'mobile_phone'), ('contact', 'personal_phone'), ('contact', 'professional_phone')$$,
  'options follows every original column of each table, as an upgrade appends it; only the contact telephone numbers come after it'
);

SELECT set_eq(
  $$
    SELECT conname::TEXT
    FROM pg_constraint
    WHERE connamespace = 'hall'::regnamespace AND conname LIKE '%\_options\_is\_object'
  $$,
  $$VALUES ('resource_options_is_object'), ('contact_options_is_object'),
    ('council_member_options_is_object'), ('council_committee_options_is_object'),
    ('council_delegation_options_is_object'), ('app_user_options_is_object'),
    ('document_template_options_is_object')$$,
  'each options column has its object shape constraint'
);

SELECT throws_ok(
  $$INSERT INTO hall.contact (first_name, last_name, options) VALUES ('Anne', 'Martin', '[]'::jsonb)$$,
  '23514',
  NULL,
  'a contact refuses options that are not a JSON object'
);

SELECT throws_ok(
  $$INSERT INTO hall.council_committee (name, options) VALUES ('Finances', '"blue"'::jsonb)$$,
  '23514',
  NULL,
  'a committee refuses options that are not a JSON object'
);

-- @verifies-requirement HALL-FR-WSP-480
CREATE TEMP TABLE folders AS SELECT
  (create_folder('', 'Couleurs')->>'id')::UUID AS parent,
  (create_folder('Couleurs', 'Sous-dossier')->>'id')::UUID AS child,
  (create_text_resource('Couleurs', 'Note', 'Texte')->>'id')::UUID AS note;

SELECT is((SELECT options FROM hall.resource WHERE id = parent), '{}'::jsonb,
  'a new folder has no option') FROM folders;
SELECT ok(NOT (open_resource(parent) ? 'color'), 'a folder without colour presents no colour') FROM folders;

SELECT is(
  update_resource_metadata(parent, '', 'Couleurs', ARRAY[]::TEXT[], '"#1d4ed8"'::jsonb)->>'color',
  '#1D4ED8',
  'a folder colour is stored and presented in upper-case #RRGGBB form'
) FROM folders;
SELECT is((SELECT options FROM hall.resource WHERE id = parent), '{"color": "#1D4ED8"}'::jsonb,
  'the colour is stored in the folder options') FROM folders;
SELECT is(
  (SELECT entry->>'color' FROM jsonb_array_elements(list_resources()) AS entry WHERE (entry->>'id')::UUID = parent),
  '#1D4ED8',
  'the catalogue entry of the folder carries its colour'
) FROM folders;
SELECT is(
  (SELECT entry->>'color' FROM jsonb_array_elements(list_folder('') -> 'resources') AS entry
   WHERE (entry->>'id')::UUID = parent),
  '#1D4ED8',
  'the folder listing presents the colour'
) FROM folders;
SELECT ok(
  NOT (SELECT entry ? 'color' FROM jsonb_array_elements(list_resources()) AS entry WHERE (entry->>'id')::UUID = child),
  'a subfolder does not inherit the colour of its parent'
) FROM folders;

SELECT is(
  update_resource_metadata(parent, '', 'Couleurs renommé', ARRAY['tag']::TEXT[])->>'color',
  '#1D4ED8',
  'a metadata update without colour keeps the colour'
) FROM folders;

SELECT throws_ok(
  format($$SELECT update_resource_metadata(%L, '', 'Couleurs renommé', ARRAY[]::TEXT[], '"#12345"'::jsonb)$$, parent),
  'HV618', 'Folder colour is invalid', 'a malformed colour is refused'
) FROM folders;
SELECT throws_ok(
  format($$SELECT update_resource_metadata(%L, '', 'Couleurs renommé', ARRAY[]::TEXT[], '42'::jsonb)$$, parent),
  'HV618', 'Folder colour is invalid', 'a colour that is not a string is refused'
) FROM folders;
SELECT throws_ok(
  format($$SELECT update_resource_metadata(%L, 'Couleurs renommé', 'Note', ARRAY[]::TEXT[], '"#1D4ED8"'::jsonb)$$, note),
  'HV609', 'Resource kind does not support a colour', 'a colour on a resource that is not a folder is refused'
) FROM folders;
SELECT throws_ok(
  format($$UPDATE hall.resource SET options = '{"color": "#1D4ED8"}'::jsonb WHERE id = %L$$, note),
  '23514', NULL, 'the table refuses a colour on a resource that is not a folder'
) FROM folders;
SELECT throws_ok(
  format($$UPDATE hall.resource SET options = '{"icon": "star"}'::jsonb WHERE id = %L$$, child),
  '23514', NULL, 'the table refuses an undeclared resource option'
) FROM folders;
SELECT throws_ok(
  format($$UPDATE hall.resource SET options = '{"color": "#1d4ed8"}'::jsonb WHERE id = %L$$, child),
  '23514', NULL, 'the table refuses a colour outside the stored #RRGGBB form'
) FROM folders;

SELECT ok(
  NOT (update_resource_metadata(parent, '', 'Couleurs renommé', ARRAY[]::TEXT[], 'null'::jsonb) ? 'color'),
  'a JSON null removes the colour'
) FROM folders;
SELECT is((SELECT options FROM hall.resource WHERE id = parent), '{}'::jsonb,
  'removing the colour leaves no option') FROM folders;

SELECT * FROM finish();
ROLLBACK;
