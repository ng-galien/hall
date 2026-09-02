import { describe, expect, it } from "vitest";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { createAgendaItemRepository } from "../repositories/agendaItemRepository.js";
import { createAttendanceRepository } from "../repositories/attendanceRepository.js";
import { createCommitteeMembershipRepository } from "../repositories/committeeMembershipRepository.js";
import { createContentTemplateRepository } from "../repositories/contentTemplateRepository.js";
import { createCouncilDecisionRepository } from "../repositories/councilDecisionRepository.js";
import { createCouncilMeetingRepository } from "../repositories/councilMeetingRepository.js";
import { createCouncilMemberRepository } from "../repositories/councilMemberRepository.js";
import { createHallSettingsRepository } from "../repositories/hallSettingsRepository.js";
import { createSecurityRepository } from "../repositories/securityRepository.js";

const id = (digit: number) => {
  const value = String(digit);
  return `${value.repeat(8)}-1111-4111-8111-${value.repeat(12)}`;
};

function executorReturning(rows: Record<string, unknown>[]): SqlExecutor {
  return { all: async () => rows } as unknown as SqlExecutor;
}

describe("repository discriminant decoding", () => {
  it("rejects unknown attendance and committee-membership statuses", async () => {
    const attendance = createAttendanceRepository({
      sqlExecutor: executorReturning([
        {
          id: id(1),
          meeting_id: id(2),
          member_id: id(3),
          status: "teleported",
          proxy_holder_member_id: null,
          proxy_document_id: null,
          version: 1,
        },
      ]),
    });
    await expect(attendance.listForMeeting(id(2))).rejects.toThrow();

    const membership = createCommitteeMembershipRepository({
      sqlExecutor: executorReturning([
        {
          id: id(1),
          committee_id: id(2),
          council_member_id: id(3),
          role: "observer",
          started_on: "2026-01-01",
          ended_on: null,
        },
      ]),
    });
    await expect(membership.listForCommittee(id(2))).rejects.toThrow();
  });

  it("rejects unknown template, member and decision discriminants", async () => {
    const template = createContentTemplateRepository({
      sqlExecutor: executorReturning([
        {
          id: id(1),
          kind: "spreadsheet",
          document_type: "meeting-notice",
          name: "Template",
          body_markdown: "Body",
          subject: null,
          stylesheet: "",
          header_html: "",
          footer_html: "",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ]),
    });
    await expect(template.list()).rejects.toThrow();

    const malformedTemplate = createContentTemplateRepository({
      sqlExecutor: executorReturning([
        {
          id: id(1),
          kind: "pdf",
          document_type: "meeting-notice",
          name: 42,
          body_markdown: "Body",
          subject: null,
          stylesheet: "",
          header_html: "",
          footer_html: "",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ]),
    });
    await expect(malformedTemplate.list()).rejects.toThrow("content_template.name");

    const member = createCouncilMemberRepository({
      sqlExecutor: executorReturning([
        {
          id: id(1),
          contact_id: id(2),
          contact_first_name: "Ada",
          contact_last_name: "Lovelace",
          contact_organization_name: null,
          contact_job_title: null,
          contact_email: null,
          contact_phone: null,
          contact_archived_at: null,
          role: "observer",
          term_started_on: "2026-01-01",
          term_ended_on: null,
        },
      ]),
    });
    await expect(member.list()).rejects.toThrow();

    const decision = createCouncilDecisionRepository({
      sqlExecutor: executorReturning([
        {
          id: id(1),
          number: null,
          slug: "decision",
          title: "Decision",
          draft_text: "Draft",
          status: "archived",
          legality_review_required: 0,
          submitted_for_legality_review_at: null,
          published_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          agenda_meeting_id: null,
        },
      ]),
    });
    await expect(decision.list()).rejects.toThrow();
  });

  it("rejects unknown agenda and meeting lifecycle statuses", async () => {
    const agendaExecutor = {
      all: async (name: string) =>
        name === "agenda.listByMeeting"
          ? [
              {
                id: id(1),
                meeting_id: id(2),
                position: 1,
                added_during_session: 0,
                discussion_summary: "",
                status: "skipped",
                snapshot_kind: null,
                snapshot_council_decision_id: null,
                snapshot_council_decision_title: null,
                snapshot_council_decision_draft_text: null,
                snapshot_committee_id: null,
                snapshot_minutes_of_meeting_id: null,
                snapshot_title: null,
                snapshot_report: null,
                snapshot_folder_path: null,
                started_at: null,
                completed_at: null,
                business_id: id(3),
                business_slug: "business",
                business_kind: "openQuestion",
                business_council_decision_id: null,
                business_committee_id: null,
                business_minutes_of_meeting_id: null,
                business_title: "Business",
                business_report: "Report",
                business_folder_path: "seed",
                business_created_at: "2026-01-01T00:00:00.000Z",
                business_updated_at: "2026-01-01T00:00:00.000Z",
              },
            ]
          : [],
    } as unknown as SqlExecutor;
    await expect(createAgendaItemRepository({ sqlExecutor: agendaExecutor }).listForMeeting(id(2))).rejects.toThrow();

    const malformedPositionExecutor = {
      ...agendaExecutor,
      all: async (name: string) => {
        const rows = name === "agenda.listByMeeting" ? await agendaExecutor.all("agenda.listByMeeting") : [];
        return name === "agenda.listByMeeting"
          ? rows.map((row) => ({ ...row, status: "scheduled", position: "1.5" }))
          : rows;
      },
    } as unknown as SqlExecutor;
    await expect(
      createAgendaItemRepository({ sqlExecutor: malformedPositionExecutor }).listForMeeting(id(2)),
    ).rejects.toThrow("agenda_item.position");

    let meetingStatus = "unknown";
    let minutesStatus = "notStarted";
    const meetingExecutor = {
      all: async () => [
        {
          id: id(1),
          number: "2026-001",
          slug: "2026-01-01-001",
          starts_at: "2026-01-01T18:00:00.000Z",
          location: "Town hall",
          status: meetingStatus,
          chair_member_id: null,
          secretary_member_id: null,
          meeting_notice_sent_at: null,
          meeting_notice_published_at: null,
          is_urgent: 0,
          urgency_approved: null,
          is_reconvened_meeting: 0,
          previous_meeting_id: null,
          quorum_failure_evidence_json: null,
          opened_at: null,
          closed_at: null,
          minutes_status: minutesStatus,
          minutes_content: "",
          minutes_approved_at: null,
          minutes_signed_at: null,
          minutes_published_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    } as unknown as SqlExecutor;
    const meetings = createCouncilMeetingRepository({ sqlExecutor: meetingExecutor });
    await expect(meetings.list()).rejects.toThrow();
    meetingStatus = "draft";
    minutesStatus = "unknown";
    await expect(meetings.list()).rejects.toThrow();
  });

  it("rejects corrupt nullable numbers and unpaired geographic coordinates", async () => {
    const row: Record<string, unknown> = {
      name: "Hall",
      insee_code: null,
      siren: null,
      population: "not-a-number",
      population_reference_date: null,
      address_line_1: "1 place de la mairie",
      address_line_2: "",
      postal_code: "75000",
      city: "Paris",
      geographic_longitude: null,
      geographic_latitude: null,
      phone: "",
      email: null,
      website: null,
      default_meeting_location: "Mairie",
      time_zone: "Europe/Paris",
      outbound_email_sender_name: "Hall",
      outbound_email_sender_address: null,
      outbound_email_reply_to_address: null,
      updated_at: null,
    };
    const executor = { get: async () => row } as unknown as SqlExecutor;
    const settings = createHallSettingsRepository({ sqlExecutor: executor });
    await expect(settings.get()).rejects.toThrow("hall_settings.population");

    row.population = "1000";
    row.geographic_longitude = "2.35";
    await expect(settings.get()).rejects.toThrow("longitude and latitude must be paired");
  });

  it("rejects unknown security roles, user statuses and audit outcomes", async () => {
    let userStatus = "active";
    let role = "hacker";
    let auditOutcome = "ignored";
    let councilMemberId: unknown = null;
    const executor = {
      all: async (name: string) => {
        if (name === "security.listUsers") {
          return [
            {
              id: id(1),
              email: "ada@example.test",
              display_name: "Ada",
              password_hash: "hash",
              status: userStatus,
              council_member_id: councilMemberId,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ];
        }
        if (name === "security.rolesForUser") return [{ role }];
        if (name === "security.listAuditEvents") {
          return [
            {
              id: id(2),
              actor_user_id: null,
              request_id: "request",
              action: "action",
              target_type: "target",
              target_id: null,
              outcome: auditOutcome,
              details_json: "{}",
              occurred_at: "2026-01-01T00:00:00.000Z",
            },
          ];
        }
        return [];
      },
    } as unknown as SqlExecutor;
    const security = createSecurityRepository({ sqlExecutor: executor });
    await expect(security.listUsers()).rejects.toThrow();
    role = "reader";
    userStatus = "blocked";
    await expect(security.listUsers()).rejects.toThrow();
    userStatus = "active";
    councilMemberId = "";
    await expect(security.listUsers()).rejects.toThrow();
    councilMemberId = null;
    await expect(security.listAuditEvents()).rejects.toThrow();

    auditOutcome = "succeeded";
    const invalidDetailsExecutor = {
      ...executor,
      all: async (name: string) =>
        name === "security.listAuditEvents"
          ? [
              {
                id: id(2),
                actor_user_id: null,
                request_id: "request",
                action: "action",
                target_type: "target",
                target_id: null,
                outcome: auditOutcome,
                details_json: "[]",
                occurred_at: "2026-01-01T00:00:00.000Z",
              },
            ]
          : [],
    } as unknown as SqlExecutor;
    await expect(createSecurityRepository({ sqlExecutor: invalidDetailsExecutor }).listAuditEvents()).rejects.toThrow();
  });
});
