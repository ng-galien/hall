BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

SELECT ok(
  has_function_privilege(
    'hall_api_authenticated',
    'hall_api.create_council_business(text,text,text,text)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'hall_api_anonymous',
    'hall_api.create_council_business(text,text,text,text)',
    'EXECUTE'
  ),
  'CouncilBusiness workspace creation is exposed only to authenticated runtime roles'
);

SELECT ok(
  has_function_privilege(
    'hall_api_authenticated',
    'hall_api.close_council_meeting(uuid,timestamp with time zone)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'hall_api_anonymous',
    'hall_api.close_council_meeting(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'meeting closure is exposed only through the authenticated application surface'
);

-- HALL-FR-WSP-015
SELECT throws_ok(
  $$INSERT INTO hall.council_business (id)
      VALUES ('00000000-0000-0000-0000-000000000001');
    SET CONSTRAINTS ALL IMMEDIATE$$,
  'HV702',
  'a council business must have one documentary workspace',
  'a CouncilBusiness cannot commit without its documentary workspace'
);

-- HALL-FR-WSP-010 HALL-FR-WSP-040 HALL-FR-WSP-050
CREATE TEMP TABLE business_result AS
SELECT hall_api.create_council_business('', 'cantine', 'rapport', '# Cantine') AS payload;

SELECT ok(
  (payload ->> 'id')::UUID IS NOT NULL
    AND (payload ->> 'folderResourceId')::UUID IS NOT NULL
    AND (payload ->> 'reportResourceId')::UUID IS NOT NULL,
  'business creation returns only stable aggregate and resource identities'
)
FROM business_result;

SELECT is(
  hall.resource_kind(folder),
  'folder',
  'the CouncilBusiness workspace resource is structurally a folder'
)
FROM hall.resource AS folder, business_result
WHERE folder.id = (business_result.payload ->> 'folderResourceId')::UUID;

SELECT is(
  hall.resource_kind(report),
  'text',
  'the CouncilBusiness primary report is structurally a text resource'
)
FROM hall.resource AS report, business_result
WHERE report.id = (business_result.payload ->> 'reportResourceId')::UUID;

-- HALL-FR-WSP-020
SELECT ok(
  hall.council_business_workspace_is_valid((payload ->> 'id')::UUID),
  'the primary report is contained directly by its CouncilBusiness folder'
)
FROM business_result;

SELECT throws_ok(
  format(
    'UPDATE hall.resource SET path = %L WHERE id = %L::uuid; SET CONSTRAINTS ALL IMMEDIATE',
    '',
    (SELECT payload ->> 'reportResourceId' FROM business_result)
  ),
  'HV701',
  'a council business report must be a text resource inside its folder resource',
  'the primary report cannot leave its CouncilBusiness folder'
);

-- HALL-FR-WSP-030
SELECT lives_ok(
  format(
    'SELECT hall_api.relocate_resource(%L::uuid, %L, %L)',
    (SELECT payload ->> 'folderResourceId' FROM business_result),
    '',
    'restauration-scolaire'
  ),
  'the whole CouncilBusiness workspace can be renamed atomically'
);

SELECT ok(
  hall.council_business_workspace_is_valid((payload ->> 'id')::UUID),
  'resource relocation preserves the CouncilBusiness identity mapping'
)
FROM business_result;

SELECT is(
  (
    SELECT report.full_path
    FROM hall.resource AS report, business_result
    WHERE report.id = (business_result.payload ->> 'reportResourceId')::UUID
  ),
  'restauration-scolaire/rapport',
  'the report follows its renamed folder through the documentary namespace'
);

SELECT is(
  hall_api.open_council_business((payload ->> 'id')::UUID),
  payload,
  'opening a CouncilBusiness returns the stable scoped projection'
)
FROM business_result;

-- HALL-FR-WSP-090 HALL-FR-WSP-100 HALL-FR-WSP-140 HALL-FR-WSP-150 HALL-FR-WSP-160
CREATE TEMP TABLE supporting_resource (id UUID PRIMARY KEY, original_path TEXT NOT NULL);
INSERT INTO supporting_resource
SELECT (resource ->> 'id')::UUID, resource ->> 'path'
FROM (
  VALUES
    (hall_api.create_text_resource('documents', 'annexe-a', 'A')),
    (hall_api.create_text_resource('documents', 'annexe-b', 'B'))
) AS created(resource);

SELECT lives_ok(
  format(
    'SELECT hall_api.associate_council_business_resource(%L::uuid, %L::uuid)',
    (SELECT payload ->> 'id' FROM business_result),
    (SELECT id FROM supporting_resource ORDER BY id LIMIT 1)
  ),
  'an existing resource can be associated without moving it'
);
SELECT hall_api.associate_council_business_resource(
  (SELECT (payload ->> 'id')::UUID FROM business_result),
  (SELECT id FROM supporting_resource ORDER BY id DESC LIMIT 1)
);

SELECT results_eq(
  $$SELECT resource.path
    FROM hall.resource AS resource
    JOIN supporting_resource AS supporting ON supporting.id = resource.id
    ORDER BY resource.id$$,
  $$SELECT original_path FROM supporting_resource ORDER BY id$$,
  'association preserves every resource FolderPath'
);

SELECT is(
  hall_api.reorder_council_business_resources(
    (SELECT (payload ->> 'id')::UUID FROM business_result),
    ARRAY(SELECT id FROM supporting_resource ORDER BY id DESC)
  ) #>> '{0,resourceId}',
  (SELECT id::TEXT FROM supporting_resource ORDER BY id DESC LIMIT 1),
  'resource ordering is changed by one exact named action'
);

SELECT throws_ok(
  format(
    'SELECT hall_api.associate_council_business_resource(%L::uuid, %L::uuid)',
    (SELECT payload ->> 'id' FROM business_result),
    (SELECT payload ->> 'folderResourceId' FROM business_result)
  ),
  'HV703',
  'a council business resource must be a non-folder working resource distinct from its report',
  'the intrinsic folder cannot be duplicated as a working resource'
);

SELECT lives_ok(
  format(
    'SELECT hall_api.dissociate_council_business_resource(%L::uuid, %L::uuid)',
    (SELECT payload ->> 'id' FROM business_result),
    (SELECT id FROM supporting_resource ORDER BY id LIMIT 1)
  ),
  'a supporting resource can be dissociated explicitly'
);

SELECT is(
  (SELECT path FROM hall.resource WHERE id = (SELECT id FROM supporting_resource ORDER BY id LIMIT 1)),
  'documents',
  'dissociation also preserves the resource FolderPath'
);

-- HALL-FR-WSP-180
SELECT ok(
  has_function_privilege(
    'hall_api_authenticated',
    'hall_api.list_council_business_workspace_items()',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'hall_api_anonymous',
    'hall_api.list_council_business_workspace_items()',
    'EXECUTE'
  ),
  'the bulk CouncilBusiness workspace projection is restricted to authenticated runtime roles'
);

SELECT ok(
  (item ->> 'id')::UUID = (SELECT (payload ->> 'id')::UUID FROM business_result)
    AND item ->> 'title' = 'restauration-scolaire'
    AND item ->> 'folderPath' = ''
    AND item ->> 'report' = '# Cantine'
    AND item ? 'createdAt'
    AND item ? 'updatedAt',
  'the bulk workspace projection preserves the existing CouncilBusiness presentation without nested resources'
)
FROM jsonb_array_elements(hall_api.list_council_business_workspace_items()) AS projected(item)
WHERE item ->> 'id' = (SELECT payload ->> 'id' FROM business_result);

-- HALL-FR-WSP-190
SELECT ok(
  has_function_privilege(
    'hall_api_authenticated',
    'hall_api.list_council_business_resource_items(uuid[])',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'hall_api_anonymous',
    'hall_api.list_council_business_resource_items(uuid[])',
    'EXECUTE'
  ),
  'the flat bulk resource projection is restricted to authenticated runtime roles'
);

SELECT ok(
  jsonb_array_length(projected) = 1
    AND projected #>> '{0,councilBusinessId}' = (SELECT payload ->> 'id' FROM business_result)
    AND projected #>> '{0,path}' = 'documents'
    AND NOT (projected #> '{0}') ? 'resource',
  'working resources are projected as flat rows in one query without relocation or nested resource JSON'
)
FROM (
  SELECT hall_api.list_council_business_resource_items(
    ARRAY[(SELECT (payload ->> 'id')::UUID FROM business_result)]
  ) AS projected
) AS bulk;

INSERT INTO hall.council_meetings (id, number, stale) VALUES
  ('10000000-0000-0000-0000-000000000001', 1, FALSE),
  ('10000000-0000-0000-0000-000000000002', 99, TRUE);
SELECT hall_api.configure_active_council_term(1);
CREATE TEMP TABLE contact_result AS
SELECT hall_api.create_contact('Alice', 'Martin', NULL, NULL, NULL, NULL, '') AS payload;
CREATE TEMP TABLE member_result AS
SELECT hall_api.create_council_member(
  (SELECT (payload ->> 'id')::UUID FROM contact_result),
  'mayor',
  current_date
) AS payload;
INSERT INTO hall.meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  (SELECT (payload ->> 'id')::UUID FROM member_result),
  '10000000-0000-0000-0000-000000000001',
  'present'
);
SELECT hall.set_council_meeting_officers('10000000-0000-0000-0000-000000000001',
  (SELECT (payload->>'id')::uuid FROM member_result), (SELECT (payload->>'id')::uuid FROM member_result));
SELECT test_confirm_declared_membership('10000000-0000-0000-0000-000000000001');
UPDATE hall.council_meetings
SET scheduled_at = '2026-01-01 08:30:00+00',
    location = 'Council chamber'
WHERE id = '10000000-0000-0000-0000-000000000001';

-- HALL-FR-WSP-060 HALL-FR-WSP-070
CREATE TEMP TABLE agenda_result (kind TEXT PRIMARY KEY, payload JSONB NOT NULL);
INSERT INTO agenda_result VALUES
  ('decision', hall_api.schedule_council_decision_proposal(
    (SELECT (payload ->> 'id')::UUID FROM business_result),
    '10000000-0000-0000-0000-000000000001',
    1
  )),
  ('open', hall_api.schedule_open_question(
    (SELECT (payload ->> 'id')::UUID FROM business_result),
    '10000000-0000-0000-0000-000000000001',
    2
  ));

SELECT set_eq(
  $$SELECT payload #>> '{subject,kind}' FROM agenda_result$$,
  $$VALUES ('councilDecisionProposal'), ('openQuestion')$$,
  'agenda actions expose the closed subject projection without documentary content'
);

SELECT is(
  jsonb_array_length(hall_api.list_council_agenda('10000000-0000-0000-0000-000000000001')),
  2,
  'meeting agenda listing returns its two lightweight occurrences'
);

-- HALL-FR-WSP-170
SELECT is(
  jsonb_array_length(
    hall_api.list_council_business_agenda_items(
      ARRAY[(SELECT (payload ->> 'id')::UUID FROM business_result)]
    )
  ),
  2,
  'all agenda occurrences for the requested affairs are projected in one bulk query'
);

SELECT is(
  hall_api.reprogram_council_agenda_item(
    (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'open'),
    '10000000-0000-0000-0000-000000000002',
    1
  ) ->> 'councilMeetingId',
  '10000000-0000-0000-0000-000000000002',
  'an unstarted agenda item can be moved to another provisioned meeting'
);

SELECT hall_api.reprogram_council_agenda_item(
  (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'open'),
  '10000000-0000-0000-0000-000000000001',
  2
);
SELECT test_prepare_notice('10000000-0000-0000-0000-000000000001');
SELECT hall.start_council_meeting(
  '10000000-0000-0000-0000-000000000001',
  '2026-01-01 09:00:00+00'
);
SELECT hall_api.start_council_agenda_item(
  (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'decision'),
  '2026-01-01 09:05:00+00'
);
SELECT is(
  (hall_api.adjourn_council_agenda_item(
    (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'decision'), '2026-01-01 09:05:30Z'
  ) ->> 'position')::INTEGER,
  -1,
  'adjournment retains the agenda occurrence with its signed position'
);
SELECT hall_api.start_council_agenda_item(
  (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'open'),
  '2026-01-01 09:06:00+00'
);
SELECT ok(
  hall_api.complete_non_voting_agenda_item(
    (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'open'),
    '2026-01-01 09:07:00+00'
  ) ->> 'completedAt' IS NOT NULL,
  'an open question completes through its named action without a ballot'
);

-- HALL-FR-MIN-140
CREATE TEMP TABLE meeting_closure_result AS
SELECT hall_api.close_council_meeting(
  '10000000-0000-0000-0000-000000000001',
  '2026-01-01 10:00:00+00'
) AS payload;

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SELECT ok(
  (payload #>> '{closedMeeting,closedAt}') IS NOT NULL
    AND (payload #>> '{nextMeeting,previousCouncilMeetingId}')
      = '10000000-0000-0000-0000-000000000001'
    AND (payload #>> '{minutes,id}') IS NOT NULL
    AND (payload #>> '{minutes,documentId}') IS NULL,
  'meeting closure atomically returns the closed meeting, successor and standalone draft identity'
)
FROM meeting_closure_result;

SELECT is(
  jsonb_array_length(
    hall_api.list_council_agenda(
      (SELECT (payload #>> '{nextMeeting,id}')::UUID FROM meeting_closure_result)
    )
  ),
  2,
  'the next agenda contains minutes approval first and the carried deferred decision second'
);

SELECT * FROM finish();
ROLLBACK;
