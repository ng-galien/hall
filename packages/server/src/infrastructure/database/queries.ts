export type SqlDialect = "sqlite" | "postgres";

type QueryTemplate = string | { default: string; sqlite?: string; postgres?: string };

const resourceSelection = `SELECT
  resources.id,
  resources.slug,
  resources.kind,
  resources.title,
  resources.folder_path,
  resources.created_at,
  resources.updated_at,
  text_resources.content AS text_content,
  resource_documents.meeting_id,
  resource_documents.file_name,
  resource_documents.format,
  resource_documents.media_type,
  resource_documents.byte_size,
  resource_documents.content_sha256,
  resource_documents.category
FROM resources
LEFT JOIN text_resources ON text_resources.resource_id = resources.id
LEFT JOIN resource_documents ON resource_documents.resource_id = resources.id`;

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
  topics.id AS topic_id,
  topics.slug AS topic_slug,
  COALESCE(agenda_items.snapshot_kind, topics.kind) AS topic_kind,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.council_decision_id ELSE agenda_items.snapshot_council_decision_id END AS topic_council_decision_id,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.minutes_of_meeting_id ELSE agenda_items.snapshot_minutes_of_meeting_id END AS topic_minutes_of_meeting_id,
  COALESCE(agenda_items.snapshot_title, topics.title) AS topic_title,
  COALESCE(agenda_items.snapshot_report, topics.report) AS topic_report,
  COALESCE(agenda_items.snapshot_folder_path, topics.folder_path) AS topic_folder_path,
  COALESCE(agenda_items.snapshot_state, topics.state) AS topic_state,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.current_meeting_id ELSE NULL END AS topic_current_meeting_id,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.position ELSE NULL END AS topic_position,
  topics.created_at AS topic_created_at,
  topics.updated_at AS topic_updated_at
FROM agenda_items
JOIN topics ON topics.id = agenda_items.topic_id`;

const templateSelection = `SELECT id, kind, document_type, name, body_markdown, subject,
  stylesheet, header_html, footer_html, created_at, updated_at
