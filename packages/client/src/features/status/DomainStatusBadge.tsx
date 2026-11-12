import type {
  AgendaItemStatus,
  AttendanceStatus,
  CouncilDecisionStatus,
  MeetingStatus,
  MinutesStatus,
} from "@hall/domain";
import { matchLiteral } from "@hall/domain";
import type { ListRowStatus, ListRowStatusTone } from "../../components/ui/list-row";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveAgendaItemStatus, LiveMeetingStatus } from "../../models/liveMeeting";

export type DomainStatus =
  | import("@hall/api-contract").CouncilDecisionSummary["state"]
  | AgendaItemStatus
  | LiveAgendaItemStatus
  | AttendanceStatus
  | CouncilDecisionStatus
  | MeetingStatus
  | MinutesStatus
  | "active"
  | "inactive";

export const domainStatusKeys: Record<DomainStatus, TranslationKey> = {
  frozen: "decisionDocument.frozen",
  draft: "status.draft",
  notStarted: "status.notStarted",
  ready: "status.ready",
  scheduled: "status.scheduled",
  inProgress: "status.inProgress",
  closed: "status.closed",
  cancelled: "status.cancelled",
  approved: "status.approved",
  signed: "status.signed",
  examined: "status.examined",
  adjourned: "status.adjourned",
  carriedForward: "status.carriedForward",
  withdrawn: "status.withdrawn",
  adopted: "status.adopted",
  rejected: "status.rejected",
  postponed: "status.postponed",
  enforceable: "status.enforceable",
  present: "status.present",
  represented: "status.represented",
  excused: "status.excused",
  absent: "status.absent",
  active: "status.active",
  inactive: "status.inactive",
  published: "status.published",
};

const settledStatuses: readonly DomainStatus[] = [
  "adopted",
  "enforceable",
  "ready",
  "present",
  "represented",
  "published",
  "approved",
  "signed",
  "active",
];

/** Colour of the tag of a domain status. */
export function domainStatusTone(value: DomainStatus): ListRowStatusTone {
  if (settledStatuses.includes(value)) return "success";
  if (["rejected", "cancelled", "absent"].includes(value)) return "danger";
  if (value === "excused") return "action";
  return "neutral";
}

/** Status of a list row for a domain status. */
export function useDomainRowStatus(): (value: DomainStatus) => ListRowStatus {
  const { t } = useI18n();
  return (value) => ({ tone: domainStatusTone(value), label: t(domainStatusKeys[value]) });
}

/** A status outside a list row: the same tinted tag as in a list row. */
function StatusText({ status }: { status: ListRowStatus }) {
  return (
    <span className="list-row-status" data-tone={status.tone} data-testid={status.testId}>
      {status.label}
    </span>
  );
}

export function StatusBadge({ value }: { value: DomainStatus }) {
  return <StatusText status={useDomainRowStatus()(value)} />;
}

/** Status of a list row for an agenda item. */
export function useAgendaItemRowStatus(): (status: LiveAgendaItemStatus) => ListRowStatus {
  const { t } = useI18n();
  return (status) => ({
    tone: matchLiteral(status, {
      scheduled: () => "neutral" as const,
      inProgress: () => "success" as const,
      examined: () => "success" as const,
      adjourned: () => "action" as const,
      carriedForward: () => "action" as const,
    }),
    label: t(domainStatusKeys[status]),
    testId: `agenda-status-${status}`,
  });
}

export function AgendaItemStatusBadge({ status }: { status: LiveAgendaItemStatus }) {
  return <StatusText status={useAgendaItemRowStatus()(status)} />;
}

const meetingStatusKeys: Record<LiveMeetingStatus, TranslationKey> = {
  draft: "meetingStatus.draft",
  scheduled: "meetingStatus.scheduled",
  inProgress: "meetingStatus.inProgress",
  closed: "meetingStatus.closed",
  cancelled: "meetingStatus.cancelled",
};

/** Status of a list row for a meeting phase. */
export function useMeetingRowStatus(): (status: LiveMeetingStatus, stale?: boolean) => ListRowStatus {
  const { t } = useI18n();
  return (status, stale = false) =>
    stale
      ? { tone: "action", label: t("meetings.needsReview"), testId: "meeting-needs-review" }
      : {
          tone:
            status === "inProgress"
              ? "success"
              : status === "cancelled"
                ? "danger"
                : status === "draft"
                  ? "action"
                  : "neutral",
          label: t(meetingStatusKeys[status]),
        };
}

// TODO REMOVE_STALE: temporary warning status, distinct from the closed phase.
export function MeetingStatusBadge({ status, stale = false }: { status: LiveMeetingStatus; stale?: boolean }) {
  return <StatusText status={useMeetingRowStatus()(status, stale)} />;
}
