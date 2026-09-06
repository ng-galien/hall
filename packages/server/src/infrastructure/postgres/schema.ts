import { meetingLocationsSchema } from "../database/meetingLocationsSchema.js";

export const postgresTables = [
  "agenda_items",
  "attendance",
  "audit_events",
  "ballots",
  "council_business",
  "council_decisions",
  "council_meetings",
  "hall_settings",
  "hall_meeting_locations",
  "meeting_roster",
  "number_sequences",
  "sessions",
  "templates",
  "user_roles",
  "users",
  "votes",
] as const;

export const postgresCouncilBusinessTitleUniquenessSchema = `
  CREATE UNIQUE INDEX IF NOT EXISTS one_council_business_title_per_folder
    ON council_business(folder_path, title);
`;

export const postgresBallotVoteConfidentialitySchema = `
  CREATE OR REPLACE FUNCTION enforce_public_ballot_votes()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    ballot_method TEXT;
  BEGIN
    SELECT method INTO ballot_method
    FROM ballots
    WHERE id = NEW.ballot_id
    FOR UPDATE;

    IF ballot_method <> 'public' THEN
      RAISE EXCEPTION 'votes require a public ballot'
        USING ERRCODE = '23514', CONSTRAINT = 'votes_require_public_ballot';
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS votes_require_public_ballot ON votes;
  CREATE TRIGGER votes_require_public_ballot
  BEFORE INSERT OR UPDATE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_public_ballot_votes();

  CREATE OR REPLACE FUNCTION enforce_public_method_for_ballots_with_votes()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.method <> 'public' AND EXISTS (
      SELECT 1 FROM votes
      WHERE ballot_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'ballots with votes require the public method'
        USING ERRCODE = '23514', CONSTRAINT = 'ballots_with_votes_require_public_method';
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS ballots_with_votes_require_public_method ON ballots;
  CREATE TRIGGER ballots_with_votes_require_public_method
  BEFORE UPDATE OF method ON ballots
  FOR EACH ROW
  EXECUTE FUNCTION enforce_public_method_for_ballots_with_votes();
`;

