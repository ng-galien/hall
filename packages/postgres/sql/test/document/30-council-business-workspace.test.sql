BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
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
    'hall_api.close_council_meeting(uuid,timestamp with time zone,text,text,text,text)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'hall_api_anonymous',
    'hall_api.close_council_meeting(uuid,timestamp with time zone,text,text,text,text)',
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

INSERT INTO hall.council_meetings (id, quorum) VALUES
  ('10000000-0000-0000-0000-000000000001', 1),
  ('10000000-0000-0000-0000-000000000002', 1);
INSERT INTO hall.meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'present'
);
UPDATE hall.council_meetings
SET started_at = '2026-01-01 09:00:00+00'
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
SELECT hall_api.start_council_agenda_item(
  (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'decision'),
  '2026-01-01 09:05:00+00'
);
SELECT is(
  (hall_api.deprogram_council_agenda_item(
    (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'decision')
  ) ->> 'position')::INTEGER,
  -1,
  'deprogramming retains the agenda occurrence with its signed position'
);
SELECT hall_api.start_council_agenda_item(
  (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'open'),
  '2026-01-01 09:06:00+00'
);
SELECT ok(
  hall_api.complete_open_question(
    (SELECT (payload ->> 'id')::UUID FROM agenda_result WHERE kind = 'open'),
    '2026-01-01 09:07:00+00'
  ) ->> 'completedAt' IS NOT NULL,
  'an open question completes through its named action without a ballot'
);

-- HALL-FR-WSP-080
CREATE TEMP TABLE meeting_closure_result AS
SELECT hall_api.close_council_meeting(
  '10000000-0000-0000-0000-000000000001',
  '2026-01-01 10:00:00+00',
  'minutes',
  'seance-2026-01-01',
  'proces-verbal',
  '# Procès-verbal'
) AS payload;

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SELECT ok(
  (payload #>> '{closedMeeting,closedAt}') IS NOT NULL
    AND (payload #>> '{nextMeeting,previousCouncilMeetingId}')
      = '10000000-0000-0000-0000-000000000001'
    AND (payload #>> '{minutesBusiness,folderResourceId}') IS NOT NULL
    AND (payload #>> '{minutesBusiness,reportResourceId}') IS NOT NULL,
  'meeting closure atomically returns the closed meeting, successor and scoped minutes workspace identities'
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
