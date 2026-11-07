import type { MinutesDetail } from "@hall/api-contract";
import type { CouncilDecisionDetail, MeetingNoticeFacts } from "@hall/contracts";
import type { CouncilMember, HallSettings } from "@hall/domain";
import { matchLiteral } from "@hall/domain";
import { councilDecisionVoteTotals } from "./councilDecisionDocument.js";
import { examinedDeliberations } from "./deliberationListDocument.js";

export interface ResolvedSubjectText {
  text: string;
  source: "currentResource";
}

/**
 * Directory facts read when a document is rendered, for its signature blocks.
 * They are not part of the facts frozen at meeting closure or decision confirmation.
 */
export interface SignatoryDirectory {
  /** The single active mandate whose role is mayor; null when there is none or more than one. */
  mayor: { name: string } | null;
  /** Mandate role of each meeting officer named by the minutes facts, keyed by council member identifier. */
  roles: ReadonlyMap<string, CouncilMember["role"]>;
}

export const emptySignatoryDirectory: SignatoryDirectory = { mayor: null, roles: new Map() };

/**
 * A signature block entry: the name frozen in the facts and the mandate role read when rendering.
 * `role` is `mayor`, `deputyMayor`, `councillor`, or null when the mandate cannot be read.
 */
export interface DocumentSignatory {
  name: string;
  role: CouncilMember["role"] | null;
}

function signatory(person: { id: string; name: string } | null, directory: SignatoryDirectory) {
  return person ? { name: person.name, role: directory.roles.get(person.id) ?? null } : null;
}

/** Ephemeral presentation input, never written back into the municipal record. */
export interface GeneratedTemplateData {
  dossier?: Record<string, unknown>;
  event?: Record<string, unknown>;
  attendanceSheet?: AttendanceSheetData;
  proxy?: ProxyFormData;
}

/** A council member as named on a meeting attendance document; `role` is the mandate role. */
export interface MeetingDocumentMember {
  id: string;
  name: string;
  role: CouncilMember["role"];
}

export interface MeetingDocumentMeeting {
  number: number;
  /** Opening time once opened, otherwise the scheduled time; null while unscheduled. */
  startsAt: string | null;
  location: string | null;
}

/**
 * `attendanceSheet`: every member in mandate, in council table order, with the attendance and the
 * proxy holder recorded for the meeting when the sheet is generated; `counts` is null until recorded.
 */
export interface AttendanceSheetData {
  meeting: MeetingDocumentMeeting;
  members: Array<
    MeetingDocumentMember & {
      status: "present" | "represented" | "excused" | "absent" | null;
      proxyHolder: { name: string } | null;
    }
  >;
  counts: { present: number; represented: number; absent: number } | null;
}

/** `proxy`: the member giving the proxy (`grantor`) and the member receiving it (`holder`). */
export interface ProxyFormData {
  meeting: MeetingDocumentMeeting;
  grantor: MeetingDocumentMember;
  holder: MeetingDocumentMember;
}

// @implements-requirement HALL-FR-MIN-280
export function minutesTemplateData(
  minutes: MinutesDetail,
  subjects: ReadonlyMap<string, ResolvedSubjectText>,
  directory: SignatoryDirectory = emptySignatoryDirectory,
) {
  return {
    id: minutes.id,
    facts: minutes.facts,
    meeting: { ...minutes.facts.meeting, reconvenedFrom: minutes.facts.meeting.reconvenedFrom ?? null },
    /** `minutes.signatories.chair` and `.secretary`: officers in office at closure, null when not recorded. */
    signatories: {
      chair: signatory(minutes.facts.meeting.chair, directory) satisfies DocumentSignatory | null,
      secretary: signatory(minutes.facts.meeting.secretary, directory) satisfies DocumentSignatory | null,
    },
    attendance: minutes.facts.attendance.map((entry) => ({
      ...entry,
      proxyHolder: minutes.facts.attendance.find((candidate) => candidate.id === entry.proxyHolderId)?.member ?? null,
    })),
    conduct: minutes.facts.conduct,
    points: minutes.facts.agenda.map((item) => {
      const ballot = minutes.facts.ballots.find((candidate) => candidate.agendaItemId === item.id);
      const total = (choice: "approve" | "reject" | "abstain" | "blank" | "invalid") =>
        ballot?.votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0) ?? 0;
      const current = subjects.get(item.id);
      const subject = matchLiteral(item.kind, {
        minutesApproval: () => ({ text: "", source: "notApplicable" }),
        councilDecisionProposal: () => ({
          text: item.proposal ?? "",
          source: item.proposal === null ? "missing" : "closureSnapshot",
        }),
        openQuestion: () => ({ text: current?.text ?? "", source: current?.source ?? "missing" }),
      });
      return {
        id: item.id,
        number: item.agendaNumber,
        title: item.kind === "minutesApproval" ? "Arrêt du procès-verbal de la séance précédente" : item.title,
        kind: item.kind,
        introducedAt: item.introducedAt,
        completedAt: item.completedAt,
        adjournedAt: item.adjournedAt,
        subjectText: subject.text,
        subjectSource: subject.source,
        narrative: minutes.sections.find((section) => section.agendaItemId === item.id)?.content ?? "",
        quorumObservations: minutes.facts.conduct.quorumObservations.filter((entry) => entry.agendaItemId === item.id),
        recusals: minutes.facts.recusals.filter((entry) => entry.agendaItemId === item.id),
        closedSession: minutes.facts.conduct.closedSessions.some((entry) => entry.agendaItemIds.includes(item.id)),
        ballot: ballot
          ? {
              mode: ballot.mode,
              result: ballot.result,
              completedAt: ballot.completedAt,
              totals: {
                approve: total("approve"),
                reject: total("reject"),
                abstain: total("abstain"),
                blank: total("blank"),
                invalid: total("invalid"),
                nonParticipation: ballot.nonParticipations.reduce((sum, entry) => sum + entry.count, 0),
              },
            }
          : null,
      };
    }),
  };
}

export function documentTemplateData(input: {
  hall: HallSettings;
  meeting: unknown;
  notice: MeetingNoticeFacts | null;
  minutes: MinutesDetail | null;
  subjects: ReadonlyMap<string, ResolvedSubjectText>;
  decision: CouncilDecisionDetail | null;
  generated: { bodyMarkdown: string; subject: string | null; data?: GeneratedTemplateData } | null;
  signatories?: SignatoryDirectory;
}) {
  const directory = input.signatories ?? emptySignatoryDirectory;
  return {
    hall: input.hall,
    /** `mayor.name`: the mayor in office when the document is rendered, or null. */
    mayor: directory.mayor,
    meeting: input.meeting,
    notice: input.notice,
    minutes: input.minutes ? minutesTemplateData(input.minutes, input.subjects, directory) : null,
    decision: input.decision ? { ...input.decision, totals: councilDecisionVoteTotals(input.decision.facts) } : null,
    deliberations: input.minutes ? examinedDeliberations(input.minutes.facts) : [],
    generated: input.generated,
    dossier: input.generated?.data?.dossier ?? null,
    event: input.generated?.data?.event ?? null,
    attendanceSheet: input.generated?.data?.attendanceSheet ?? null,
    proxy: input.generated?.data?.proxy ?? null,
  };
}