export const postgresSchema = `
  CREATE TABLE hall_settings (
    id TEXT PRIMARY KEY CHECK (id = 'hall'),
    name TEXT NOT NULL DEFAULT '',
    insee_code TEXT,
    siren TEXT,
    population INTEGER CHECK (population IS NULL OR population >= 0),
    population_reference_date TEXT,
    address_line_1 TEXT NOT NULL DEFAULT '',
    address_line_2 TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    geographic_longitude DOUBLE PRECISION,
    geographic_latitude DOUBLE PRECISION,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT,
    website TEXT,
    time_zone TEXT NOT NULL DEFAULT 'Europe/Paris',
    outbound_email_sender_name TEXT NOT NULL DEFAULT '',
    outbound_email_sender_address TEXT,
    outbound_email_reply_to_address TEXT,
    updated_at TEXT,
    CHECK ((geographic_longitude IS NULL) = (geographic_latitude IS NULL)),
    CHECK (geographic_longitude IS NULL OR geographic_longitude BETWEEN -180 AND 180),
    CHECK (geographic_latitude IS NULL OR geographic_latitude BETWEEN -90 AND 90)
  );

  INSERT INTO hall_settings (id) VALUES ('hall');
  ${meetingLocationsSchema}

  CREATE TABLE number_sequences (
    kind TEXT NOT NULL CHECK (kind IN ('meeting', 'decision')),
    year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 9999),
    last_value INTEGER NOT NULL CHECK (last_value > 0),
    PRIMARY KEY (kind, year)
  );

  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('pdf', 'message')),
    document_type TEXT NOT NULL,
    name TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    subject TEXT,
    stylesheet TEXT NOT NULL DEFAULT '',
    header_html TEXT NOT NULL DEFAULT '',
    footer_html TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (kind, document_type),
    CHECK ((kind = 'message' AND subject IS NOT NULL) OR (kind = 'pdf' AND subject IS NULL)),
    CHECK ((kind = 'pdf') OR (stylesheet = '' AND header_html = '' AND footer_html = ''))
  );

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    council_member_id TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('administrator', 'clerk', 'contributor', 'meetingConductor', 'reader')),
    PRIMARY KEY (user_id, role)
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id),
    request_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'denied', 'failed')),
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TEXT NOT NULL
  );

  CREATE TABLE council_meetings (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    starts_at TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'inProgress', 'closed', 'cancelled')),
    chair_member_id TEXT,
    secretary_member_id TEXT,
    meeting_notice_sent_at TEXT,
    meeting_notice_published_at TEXT,
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
    urgency_approved BOOLEAN,
    is_reconvened_meeting BOOLEAN NOT NULL DEFAULT FALSE,
    previous_meeting_id TEXT REFERENCES council_meetings(id),
    quorum_failure_evidence_json JSONB,
    opened_at TEXT,
    closed_at TEXT,
    minutes_status TEXT NOT NULL DEFAULT 'notStarted' CHECK (minutes_status IN ('notStarted', 'draft', 'ready', 'approved', 'signed', 'published')),
    minutes_content TEXT NOT NULL DEFAULT '',
    minutes_approved_at TEXT,
    minutes_signed_at TEXT,
    minutes_published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE attendance (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'represented', 'excused', 'absent')),
    proxy_holder_member_id TEXT,
    proxy_document_id TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    UNIQUE (meeting_id, member_id),
    CHECK ((status = 'represented' AND proxy_holder_member_id IS NOT NULL) OR (status <> 'represented' AND proxy_holder_member_id IS NULL))
  );

  CREATE TABLE meeting_roster (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    UNIQUE (meeting_id, member_id)
  );

  CREATE TABLE council_decisions (
    id TEXT PRIMARY KEY,
    number TEXT UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    draft_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'scheduled', 'adopted', 'rejected', 'enforceable')),
    legality_review_required BOOLEAN NOT NULL DEFAULT TRUE,
    submitted_for_legality_review_at TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE council_business (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('matter', 'minutesApproval', 'openQuestion')),
    council_decision_id TEXT REFERENCES council_decisions(id),
    committee_id TEXT,
    minutes_of_meeting_id TEXT REFERENCES council_meetings(id),
    title TEXT NOT NULL,
    report TEXT NOT NULL DEFAULT '',
    folder_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (kind = 'matter' AND minutes_of_meeting_id IS NULL)
      OR
      (kind = 'minutesApproval' AND council_decision_id IS NULL AND committee_id IS NULL AND minutes_of_meeting_id IS NOT NULL)
      OR
      (kind = 'openQuestion' AND council_decision_id IS NULL AND committee_id IS NULL AND minutes_of_meeting_id IS NULL)
    )
  );

  CREATE TABLE agenda_items (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES council_business(id),
    meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position > 0),
    added_during_session BOOLEAN NOT NULL DEFAULT FALSE,
    discussion_summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'inProgress', 'examined', 'postponed', 'withdrawn')),
    started_at TEXT,
    completed_at TEXT,
    snapshot_kind TEXT CHECK (snapshot_kind IN ('matter', 'minutesApproval', 'openQuestion')),
    snapshot_council_decision_id TEXT REFERENCES council_decisions(id),
    snapshot_council_decision_title TEXT,
    snapshot_council_decision_draft_text TEXT,
    snapshot_committee_id TEXT,
    snapshot_minutes_of_meeting_id TEXT REFERENCES council_meetings(id),
    snapshot_title TEXT,
    snapshot_report TEXT,
    snapshot_folder_path TEXT,
    UNIQUE (meeting_id, position)
  );

  CREATE TABLE ballots (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
    council_decision_id TEXT REFERENCES council_decisions(id),
    agenda_item_id TEXT REFERENCES agenda_items(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('public', 'secret')),
    result TEXT NOT NULL CHECK (result IN ('adopted', 'rejected')),
    votes_for INTEGER NOT NULL CHECK (votes_for >= 0),
    votes_against INTEGER NOT NULL CHECK (votes_against >= 0),
    abstentions INTEGER NOT NULL CHECK (abstentions >= 0),
    not_voting INTEGER NOT NULL CHECK (not_voting >= 0),
    chair_tie_break_applied BOOLEAN NOT NULL DEFAULT FALSE,
    idempotency_key TEXT,
    command_fingerprint TEXT NOT NULL,
    participation_evidence_json JSONB NOT NULL,
    recused_member_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    CHECK (
      (council_decision_id IS NOT NULL AND agenda_item_id IS NULL)
      OR
      (council_decision_id IS NULL AND agenda_item_id IS NOT NULL)
    )
  );

  CREATE TABLE votes (
    id TEXT PRIMARY KEY,
    ballot_id TEXT NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    cast_by_member_id TEXT NOT NULL,
    choice TEXT NOT NULL CHECK (choice IN ('for', 'against', 'abstain', 'notVoting')),
    position INTEGER NOT NULL CHECK (position > 0),
    UNIQUE (ballot_id, member_id),
    UNIQUE (ballot_id, position)
  );

  CREATE UNIQUE INDEX one_proxy_per_holder_per_meeting
    ON attendance(meeting_id, proxy_holder_member_id)
    WHERE proxy_holder_member_id IS NOT NULL;
  CREATE UNIQUE INDEX one_proxy_document_per_meeting
    ON attendance(meeting_id, proxy_document_id)
    WHERE proxy_document_id IS NOT NULL;
  CREATE INDEX meeting_roster_by_meeting ON meeting_roster(meeting_id);
  CREATE UNIQUE INDEX ballots_by_idempotency_key ON ballots(idempotency_key) WHERE idempotency_key IS NOT NULL;
  CREATE UNIQUE INDEX one_final_ballot_per_decision ON ballots(council_decision_id)
    WHERE council_decision_id IS NOT NULL AND cancelled_at IS NULL;
  CREATE UNIQUE INDEX one_ballot_per_agenda_item ON ballots(agenda_item_id)
    WHERE agenda_item_id IS NOT NULL AND cancelled_at IS NULL;
  CREATE INDEX ballots_by_meeting ON ballots(meeting_id, created_at);
  CREATE UNIQUE INDEX one_minutes_approval_business_per_meeting ON council_business(minutes_of_meeting_id)
    WHERE minutes_of_meeting_id IS NOT NULL;
  CREATE UNIQUE INDEX one_business_per_council_decision ON council_business(council_decision_id)
    WHERE council_decision_id IS NOT NULL;
  CREATE INDEX agenda_items_by_meeting ON agenda_items(meeting_id, position);
  CREATE UNIQUE INDEX one_open_agenda_item_per_business ON agenda_items(business_id)
    WHERE status IN ('scheduled', 'inProgress');
  CREATE INDEX agenda_items_by_business ON agenda_items(business_id, meeting_id);
  CREATE INDEX attendance_by_meeting ON attendance(meeting_id);
  CREATE INDEX users_by_status ON users(status, display_name);
  CREATE INDEX sessions_by_user ON sessions(user_id, expires_at);
  CREATE INDEX sessions_by_expiry ON sessions(expires_at);
  CREATE INDEX templates_by_document_type ON templates(document_type, kind);
  CREATE INDEX audit_events_by_actor ON audit_events(actor_user_id, occurred_at);
  CREATE INDEX audit_events_by_target ON audit_events(target_type, target_id, occurred_at);
  GRANT USAGE ON SCHEMA public TO hall_owner;
  GRANT SELECT, UPDATE ON council_business TO hall_owner;
`;
