export type SqlDialect = "postgres";

type QueryTemplate = string | { default: string; postgres: string };

const agendaSelection = `SELECT
  agenda_items.id,
  agenda_items.meeting_id,
  agenda_items.position,
  agenda_items.added_during_session,
  agenda_items.discussion_summary,
  agenda_items.status,
  agenda_items.started_at,
  agenda_items.completed_at,
  agenda_items.snapshot_kind,
  agenda_items.snapshot_council_decision_title,
  agenda_items.snapshot_council_decision_draft_text,
  council_business.id AS business_id,
  council_business.slug AS business_slug,
  COALESCE(agenda_items.snapshot_kind, council_business.kind) AS business_kind,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN council_business.council_decision_id ELSE agenda_items.snapshot_council_decision_id END AS business_council_decision_id,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN council_business.committee_id ELSE agenda_items.snapshot_committee_id END AS business_committee_id,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN council_business.minutes_of_meeting_id ELSE agenda_items.snapshot_minutes_of_meeting_id END AS business_minutes_of_meeting_id,
  COALESCE(agenda_items.snapshot_title, council_business.title) AS business_title,
  COALESCE(agenda_items.snapshot_report, council_business.report) AS business_report,
  COALESCE(agenda_items.snapshot_folder_path, council_business.folder_path) AS business_folder_path,
  council_business.created_at AS business_created_at,
  council_business.updated_at AS business_updated_at
FROM agenda_items
JOIN council_business ON council_business.id = agenda_items.business_id`;

const templateSelection = `SELECT id, kind, document_type, name, body_markdown, subject,
  stylesheet, header_html, footer_html, created_at, updated_at
FROM templates`;

