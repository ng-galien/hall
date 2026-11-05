BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
SELECT no_plan();
SELECT create_folder('', 'names');
CREATE TEMP TABLE named AS SELECT
  (create_document_resource('names', convert_from(convert_to('TRUST — Corpus · référence.pdf', 'UTF8'), 'LATIN1'),
    'application/pdf', convert_to('PDF', 'UTF8'))->>'id')::UUID garbled,
  (create_document_resource('names', convert_from(convert_to('Écoles.pdf', 'UTF8'), 'LATIN1'),
    'application/pdf', convert_to('PDF', 'UTF8'))->>'id')::UUID taken,
  (create_document_resource('names', 'Écoles.pdf', 'application/pdf', convert_to('PDF', 'UTF8'))->>'id')::UUID sibling,
  (create_document_resource('names', 'Château d''eau.pdf', 'application/pdf', convert_to('PDF', 'UTF8'))->>'id')::UUID correct;
\ir ../../migrations/003-resource-name-encoding.sql
SELECT is((SELECT name FROM resource WHERE id = garbled), 'TRUST — Corpus · référence.pdf',
  'a name stored as UTF-8 read as Latin-1 is decoded') FROM named;
SELECT is((SELECT full_path FROM resource WHERE id = garbled), 'names/TRUST — Corpus · référence.pdf',
  'its full path follows the decoded name') FROM named;
SELECT is((SELECT name FROM resource WHERE id = taken), convert_from(convert_to('Écoles.pdf', 'UTF8'), 'LATIN1'),
  'a name whose decoded form is taken in its folder is left as it is') FROM named;
SELECT is((SELECT name FROM resource WHERE id = correct), 'Château d''eau.pdf',
  'a correct name is unchanged') FROM named;
\ir ../../migrations/003-resource-name-encoding.sql
SELECT is((SELECT name FROM resource WHERE id = garbled), 'TRUST — Corpus · référence.pdf',
  'the repair can run again without changing anything') FROM named;
SELECT * FROM finish();
ROLLBACK;
