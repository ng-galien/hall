export type SqlDialect = "postgres";

type QueryTemplate = string | { default: string; postgres: string };

const templateSelection = `SELECT id, kind, document_type, name, body_markdown, subject,
  stylesheet, header_html, footer_html, created_at, updated_at
FROM templates`;

export const queries = {
  "health.check": "SELECT 1 AS healthy",
  "settings.get": "SELECT * FROM hall_settings WHERE id = 'hall'",
  "settings.locations": "SELECT name FROM hall_meeting_locations ORDER BY position",
  "settings.clearLocations": "DELETE FROM hall_meeting_locations",
  "settings.insertLocation": "INSERT INTO hall_meeting_locations (position, name) VALUES (:position, :name)",
  "settings.update": `UPDATE hall_settings SET
    name = :name,
    insee_code = :inseeCode,
    siren = :siren,
    population = :population,
    population_reference_date = :populationReferenceDate,
    address_line_1 = :addressLine1,
    address_line_2 = :addressLine2,
    postal_code = :postalCode,
    city = :city,
    geographic_longitude = :geographicLongitude,
    geographic_latitude = :geographicLatitude,
    phone = :phone,
    email = :email,
    website = :website,
    time_zone = :timeZone,
    outbound_email_sender_name = :outboundEmailSenderName,
    outbound_email_sender_address = :outboundEmailSenderAddress,
    outbound_email_reply_to_address = :outboundEmailReplyToAddress,
    updated_at = :updatedAt
    WHERE id = 'hall'`,
  "security.rolesForUser": "SELECT role FROM user_roles WHERE user_id = :userId ORDER BY role",
  "security.findUserById": "SELECT * FROM users WHERE id = :value",
  "security.lockUserForAuthentication": {
    default: "SELECT * FROM users WHERE id = :value",
    postgres: "SELECT * FROM users WHERE id = :value FOR UPDATE",
  },
  "security.findUserByEmail": "SELECT * FROM users WHERE email = :value",
  "security.countUsers": "SELECT COUNT(*) AS count FROM users",
  "security.countActiveAdministrators": `SELECT COUNT(*) AS count
    FROM users JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.status = 'active' AND user_roles.role = 'administrator'`,
  "security.lockAdministratorInvariant": {
    default: "SELECT 1",
    postgres: "SELECT pg_advisory_xact_lock(hashtext('hall.active_administrator_invariant'))",
  },
  "security.listUsers": "SELECT * FROM users ORDER BY display_name, email",
  "security.insertUser": `INSERT INTO users
    (id, email, display_name, password_hash, contact_id, created_at, updated_at)
    VALUES (:id, :email, :displayName, :passwordHash, :contactId, :createdAt, :updatedAt)`,
  "security.insertRole": "INSERT INTO user_roles (user_id, role) VALUES (:userId, :role)",
  "security.updateUser": `UPDATE users SET email=:email, display_name=:displayName,
    contact_id=:contactId, updated_at=:updatedAt WHERE id=:id`,
  "security.updatePassword": `UPDATE users SET password_hash=:passwordHash, updated_at=:updatedAt
    WHERE id=:id AND password_hash=:previousHash`,
  "security.deleteRoles": "DELETE FROM user_roles WHERE user_id = :userId",
  "security.disableUser": `UPDATE users SET status = 'disabled', updated_at = :updatedAt WHERE id = :id`,
  "security.reactivateUser": `UPDATE users SET status = 'active', password_hash = :passwordHash, updated_at = :updatedAt
    WHERE id = :id AND status = 'disabled'`,
  "security.deleteSessionsForUser": "DELETE FROM sessions WHERE user_id = :userId",
  "security.insertSession": `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES (:id, :userId, :tokenHash, :createdAt, :expiresAt)`,
  "security.findSession": `SELECT id, user_id, expires_at FROM sessions
    WHERE token_hash = :tokenHash AND expires_at > :now`,
  "security.deleteSession": "DELETE FROM sessions WHERE id = :id",
  "security.listAuditEvents": "SELECT * FROM audit_events ORDER BY occurred_at DESC LIMIT :limit",
  "security.findAuditEvent": "SELECT * FROM audit_events WHERE id = :id",
  "security.actorExists": "SELECT id FROM users WHERE id = :actorUserId",
  "security.insertAuditEvent": `INSERT INTO audit_events
    (id, actor_user_id, request_id, action, target_type, target_id, outcome, details_json, occurred_at)
    VALUES (:id, :actorUserId, :requestId, :action, :targetType, :targetId, :outcome, :detailsJson, :occurredAt)`,

  "template.list": `${templateSelection} ORDER BY document_type, kind`,
  "template.find": `${templateSelection} WHERE id = :id`,
  "template.insert": `INSERT INTO templates
    (id, kind, document_type, name, body_markdown, subject, stylesheet, header_html, footer_html, created_at, updated_at)
    VALUES (:id, :kind, :documentType, :name, :bodyMarkdown, :subject, :stylesheet, :headerHtml, :footerHtml, :createdAt, :updatedAt)`,
  "template.update": `UPDATE templates SET kind = :kind, document_type = :documentType, name = :name,
    body_markdown = :bodyMarkdown, subject = :subject, stylesheet = :stylesheet,
    header_html = :headerHtml, footer_html = :footerHtml, updated_at = :updatedAt WHERE id = :id`,
  "template.delete": "DELETE FROM templates WHERE id = :id",
} as const satisfies Record<string, QueryTemplate>;

export type SqlQueryName = keyof typeof queries;

export function queryText(name: SqlQueryName, dialect: SqlDialect): string {
  const template: QueryTemplate = queries[name];
  if (typeof template === "string") return template;
  return template[dialect] ?? template.default;
}
