import type {
  AgendaItemStatus,
  AttendanceStatus,
  CouncilDecisionStatus,
  MeetingStatus,
  MinutesStatus,
} from "@hall/domain";
import { matchLiteral } from "@hall/domain";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, CheckIcon, PlayIcon, WarningIcon } from "../../components/icons";
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

/** Tone of the dot written before a domain status in a list row. */
export function domainStatusTone(value: DomainStatus): ListRowStatusTone {
  if (value === "excused") return "warning";
  if (["adopted", "enforceable", "ready", "present", "published"].includes(value)) return "success";
  if (["rejected", "cancelled", "absent"].includes(value)) return "danger";
  return "neutral";
}

/** Status of a list row for a domain status. */
export function useDomainRowStatus(): (value: DomainStatus) => ListRowStatus {
  const { t } = useI18n();
  return (value) => ({ tone: domainStatusTone(value), label: t(domainStatusKeys[value]) });
}

export function StatusBadge({ value }: { value: DomainStatus }) {
  const { t } = useI18n();
  const variant =
    value === "represented"
      ? "brand"
      : value === "excused"
        ? "warning"
        : ["adopted", "enforceable", "ready", "present", "published"].includes(value)
          ? "success"
          : ["rejected", "cancelled", "absent"].includes(value)
            ? "destructive"
            : "secondary";
  return <Badge variant={variant}>{t(domainStatusKeys[value])}</Badge>;
}

/** Status of a list row for an agenda item. */
export function useAgendaItemRowStatus(): (status: LiveAgendaItemStatus) => ListRowStatus {
  const { t } = useI18n();
  return (status) => ({
    tone: matchLiteral(status, {
      scheduled: () => "neutral" as const,
      inProgress: () => "success" as const,
      examined: () => "success" as const,
      adjourned: () => "warning" as const,
      carriedForward: () => "warning" as const,
    }),
    label: t(domainStatusKeys[status]),
    testId: `agenda-status-${status}`,
  });
}

export function AgendaItemStatusBadge({ status }: { status: LiveAgendaItemStatus }) {
  const { t } = useI18n();
  const { variant, Icon } = matchLiteral(status, {
    scheduled: () => ({ variant: "outline" as const, Icon: CalendarIcon }),
    inProgress: () => ({ variant: "brand" as const, Icon: PlayIcon }),
    examined: () => ({ variant: "success" as const, Icon: CheckIcon }),
    adjourned: () => ({ variant: "warning" as const, Icon: WarningIcon }),
    carriedForward: () => ({ variant: "warning" as const, Icon: CalendarIcon }),
  });
  return (
    <Badge variant={variant} data-testid={`agenda-status-${status}`}>
      <Icon aria-hidden="true" />
      {t(domainStatusKeys[status])}
    </Badge>
  );
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
      ? { tone: "warning", label: t("meetings.needsReview"), testId: "meeting-needs-review" }
      : {
          tone: status === "inProgress" ? "success" : status === "cancelled" ? "danger" : "neutral",
          label: t(meetingStatusKeys[status]),
        };
}

// TODO REMOVE_STALE: temporary warning badge, distinct from the closed phase.
export function MeetingStatusBadge({ status, stale = false }: { status: LiveMeetingStatus; stale?: boolean }) {
  const { t } = useI18n();
  const variant =
    status === "inProgress"
      ? "success"
      : status === "cancelled"
        ? "destructive"
        : status === "scheduled"
          ? "brand"
          : status === "draft"
            ? "warning"
            : "secondary";
  return (
    <Badge variant={stale ? "warning" : variant} data-testid={stale ? "meeting-needs-review" : undefined}>
      {t(stale ? "meetings.needsReview" : meetingStatusKeys[status])}
    </Badge>
  );
}
