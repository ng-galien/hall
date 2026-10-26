import { meetingLocationsSchema } from "../database/meetingLocationsSchema.js";

export const postgresUserContactMigration = `
  DO $migration$
  BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'users' AND column_name = 'council_member_id') THEN
      IF EXISTS (SELECT FROM users u LEFT JOIN hall.council_member m
        ON m.id::text = u.council_member_id
        WHERE u.council_member_id IS NOT NULL AND m.id IS NULL) THEN
        RAISE EXCEPTION 'Cannot migrate user contacts: a linked council member is missing';
      END IF;
      IF EXISTS (SELECT m.contact FROM users u JOIN hall.council_member m
        ON m.id::text = u.council_member_id GROUP BY m.contact HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Cannot migrate user contacts: several accounts refer to the same contact';
      END IF;
      ALTER TABLE users ADD COLUMN contact_id TEXT UNIQUE;
      UPDATE users u SET contact_id = m.contact::text FROM hall.council_member m
        WHERE m.id::text = u.council_member_id;
      ALTER TABLE users DROP COLUMN council_member_id;
    END IF;
  END $migration$;
`;

// @implements-requirement HALL-FR-DIR-150
export const postgresUserRoleCatalogSchema = `
  ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
  ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('administrator', 'clerk', 'contributor', 'meetingConductor', 'reader', 'councillor'));
`;

export const postgresTables = [
  "audit_events",
  "hall_settings",
  "hall_meeting_locations",
  "sessions",
  "templates",
  "user_roles",
  "users",
] as const;

/** Tables of the meeting engine that preceded the hall schema; startup never creates them. */
export const formerMeetingEngineTables = [
  "agenda_items",
  "attendance",
  "ballots",
  "council_business",
  "council_decisions",
  "council_meetings",
  "meeting_roster",
  "number_sequences",
  "votes",
] as const;

export const postgresFormerMeetingEngineRemoval = `
  DO $migration$
  DECLARE
    former_table TEXT;
    present TEXT[] := ARRAY[]::TEXT[];
    holds_rows BOOLEAN;
  BEGIN
    FOREACH former_table IN ARRAY ARRAY[${formerMeetingEngineTables.map((table) => `'${table}'`).join(", ")}] LOOP
      IF to_regclass(format('%I.%I', current_schema(), former_table)) IS NOT NULL THEN
        EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE', current_schema(), former_table);
        EXECUTE format('SELECT EXISTS (SELECT FROM %I.%I)', current_schema(), former_table) INTO holds_rows;
        IF holds_rows THEN
          RAISE EXCEPTION 'Cannot remove the former meeting engine: table %.% holds rows', current_schema(), former_table
            USING HINT = 'Nothing was removed. Inspect these rows before running hall migrate again.';
        END IF;
        present := present || format('%I.%I', current_schema(), former_table);
      END IF;
    END LOOP;
    IF cardinality(present) > 0 THEN
      EXECUTE 'DROP TABLE ' || array_to_string(present, ', ');
    END IF;
    EXECUTE format('DROP FUNCTION IF EXISTS %I.enforce_public_ballot_votes()', current_schema());
    EXECUTE format('DROP FUNCTION IF EXISTS %I.enforce_public_method_for_ballots_with_votes()', current_schema());
  END $migration$;
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
  GRANT USAGE ON SCHEMA public TO hall_owner;
  GRANT SELECT(id,population,time_zone) ON hall_settings TO hall_owner;
  ${meetingLocationsSchema}

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
    contact_id TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CONSTRAINT user_roles_role_check CHECK (role IN ('administrator', 'clerk', 'contributor', 'meetingConductor', 'reader', 'councillor')),
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

  CREATE INDEX users_by_status ON users(status, display_name);
  CREATE INDEX sessions_by_user ON sessions(user_id, expires_at);
  CREATE INDEX sessions_by_expiry ON sessions(expires_at);
  CREATE INDEX templates_by_document_type ON templates(document_type, kind);
  CREATE INDEX audit_events_by_actor ON audit_events(actor_user_id, occurred_at);
  CREATE INDEX audit_events_by_target ON audit_events(target_type, target_id, occurred_at);
`;
