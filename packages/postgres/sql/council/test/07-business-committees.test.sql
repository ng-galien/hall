BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-BUS-070
-- @scenario bus-070-named-authorized-writes
SELECT ok(
  has_function_privilege('hall_api_authenticated', 'hall_api.associate_council_business_committee(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('hall_api_authenticated', 'hall_api.dissociate_council_business_committee(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('hall_api_anonymous', 'hall_api.associate_council_business_committee(uuid,uuid)', 'EXECUTE')
    AND NOT has_table_privilege('hall_api_authenticated', 'hall.council_business_committee', 'INSERT'),
  'runtime writes use named authenticated functions rather than table privileges'
);

SELECT test_ensure_business(test_uuid('committee-links:business'));
CREATE TEMP TABLE committee_links_business AS
SELECT test_uuid('committee-links:business') AS id;
CREATE TEMP TABLE committee_links_committees AS
SELECT
  (hall_api.create_council_committee('Tourisme', '')) ->> 'id' AS tourism,
  (hall_api.create_council_committee('Travaux', '')) ->> 'id' AS works;

-- @scenario bus-070-multiple-associations
SELECT is(
  hall_api.list_council_business_committees((SELECT id FROM committee_links_business)),
  '[]'::jsonb,
  'an affair starts with no commission association'
);

SELECT is(
  (hall_api.associate_council_business_committee(
    (SELECT id FROM committee_links_business),
    (SELECT tourism::uuid FROM committee_links_committees)
  ) ->> 'name'),
  'Tourisme',
  'association returns the selected commission'
);
SELECT hall_api.associate_council_business_committee(
  (SELECT id FROM committee_links_business),
  (SELECT works::uuid FROM committee_links_committees)
);

SELECT is(
  jsonb_array_length(hall_api.list_council_business_committees((SELECT id FROM committee_links_business))),
  2,
  'one affair may be associated with several commissions'
);

-- @scenario bus-070-reverse-reading
SELECT is(
  hall_api.list_council_committee_businesses((SELECT tourism::uuid FROM committee_links_committees))
    -> 0 ->> 'title',
  'Business ' || (SELECT id::text FROM committee_links_business),
  'the commission lists its associated affair with its current title'
);

-- @scenario bus-070-duplicate-protection
SELECT throws_ok(
  format(
    'SELECT hall_api.associate_council_business_committee(%L::uuid,%L::uuid)',
    (SELECT id FROM committee_links_business),
    (SELECT tourism FROM committee_links_committees)
  ),
  '23505', NULL,
  'the primary key rejects a duplicate association'
);

-- @scenario bus-070-explicit-dissociation-before-delete
SELECT throws_ok(
  format('SELECT hall_api.delete_council_business(%L::uuid)', (SELECT id FROM committee_links_business)),
  '23503', NULL,
  'the affair cannot be deleted while commission associations remain'
);

-- @scenario bus-070-archive-preserves-links
SELECT hall_api.archive_council_committee((SELECT tourism::uuid FROM committee_links_committees));
SELECT ok(
  hall_api.list_council_business_committees((SELECT id FROM committee_links_business))
    @> jsonb_build_array(jsonb_build_object(
      'committeeId', (SELECT tourism::uuid FROM committee_links_committees),
      'name', 'Tourisme',
      'archivedAt', (SELECT archived_at FROM hall.council_committee
        WHERE id = (SELECT tourism::uuid FROM committee_links_committees))
    )),
  'archiving a commission preserves and exposes its existing association'
);

-- @scenario bus-070-archived-association-refused
SELECT throws_ok(
  format(
    'SELECT hall_api.associate_council_business_committee(%L::uuid,%L::uuid)',
    (SELECT id FROM committee_links_business),
    (SELECT tourism FROM committee_links_committees)
  ),
  'HV821', 'An archived committee cannot be associated',
  'new associations to archived commissions are rejected'
);

-- @scenario bus-070-explicit-dissociation
SELECT is(
  (hall_api.dissociate_council_business_committee(
    (SELECT id FROM committee_links_business),
    (SELECT tourism::uuid FROM committee_links_committees)
  ) ->> 'name'),
  'Tourisme',
  'an archived commission can still be explicitly dissociated'
);
SELECT hall_api.dissociate_council_business_committee(
  (SELECT id FROM committee_links_business),
  (SELECT works::uuid FROM committee_links_committees)
);
SELECT is(
  hall_api.list_council_business_committees((SELECT id FROM committee_links_business)),
  '[]'::jsonb,
  'dissociation removes the links from both directions'
);
SELECT is(
  hall_api.list_council_committee_businesses((SELECT tourism::uuid FROM committee_links_committees)),
  '[]'::jsonb,
  'the commission no longer lists a dissociated affair'
);
SELECT throws_ok(
  format(
    'SELECT hall_api.dissociate_council_business_committee(%L::uuid,%L::uuid)',
    (SELECT id FROM committee_links_business),
    (SELECT tourism FROM committee_links_committees)
  ),
  'HV706', 'Council business committee association does not exist',
  'repeated dissociation reports a missing association'
);

SELECT lives_ok(
  format('SELECT hall_api.delete_council_business(%L::uuid)', (SELECT id FROM committee_links_business)),
  'the affair can be deleted after explicit dissociation'
);

SELECT * FROM finish();
ROLLBACK;