FROM templates`;

export const queries = {
  "agenda.resources.snapshot": `${resourceSelection}
    JOIN agenda_item_resources ON agenda_item_resources.resource_id = resources.id
    WHERE agenda_item_resources.agenda_item_id = :ownerId
    ORDER BY agenda_item_resources.position`,
  "agenda.resources.topic": `${resourceSelection}
    JOIN topic_resources ON topic_resources.resource_id = resources.id
    WHERE topic_resources.topic_id = :ownerId
    ORDER BY topic_resources.position`,
  "agenda.listByMeeting": `${agendaSelection}
    WHERE agenda_items.meeting_id = :meetingId ORDER BY agenda_items.position`,
  "agenda.listByTopic": `${agendaSelection}
    WHERE agenda_items.topic_id = :topicId
    ORDER BY agenda_items.completed_at DESC, agenda_items.started_at DESC`,
  "agenda.find": `${agendaSelection}
    WHERE agenda_items.meeting_id = :meetingId AND agenda_items.id = :itemId`,
  "agenda.findById": `${agendaSelection} WHERE agenda_items.id = :itemId`,
  "agenda.insert": `INSERT INTO agenda_items
    (id, topic_id, meeting_id, position, added_during_session)
    VALUES (:id, :topicId, :meetingId, :position, :addedDuringSession)`,
  "agenda.remove": "DELETE FROM agenda_items WHERE meeting_id = :meetingId AND id = :itemId",
  "agenda.shiftPositions": `UPDATE agenda_items SET position = position + :offset WHERE meeting_id = :meetingId`,
  "agenda.assignPosition": `UPDATE agenda_items SET position = :position WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.snapshot": `UPDATE agenda_items SET
    snapshot_kind = (SELECT kind FROM topics WHERE topics.id = agenda_items.topic_id),
    snapshot_council_decision_id = (SELECT council_decision_id FROM topics WHERE topics.id = agenda_items.topic_id),
    snapshot_council_decision_title = (
      SELECT council_decisions.title FROM topics
      JOIN council_decisions ON council_decisions.id = topics.council_decision_id
      WHERE topics.id = agenda_items.topic_id
    ),
    snapshot_council_decision_draft_text = (
      SELECT council_decisions.draft_text FROM topics
      JOIN council_decisions ON council_decisions.id = topics.council_decision_id
      WHERE topics.id = agenda_items.topic_id
    ),
    snapshot_minutes_of_meeting_id = (SELECT minutes_of_meeting_id FROM topics WHERE topics.id = agenda_items.topic_id),
    snapshot_title = (SELECT title FROM topics WHERE topics.id = agenda_items.topic_id),
    snapshot_report = (SELECT report FROM topics WHERE topics.id = agenda_items.topic_id),
    snapshot_folder_path = (SELECT folder_path FROM topics WHERE topics.id = agenda_items.topic_id),
    snapshot_state = :state
    WHERE id = :itemId AND snapshot_kind IS NULL`,
  "agenda.snapshotResources": `INSERT INTO agenda_item_resources (agenda_item_id, resource_id, position)
    SELECT :itemId, resource_id, position FROM topic_resources
    WHERE topic_id = (SELECT topic_id FROM agenda_items WHERE id = :itemId)
    ON CONFLICT DO NOTHING`,
  "agenda.start": `UPDATE agenda_items SET started_at = :startedAt
    WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.saveNotes": `UPDATE agenda_items SET discussion_summary = :discussionSummary
    WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.complete": `UPDATE agenda_items
    SET discussion_summary = :discussionSummary, status = :status, completed_at = :completedAt, snapshot_state = :snapshotState
    WHERE meeting_id = :meetingId AND id = :itemId`,
  "agenda.openIds": `SELECT id FROM agenda_items WHERE meeting_id = :meetingId AND completed_at IS NULL`,
  "agenda.completeOpen": `UPDATE agenda_items
    SET status = :status, completed_at = :completedAt, snapshot_state = :snapshotState
    WHERE meeting_id = :meetingId AND completed_at IS NULL`,
  "agenda.copySource": `SELECT topic_id, position FROM agenda_items
    WHERE meeting_id = :meetingId ORDER BY position`,
  "agenda.insertCopy": `INSERT INTO agenda_items
    (id, topic_id, meeting_id, position, discussion_summary, status)
    VALUES (:id, :topicId, :meetingId, :position, '', 'scheduled')`,

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
      JOIN topics ON topics.id = agenda_items.topic_id
      JOIN council_meetings ON council_meetings.id = agenda_items.meeting_id
      WHERE topics.council_decision_id = council_decisions.id
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
    phone = :phone,
    email = :email,
    website = :website,
    default_meeting_location = :defaultMeetingLocation,
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
    (id, number, slug, title, starts_at, location, chair_member_id, secretary_member_id, meeting_notice_sent_at,
     is_reconvened_meeting, previous_meeting_id, created_at, updated_at)
    VALUES (:id, :number, :slug, :title, :startsAt, :location, :chairMemberId, :secretaryMemberId, :meetingNoticeSentAt,
      :isReconvenedMeeting, :previousMeetingId, :createdAt, :updatedAt)`,
  "meeting.updateDetails": `UPDATE council_meetings
    SET title = :title, starts_at = :startsAt, location = :location, updated_at = :updatedAt WHERE id = :id`,
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

  "member.list": "SELECT * FROM council_members ORDER BY active DESC, role, last_name, first_name",
  "member.listActive": {
    default: "SELECT * FROM council_members WHERE active = 1 ORDER BY role, last_name, first_name",
    postgres: "SELECT * FROM council_members WHERE active = TRUE ORDER BY role, last_name, first_name",
  },
  "member.find": "SELECT * FROM council_members WHERE id = :id",
  "member.insert": `INSERT INTO council_members
    (id, first_name, last_name, email, role, term_started_on)
    VALUES (:id, :firstName, :lastName, :email, :role, :termStartedOn)`,

  "roster.listMemberIds": `SELECT member_id FROM meeting_roster WHERE meeting_id = :meetingId ORDER BY member_id`,
  "roster.insert": `INSERT INTO meeting_roster (id, meeting_id, member_id) VALUES (:id, :meetingId, :memberId)`,
  "roster.copySource": "SELECT member_id FROM meeting_roster WHERE meeting_id = :meetingId",

  "resource.tags": "SELECT tag FROM resource_tags WHERE resource_id = :resourceId ORDER BY tag",
  "resource.list": {
    default: `${resourceSelection}
      WHERE (:folderPath IS NULL OR resources.folder_path = :folderPath)
        AND (:kind IS NULL OR resources.kind = :kind)
        AND (:meetingId IS NULL OR resource_documents.meeting_id = :meetingId)
      ORDER BY resources.updated_at DESC`,
    sqlite: `${resourceSelection}
      WHERE (:folderPath IS NULL OR resources.folder_path = :folderPath)
        AND (:kind IS NULL OR resources.kind = :kind)
        AND (:meetingId IS NULL OR resource_documents.meeting_id = :meetingId)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(:tagsJson) requested_tag
          WHERE NOT EXISTS (
            SELECT 1 FROM resource_tags
            WHERE resource_tags.resource_id = resources.id AND resource_tags.tag = requested_tag.value
          )
        )
      ORDER BY resources.updated_at DESC`,
    postgres: `${resourceSelection}
      WHERE (CAST(:folderPath AS text) IS NULL OR resources.folder_path = CAST(:folderPath AS text))
        AND (CAST(:kind AS text) IS NULL OR resources.kind = CAST(:kind AS text))
        AND (CAST(:meetingId AS text) IS NULL OR resource_documents.meeting_id = CAST(:meetingId AS text))
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(CAST(:tagsJson AS jsonb)) requested_tag(value)
          WHERE NOT EXISTS (
            SELECT 1 FROM resource_tags
            WHERE resource_tags.resource_id = resources.id AND resource_tags.tag = requested_tag.value
          )
        )
      ORDER BY resources.updated_at DESC`,
  },
  "resource.findMetadata": `${resourceSelection} WHERE resources.id = :reference OR resources.slug = :reference`,
  "resource.slugExists": "SELECT 1 FROM resources WHERE slug = :slug OR id = :slug",
  "resource.documentContent": "SELECT content FROM resource_documents WHERE resource_id = :id",
  "resource.folderPaths": `SELECT DISTINCT folder_path FROM resources WHERE folder_path <> '' ORDER BY folder_path`,
  "resource.insertTextBase": `INSERT INTO resources
    (id, slug, kind, title, folder_path, created_at, updated_at)
    VALUES (:id, :slug, 'text', :title, :folderPath, :createdAt, :updatedAt)`,
  "resource.insertDocumentBase": `INSERT INTO resources
    (id, slug, kind, title, folder_path, created_at, updated_at)
    VALUES (:id, :slug, 'document', :title, :folderPath, :createdAt, :updatedAt)`,
  "resource.insertText": "INSERT INTO text_resources (resource_id, content) VALUES (:id, :content)",
  "resource.insertDocument": `INSERT INTO resource_documents
    (resource_id, meeting_id, file_name, format, media_type, byte_size, content_sha256, category, content)
    VALUES (:id, :meetingId, :fileName, :format, :mediaType, :byteSize, :contentSha256, :category, :content)`,
  "resource.insertTag": "INSERT INTO resource_tags (resource_id, tag) VALUES (:resourceId, :tag)",
  "resource.update": `UPDATE resources SET title = :title, folder_path = :folderPath, updated_at = :updatedAt WHERE id = :id`,
  "resource.updateText": "UPDATE text_resources SET content = :content WHERE resource_id = :id",
  "resource.deleteTags": "DELETE FROM resource_tags WHERE resource_id = :id",
  "resource.isSnapshotted": `SELECT 1 FROM agenda_item_resources WHERE resource_id = :id LIMIT 1`,
  "resource.delete": "DELETE FROM resources WHERE id = :id",

  "security.rolesForUser": "SELECT role FROM user_roles WHERE user_id = :userId ORDER BY role",
  "security.findUserById": "SELECT * FROM users WHERE id = :value",
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
    (id, email, display_name, password_hash, council_member_id, created_at, updated_at)
    VALUES (:id, :email, :displayName, :passwordHash, :councilMemberId, :createdAt, :updatedAt)`,
  "security.insertRole": "INSERT INTO user_roles (user_id, role) VALUES (:userId, :role)",
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

  "topic.resources": `${resourceSelection}
    JOIN topic_resources ON topic_resources.resource_id = resources.id
    WHERE topic_resources.topic_id = :topicId
    ORDER BY topic_resources.position`,
  "topic.list": {
    default: `SELECT * FROM topics
    WHERE (:state IS NULL OR state = :state)
      AND (:folderPath IS NULL OR folder_path = :folderPath)
      AND (:resourceId IS NULL OR EXISTS (
        SELECT 1 FROM topic_resources
        WHERE topic_resources.topic_id = topics.id AND topic_resources.resource_id = :resourceId
      ))
    ORDER BY updated_at DESC`,
    postgres: `SELECT * FROM topics
    WHERE (CAST(:state AS text) IS NULL OR state = CAST(:state AS text))
      AND (CAST(:folderPath AS text) IS NULL OR folder_path = CAST(:folderPath AS text))
      AND (CAST(:resourceId AS text) IS NULL OR EXISTS (
        SELECT 1 FROM topic_resources
        WHERE topic_resources.topic_id = topics.id AND topic_resources.resource_id = CAST(:resourceId AS text)
      ))
    ORDER BY updated_at DESC`,
  },
  "topic.find": "SELECT * FROM topics WHERE id = :reference OR slug = :reference",
  "topic.slugExists": "SELECT 1 FROM topics WHERE slug = :slug OR id = :slug",
  "topic.findByDecision": "SELECT * FROM topics WHERE council_decision_id = :councilDecisionId",
  "topic.findMinutesApproval": "SELECT * FROM topics WHERE minutes_of_meeting_id = :meetingId",
  "topic.insert": `INSERT INTO topics
    (id, slug, kind, council_decision_id, minutes_of_meeting_id, title, report, folder_path, created_at, updated_at)
    VALUES (:id, :slug, :kind, :councilDecisionId, :minutesOfMeetingId, :title, :report, :folderPath, :createdAt, :updatedAt)`,
  "topic.update": `UPDATE topics
    SET title = :title, report = :report, folder_path = :folderPath,
      council_decision_id = :councilDecisionId, updated_at = :updatedAt
    WHERE id = :id`,
  "topic.deleteResources": "DELETE FROM topic_resources WHERE topic_id = :topicId",
  "topic.insertResource": `INSERT INTO topic_resources (topic_id, resource_id, position)
    VALUES (:topicId, :resourceId, :position)`,
  "topic.schedule": `UPDATE topics
    SET state = 'scheduled', current_meeting_id = :meetingId, position = :position, updated_at = :updatedAt
    WHERE id = :id`,
  "topic.setState": `UPDATE topics
    SET state = :state, current_meeting_id = NULL, position = NULL, updated_at = :updatedAt WHERE id = :id`,
  "topic.start": `UPDATE topics SET state = 'inProgress', updated_at = :updatedAt WHERE id = :id`,
  "topic.setPosition": `UPDATE topics SET position = :position, updated_at = :updatedAt WHERE id = :id`,
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
