import type { DatabaseSync } from "node:sqlite";

const currentTables = [
  "agenda_item_resources",
  "agenda_items",
  "attendance",
  "audit_events",
  "ballots",
  "council_decisions",
  "council_meetings",
  "council_members",
  "hall_settings",
  "meeting_roster",
  "number_sequences",
  "resource_documents",
  "resource_tags",
  "resources",
  "sessions",
  "templates",
  "text_resources",
  "topic_resources",
  "topics",
  "user_roles",
  "users",
  "votes",
] as const;

function createCurrentSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE council_members (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL CHECK (role IN ('mayor', 'deputyMayor', 'councillor')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      term_started_on TEXT NOT NULL,
      term_ended_on TEXT
    ) STRICT;

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
      phone TEXT NOT NULL DEFAULT '',
      email TEXT,
      website TEXT,
      default_meeting_location TEXT NOT NULL DEFAULT '',
      time_zone TEXT NOT NULL DEFAULT 'Europe/Paris',
      outbound_email_sender_name TEXT NOT NULL DEFAULT '',
      outbound_email_sender_address TEXT,
      outbound_email_reply_to_address TEXT,
      updated_at TEXT
    ) STRICT;

    INSERT INTO hall_settings (id) VALUES ('hall');

    CREATE TABLE number_sequences (
      kind TEXT NOT NULL CHECK (kind IN ('meeting', 'decision')),
      year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 9999),
      last_value INTEGER NOT NULL CHECK (last_value > 0),
      PRIMARY KEY (kind, year)
    ) STRICT;

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
    ) STRICT;

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      council_member_id TEXT UNIQUE REFERENCES council_members(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('administrator', 'clerk', 'contributor', 'meetingConductor', 'reader')),
      PRIMARY KEY (user_id, role)
    ) STRICT;

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      request_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'denied', 'failed')),
      details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
      occurred_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE council_meetings (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'inProgress', 'closed', 'cancelled')),
      chair_member_id TEXT REFERENCES council_members(id),
      secretary_member_id TEXT REFERENCES council_members(id),
      meeting_notice_sent_at TEXT,
      meeting_notice_published_at TEXT,
      is_urgent INTEGER NOT NULL DEFAULT 0 CHECK (is_urgent IN (0, 1)),
      urgency_approved INTEGER CHECK (urgency_approved IN (0, 1)),
      is_reconvened_meeting INTEGER NOT NULL DEFAULT 0 CHECK (is_reconvened_meeting IN (0, 1)),
      previous_meeting_id TEXT REFERENCES council_meetings(id),
      quorum_failure_evidence_json TEXT,
      opened_at TEXT,
      closed_at TEXT,
      minutes_status TEXT NOT NULL DEFAULT 'notStarted' CHECK (minutes_status IN ('notStarted', 'draft', 'approved', 'signed', 'published')),
      minutes_content TEXT NOT NULL DEFAULT '',
      minutes_approved_at TEXT,
      minutes_signed_at TEXT,
      minutes_published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE resources (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('text', 'document')),
      title TEXT NOT NULL,
      folder_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        folder_path = '' OR (
          folder_path NOT LIKE '/%'
          AND folder_path NOT LIKE '%/'
          AND folder_path NOT LIKE '%//%'
        )
      )
    ) STRICT;

    CREATE TABLE text_resources (
      resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
      content TEXT NOT NULL
    ) STRICT;

    CREATE TABLE resource_documents (
      resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
      meeting_id TEXT REFERENCES council_meetings(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      category TEXT NOT NULL CHECK (category IN ('report', 'draftCouncilDecision', 'meetingNotice', 'minutes', 'proxy', 'supporting')),
      content BLOB NOT NULL
    ) STRICT;

    CREATE TABLE resource_tags (
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (resource_id, tag)
    ) STRICT;

    CREATE TABLE attendance (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES council_members(id),
      status TEXT NOT NULL CHECK (status IN ('present', 'represented', 'excused', 'absent')),
      proxy_holder_member_id TEXT REFERENCES council_members(id),
      proxy_document_id TEXT REFERENCES resource_documents(resource_id),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      UNIQUE (meeting_id, member_id),
      CHECK ((status = 'represented' AND proxy_holder_member_id IS NOT NULL) OR (status <> 'represented' AND proxy_holder_member_id IS NULL))
    ) STRICT;

    CREATE TABLE meeting_roster (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES council_members(id),
      UNIQUE (meeting_id, member_id)
    ) STRICT;

    CREATE TABLE council_decisions (
      id TEXT PRIMARY KEY,
      number TEXT UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      draft_text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'scheduled', 'adopted', 'rejected', 'enforceable')),
      legality_review_required INTEGER NOT NULL DEFAULT 1 CHECK (legality_review_required IN (0, 1)),
      submitted_for_legality_review_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE topics (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('subject', 'minutesApproval', 'openQuestion')),
      council_decision_id TEXT REFERENCES council_decisions(id),
      minutes_of_meeting_id TEXT REFERENCES council_meetings(id),
      title TEXT NOT NULL,
      report TEXT NOT NULL DEFAULT '',
      folder_path TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'toSchedule' CHECK (state IN ('toSchedule', 'scheduled', 'inProgress', 'examined', 'withdrawn')),
      current_meeting_id TEXT REFERENCES council_meetings(id),
      position INTEGER CHECK (position IS NULL OR position > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (kind = 'subject' AND minutes_of_meeting_id IS NULL)
        OR
        (kind = 'minutesApproval' AND council_decision_id IS NULL AND minutes_of_meeting_id IS NOT NULL)
        OR
        (kind = 'openQuestion' AND council_decision_id IS NULL AND minutes_of_meeting_id IS NULL)
      ),
      CHECK (
        (state IN ('scheduled', 'inProgress') AND current_meeting_id IS NOT NULL AND position IS NOT NULL)
        OR
        (state IN ('toSchedule', 'examined', 'withdrawn') AND current_meeting_id IS NULL AND position IS NULL)
      )
    ) STRICT;

    CREATE TABLE topic_resources (
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      resource_id TEXT NOT NULL REFERENCES resources(id),
      position INTEGER NOT NULL CHECK (position > 0),
      PRIMARY KEY (topic_id, resource_id),
      UNIQUE (topic_id, position)
    ) STRICT;

    CREATE TABLE agenda_items (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL REFERENCES topics(id),
      meeting_id TEXT NOT NULL REFERENCES council_meetings(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position > 0),
      added_during_session INTEGER NOT NULL DEFAULT 0 CHECK (added_during_session IN (0, 1)),
      discussion_summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'examined', 'postponed', 'withdrawn')),
      started_at TEXT,
      completed_at TEXT,
      snapshot_kind TEXT CHECK (snapshot_kind IN ('subject', 'minutesApproval', 'openQuestion')),
      snapshot_council_decision_id TEXT REFERENCES council_decisions(id),
      snapshot_council_decision_title TEXT,
      snapshot_council_decision_draft_text TEXT,
      snapshot_minutes_of_meeting_id TEXT REFERENCES council_meetings(id),
      snapshot_title TEXT,
      snapshot_report TEXT,
      snapshot_folder_path TEXT,
      snapshot_state TEXT CHECK (snapshot_state IN ('inProgress', 'examined', 'toSchedule', 'withdrawn')),
      UNIQUE (meeting_id, position)
    ) STRICT;

    CREATE TABLE agenda_item_resources (
      agenda_item_id TEXT NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
      resource_id TEXT NOT NULL REFERENCES resources(id),
      position INTEGER NOT NULL CHECK (position > 0),
      PRIMARY KEY (agenda_item_id, resource_id),
      UNIQUE (agenda_item_id, position)
    ) STRICT;

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
      chair_tie_break_applied INTEGER NOT NULL DEFAULT 0 CHECK (chair_tie_break_applied IN (0, 1)),
      idempotency_key TEXT,
      command_fingerprint TEXT NOT NULL,
      participation_evidence_json TEXT NOT NULL CHECK (json_valid(participation_evidence_json)),
      recused_member_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recused_member_ids_json)),
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      CHECK (
        (council_decision_id IS NOT NULL AND agenda_item_id IS NULL)
        OR
        (council_decision_id IS NULL AND agenda_item_id IS NOT NULL)
      )
    ) STRICT;

    CREATE TABLE votes (
      id TEXT PRIMARY KEY,
      ballot_id TEXT NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES council_members(id),
      cast_by_member_id TEXT NOT NULL REFERENCES council_members(id),
      choice TEXT NOT NULL CHECK (choice IN ('for', 'against', 'abstain', 'notVoting')),
      position INTEGER NOT NULL CHECK (position > 0),
      UNIQUE (ballot_id, member_id),
      UNIQUE (ballot_id, position)
    ) STRICT;

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
    CREATE UNIQUE INDEX one_minutes_approval_topic_per_meeting ON topics(minutes_of_meeting_id)
      WHERE minutes_of_meeting_id IS NOT NULL;
    CREATE UNIQUE INDEX one_topic_per_council_decision ON topics(council_decision_id)
      WHERE council_decision_id IS NOT NULL;
    CREATE INDEX topics_by_state ON topics(state, updated_at);
    CREATE INDEX agenda_items_by_meeting ON agenda_items(meeting_id, position);
    CREATE INDEX agenda_items_by_topic ON agenda_items(topic_id, meeting_id);
    CREATE INDEX topic_resources_by_resource ON topic_resources(resource_id, topic_id);
    CREATE INDEX agenda_item_resources_by_resource ON agenda_item_resources(resource_id, agenda_item_id);
    CREATE INDEX resources_by_folder ON resources(folder_path, updated_at);
    CREATE INDEX resource_tags_by_tag ON resource_tags(tag, resource_id);
    CREATE INDEX resource_documents_by_meeting ON resource_documents(meeting_id, resource_id);
    CREATE INDEX attendance_by_meeting ON attendance(meeting_id);
    CREATE INDEX users_by_status ON users(status, display_name);
    CREATE INDEX sessions_by_user ON sessions(user_id, expires_at);
    CREATE INDEX sessions_by_expiry ON sessions(expires_at);
    CREATE INDEX templates_by_document_type ON templates(document_type, kind);
    CREATE INDEX audit_events_by_actor ON audit_events(actor_user_id, occurred_at);
    CREATE INDEX audit_events_by_target ON audit_events(target_type, target_id, occurred_at);
  `);
}

export function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);
  const existingTables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'sqlite_sequence' ORDER BY name")
    .all()
    .map((row) => String(row.name));
  if (existingTables.length > 0) {
    const agendaColumns = new Set(
      database
        .prepare("PRAGMA table_info(agenda_items)")
        .all()
        .map((row) => String(row.name)),
    );
    const decisionColumns = new Set(
      database
        .prepare("PRAGMA table_info(council_decisions)")
        .all()
        .map((row) => String(row.name)),
    );
    const voteColumns = new Set(
      database
        .prepare("PRAGMA table_info(votes)")
        .all()
        .map((row) => String(row.name)),
    );
    if (
      existingTables.join("\n") !== currentTables.join("\n") ||
      !agendaColumns.has("added_during_session") ||
      !agendaColumns.has("snapshot_council_decision_draft_text") ||
      decisionColumns.has("decision_text") ||
      !voteColumns.has("position")
    ) {
      throw new Error("The database uses an obsolete schema and must be reset");
    }
    return;
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    createCurrentSchema(database);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
