-- Entity: one council member's declared attendance for one council meeting.
-- The row is the immutable source for physical presence, representation and
-- voting eligibility during that meeting.
CREATE TABLE hall.meeting_attendance (
  id UUID PRIMARY KEY,
  -- @implements-requirement HALL-FR-ATT-100
  council_member UUID NOT NULL REFERENCES hall.council_member (id),
  council_meeting UUID NOT NULL REFERENCES council_meetings (id),
  status meeting_attendance_status NOT NULL,
  declared_at TIMESTAMPTZ,
  -- @implements-requirement HALL-TR-CON-010
  -- The self-reference is deferred so represented and holder attendance rows
  -- can be inserted in either order inside one transaction.
  proxy_holder UUID REFERENCES meeting_attendance (id)
    DEFERRABLE INITIALLY DEFERRED,
  -- @implements-requirement HALL-FR-ATT-110
  proxy_document UUID REFERENCES hall.document_resource (id),

  -- @implements-requirement HALL-FR-ATT-020
  -- exactly one attendance declaration per meeting.
  UNIQUE (council_meeting, council_member),

  -- @implements-requirement HALL-FR-ATT-030
  -- Representation is the only attendance form carrying a written
  -- proxy, and it requires both its holder and its supporting document.
  CONSTRAINT "meeting_attendance_check" CHECK (status = 'represented'::hall.meeting_attendance_status AND proxy_holder IS NOT NULL AND proxy_document IS NOT NULL OR status <> 'represented'::hall.meeting_attendance_status AND proxy_holder IS NULL AND proxy_document IS NULL),

  -- @implements-requirement HALL-FR-ATT-040
  -- their own proxy.
  CONSTRAINT "meeting_attendance_check1" CHECK (proxy_holder IS NULL OR proxy_holder <> id)
);

-- @implements-requirement HALL-FR-ATT-050
-- present member can hold at most one proxy in a
-- meeting. The meeting column legitimately scopes this business uniqueness.
CREATE UNIQUE INDEX meeting_attendance_one_proxy_per_holder ON hall.meeting_attendance USING btree (council_meeting, proxy_holder) WHERE (proxy_holder IS NOT NULL);

-- @implements-requirement HALL-FR-ATT-060
-- document can justify at most one representation
-- in a meeting. A document may legitimately cover another meeting later.
CREATE UNIQUE INDEX meeting_attendance_one_use_per_proxy_document ON hall.meeting_attendance USING btree (council_meeting, proxy_document) WHERE (proxy_document IS NOT NULL);