export const queries = {
  "health.check": "SELECT 1 AS healthy",
  "agenda.listByMeeting": `${agendaSelection}
    WHERE agenda_items.meeting_id = :meetingId ORDER BY agenda_items.position`,
  "agenda.listByBusiness": `${agendaSelection}
    WHERE agenda_items.business_id = :businessId
    ORDER BY agenda_items.completed_at DESC, agenda_items.started_at DESC`,
  "agenda.find": `${agendaSelection}
    WHERE agenda_items.meeting_id = :meetingId AND agenda_items.id = :itemId`,
  "agenda.findById": `${agendaSelection} WHERE agenda_items.id = :itemId`,
  "agenda.insert": `INSERT INTO agenda_items
    (id, business_id, meeting_id, position, added_during_session)
    VALUES (:id, :businessId, :meetingId, :position, :addedDuringSession)`,
  "agenda.remove": "DELETE FROM agenda_items WHERE meeting_id = :meetingId AND id = :itemId",
  "agenda.shiftPositions": `UPDATE agenda_items SET position = position + :offset WHERE meeting_id = :meetingId`,
  "agenda.assignPosition": `UPDATE agenda_items SET position = :position WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.snapshot": `UPDATE agenda_items SET
    snapshot_kind = (SELECT kind FROM council_business WHERE council_business.id = agenda_items.business_id),
    snapshot_council_decision_id = (SELECT council_decision_id FROM council_business WHERE council_business.id = agenda_items.business_id),
    snapshot_council_decision_title = (
      SELECT council_decisions.title FROM council_business
      JOIN council_decisions ON council_decisions.id = council_business.council_decision_id
      WHERE council_business.id = agenda_items.business_id
    ),
    snapshot_council_decision_draft_text = (
      SELECT council_decisions.draft_text FROM council_business
      JOIN council_decisions ON council_decisions.id = council_business.council_decision_id
      WHERE council_business.id = agenda_items.business_id
    ),
    snapshot_committee_id = (SELECT committee_id FROM council_business WHERE council_business.id = agenda_items.business_id),
    snapshot_minutes_of_meeting_id = (SELECT minutes_of_meeting_id FROM council_business WHERE council_business.id = agenda_items.business_id),
    snapshot_title = (SELECT title FROM council_business WHERE council_business.id = agenda_items.business_id),
    snapshot_report = (SELECT report FROM council_business WHERE council_business.id = agenda_items.business_id),
    snapshot_folder_path = (SELECT folder_path FROM council_business WHERE council_business.id = agenda_items.business_id)
    WHERE id = :itemId AND snapshot_kind IS NULL`,
  "agenda.start": `UPDATE agenda_items SET status = 'inProgress', started_at = :startedAt
    WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.saveNotes": `UPDATE agenda_items SET discussion_summary = :discussionSummary
    WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.complete": `UPDATE agenda_items
    SET discussion_summary = :discussionSummary, status = :status, completed_at = :completedAt
    WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.openIds": `SELECT id FROM agenda_items WHERE meeting_id = :meetingId AND completed_at IS NULL`,
  "agenda.completeOpen": `UPDATE agenda_items
    SET status = :status, completed_at = :completedAt
    WHERE meeting_id = :meetingId AND completed_at IS NULL`,
  "agenda.copySource": `SELECT id, business_id, position, snapshot_kind, snapshot_council_decision_id,
      snapshot_council_decision_title, snapshot_council_decision_draft_text, snapshot_committee_id,
      snapshot_minutes_of_meeting_id, snapshot_title, snapshot_report, snapshot_folder_path
    FROM agenda_items
    WHERE meeting_id = :meetingId ORDER BY position`,
  "agenda.insertCopy": `INSERT INTO agenda_items
    (id, business_id, meeting_id, position, discussion_summary, status, snapshot_kind,
      snapshot_council_decision_id, snapshot_council_decision_title, snapshot_council_decision_draft_text,
      snapshot_committee_id, snapshot_minutes_of_meeting_id, snapshot_title, snapshot_report, snapshot_folder_path)
    VALUES (:id, :businessId, :meetingId, :position, '', 'scheduled', :snapshotKind,
      :snapshotCouncilDecisionId, :snapshotCouncilDecisionTitle, :snapshotCouncilDecisionDraftText,
      :snapshotCommitteeId, :snapshotMinutesOfMeetingId, :snapshotTitle, :snapshotReport, :snapshotFolderPath)`,

  "attendance.listByMeeting": "SELECT * FROM attendance WHERE meeting_id = :meetingId",
  "attendance.proxyDocumentUsed": `SELECT 1 FROM attendance WHERE proxy_document_id = :resourceId LIMIT 1`,
  "attendance.insert": `INSERT INTO attendance
    (id, meeting_id, member_id, status, proxy_holder_member_id, proxy_document_id)
    VALUES (:id, :meetingId, :memberId, :status, :proxyHolderMemberId, :proxyDocumentId)
    ON CONFLICT(meeting_id, member_id) DO NOTHING`,
  "attendance.update": `UPDATE attendance SET
    status = :status,
    proxy_holder_member_id = :proxyHolderMemberId,
    proxy_document_id = :proxyDocumentId,
    version = version + 1
    WHERE meeting_id = :meetingId AND member_id = :memberId AND version = :expectedVersion`,
  "attendance.proxyHolderConflict": `SELECT 1 FROM attendance
    WHERE meeting_id = :meetingId AND proxy_holder_member_id = :proxyHolderMemberId AND member_id <> :memberId`,
  "attendance.proxyDocumentConflict": `SELECT 1 FROM attendance
    WHERE meeting_id = :meetingId AND proxy_document_id = :proxyDocumentId AND member_id <> :memberId`,
  "attendance.findById": "SELECT * FROM attendance WHERE id = :id",
  "attendance.findByMember": "SELECT * FROM attendance WHERE meeting_id = :meetingId AND member_id = :memberId",
  "attendance.delete": "DELETE FROM attendance WHERE meeting_id = :meetingId AND member_id = :memberId",

  "ballot.listByMeeting": "SELECT * FROM ballots WHERE meeting_id = :meetingId ORDER BY created_at",
  "ballot.findFinalByDecision": `SELECT * FROM ballots WHERE council_decision_id = :councilDecisionId AND cancelled_at IS NULL`,
  "ballot.findById": "SELECT * FROM ballots WHERE id = :ballotId",
  "ballot.cancel": `UPDATE ballots SET cancelled_at = :cancelledAt WHERE id = :ballotId AND cancelled_at IS NULL`,
  "ballot.findByAgendaItem": `SELECT * FROM ballots WHERE agenda_item_id = :agendaItemId AND cancelled_at IS NULL`,
  "ballot.findByIdempotencyKey": "SELECT * FROM ballots WHERE idempotency_key = :idempotencyKey",
  "ballot.insert": `INSERT INTO ballots
    (id, meeting_id, council_decision_id, agenda_item_id, idempotency_key, command_fingerprint, method, result,
     votes_for, votes_against, abstentions, not_voting, chair_tie_break_applied, recused_member_ids_json,
     participation_evidence_json, created_at)
    VALUES (:id, :meetingId, :councilDecisionId, :agendaItemId, :idempotencyKey, :commandFingerprint, :method,
      :result, :votesFor, :votesAgainst, :abstentions, :notVoting, :chairTieBreakApplied,
      :recusedMemberIdsJson, :participationEvidenceJson, :createdAt)
    ON CONFLICT DO NOTHING`,
  "ballot.targetClaimedByDecision": `SELECT 1 FROM ballots
    WHERE council_decision_id = :councilDecisionId AND cancelled_at IS NULL`,
  "ballot.targetClaimedByAgendaItem": `SELECT 1 FROM ballots
    WHERE agenda_item_id = :agendaItemId AND cancelled_at IS NULL`,
  "ballot.insertVote": `INSERT INTO votes
    (id, ballot_id, member_id, cast_by_member_id, choice, position)
    VALUES (:id, :ballotId, :memberId, :castByMemberId, :choice, :position)`,
  "ballot.votes": "SELECT * FROM votes WHERE ballot_id = :ballotId ORDER BY position",

  "decision.list": `SELECT council_decisions.*, (
      SELECT agenda_items.meeting_id FROM agenda_items
      JOIN council_business ON council_business.id = agenda_items.business_id
      JOIN council_meetings ON council_meetings.id = agenda_items.meeting_id
      WHERE council_business.council_decision_id = council_decisions.id
      ORDER BY council_meetings.starts_at DESC LIMIT 1
    ) AS agenda_meeting_id
    FROM council_decisions ORDER BY updated_at DESC`,
  "decision.find": "SELECT * FROM council_decisions WHERE id = :reference OR slug = :reference",
  "decision.slugExists": "SELECT 1 FROM council_decisions WHERE slug = :slug OR id = :slug",
  "decision.insert": `INSERT INTO council_decisions
    (id, slug, title, draft_text, legality_review_required, created_at, updated_at)
    VALUES (:id, :slug, :title, :draftText, :legalityReviewRequired, :createdAt, :updatedAt)`,
  "decision.update": `UPDATE council_decisions SET title = :title, draft_text = :draftText, updated_at = :updatedAt
    WHERE id = :id`,
  "decision.setStatus": `UPDATE council_decisions SET status = :status, updated_at = :updatedAt WHERE id = :id`,
  "decision.assignNumber": `UPDATE council_decisions
    SET number = :number, updated_at = :updatedAt
    WHERE id = :id AND number IS NULL`,
  "decision.remove": "DELETE FROM council_decisions WHERE id = :id",

  "numberSequence.next": `INSERT INTO number_sequences (kind, year, last_value)
    VALUES (:kind, :year, 1)
    ON CONFLICT (kind, year) DO UPDATE SET last_value = number_sequences.last_value + 1
    RETURNING last_value`,

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
  "meeting.list": "SELECT * FROM council_meetings ORDER BY starts_at DESC",
  "meeting.find": "SELECT * FROM council_meetings WHERE id = :reference OR slug = :reference",
  "meeting.slugExists": "SELECT 1 FROM council_meetings WHERE slug = :slug OR id = :slug",
  "meeting.insert": `INSERT INTO council_meetings
    (id, number, slug, starts_at, location, chair_member_id, secretary_member_id, meeting_notice_sent_at,
     is_reconvened_meeting, previous_meeting_id, created_at, updated_at)
    VALUES (:id, :number, :slug, :startsAt, :location, :chairMemberId, :secretaryMemberId, :meetingNoticeSentAt,
      :isReconvenedMeeting, :previousMeetingId, :createdAt, :updatedAt)`,
  "meeting.updateDetails": `UPDATE council_meetings
    SET starts_at = :startsAt, location = :location, updated_at = :updatedAt WHERE id = :id`,
  "meeting.setStatus": `UPDATE council_meetings SET
    status = :status,
    opened_at = CASE WHEN :status = 'inProgress' AND opened_at IS NULL THEN :updatedAt ELSE opened_at END,
    closed_at = CASE WHEN :status = 'closed' AND closed_at IS NULL THEN :updatedAt ELSE closed_at END,
    updated_at = :updatedAt
    WHERE id = :id`,
  "meeting.setOfficers": `UPDATE council_meetings
    SET chair_member_id = :chairMemberId, secretary_member_id = :secretaryMemberId, updated_at = :updatedAt
    WHERE id = :id`,
  "meeting.recordQuorumFailure": `UPDATE council_meetings
    SET quorum_failure_evidence_json = :evidenceJson, updated_at = :updatedAt
    WHERE id = :id AND quorum_failure_evidence_json IS NULL`,
  "meeting.setMinutes": `UPDATE council_meetings SET
    minutes_status = :status,
    minutes_content = COALESCE(:content, minutes_content),
    minutes_approved_at = CASE WHEN :status = 'approved' THEN :occurredAt ELSE minutes_approved_at END,
    minutes_signed_at = CASE WHEN :status = 'signed' THEN :occurredAt ELSE minutes_signed_at END,
    minutes_published_at = CASE WHEN :status = 'published' THEN :occurredAt ELSE minutes_published_at END,
    updated_at = :occurredAt
    WHERE id = :id`,

  "roster.listMemberIds": `SELECT member_id FROM meeting_roster WHERE meeting_id = :meetingId ORDER BY member_id`,
  "roster.insert": `INSERT INTO meeting_roster (id, meeting_id, member_id) VALUES (:id, :meetingId, :memberId)`,
  "roster.copySource": "SELECT member_id FROM meeting_roster WHERE meeting_id = :meetingId",

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

  "councilBusiness.list": {
    default: `SELECT * FROM council_business
    WHERE (:folderPath IS NULL OR folder_path = :folderPath)
    ORDER BY updated_at DESC`,
    postgres: `SELECT * FROM council_business
    WHERE (CAST(:folderPath AS text) IS NULL OR folder_path = CAST(:folderPath AS text))
    ORDER BY updated_at DESC`,
  },
  "councilBusiness.find": "SELECT * FROM council_business WHERE id = :reference OR slug = :reference",
  "councilBusiness.hasFolderPathPrefix": `SELECT 1 FROM council_business
    WHERE folder_path = :folderPath OR substr(folder_path, 1, length(:folderPrefix)) = :folderPrefix
    LIMIT 1`,
  "councilBusiness.renameFolder": `UPDATE council_business
    SET folder_path = CASE
      WHEN folder_path = :sourcePath THEN :targetPath
      ELSE :targetPath || substr(folder_path, length(:sourcePath) + 1)
    END,
    updated_at = :updatedAt
    WHERE folder_path = :sourcePath OR substr(folder_path, 1, length(:sourcePrefix)) = :sourcePrefix`,
  "councilBusiness.slugExists": "SELECT 1 FROM council_business WHERE slug = :slug OR id = :slug",
  "councilBusiness.findByDecision": "SELECT * FROM council_business WHERE council_decision_id = :councilDecisionId",
  "councilBusiness.findMinutesApproval": "SELECT * FROM council_business WHERE minutes_of_meeting_id = :meetingId",
  "councilBusiness.insert": `INSERT INTO council_business
    (id, slug, kind, council_decision_id, committee_id, minutes_of_meeting_id, title, report, folder_path, created_at, updated_at)
    VALUES (:id, :slug, :kind, :councilDecisionId, :committeeId, :minutesOfMeetingId, :title, :report, :folderPath, :createdAt, :updatedAt)`,
  "councilBusiness.update": `UPDATE council_business
    SET title = :title, report = :report, folder_path = :folderPath,
      council_decision_id = :councilDecisionId, committee_id = :committeeId, updated_at = :updatedAt
    WHERE id = :id`,
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
