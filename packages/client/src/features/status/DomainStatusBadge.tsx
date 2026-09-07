import type {
  AgendaItemStatus,
  AttendanceStatus,
  CouncilDecisionStatus,
  MeetingStatus,
  MinutesStatus,
} from "@hall/domain";
import { Badge } from "@/components/ui/badge";
import { matchLiteral } from "@hall/domain";
import { CalendarIcon, CheckIcon, PlayIcon, WarningIcon } from "../../components/icons";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingStatus, LiveAgendaItemStatus } from "../../models/liveMeeting";

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

export function StatusBadge({ value }: { value: DomainStatus }) {
  const { t } = useI18n();
  const variant = ["adopted", "enforceable", "ready", "present", "published"].includes(value)
    ? "success"
    : ["rejected", "cancelled", "absent"].includes(value)
      ? "destructive"
      : "secondary";
  return <Badge variant={variant}>{t(domainStatusKeys[value])}</Badge>;
}

export function AgendaItemStatusBadge({ status }: { status: LiveAgendaItemStatus }) {
  const { t } = useI18n();
  const { variant, Icon } = matchLiteral(status, {
    scheduled: () => ({ variant: "outline" as const, Icon: CalendarIcon }),
    inProgress: () => ({ variant: "brand" as const, Icon: PlayIcon }),
    examined: () => ({ variant: "success" as const, Icon: CheckIcon }),
    adjourned: () => ({ variant: "warning" as const, Icon: WarningIcon }),
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

export function MeetingStatusBadge({ status }: { status: LiveMeetingStatus }) {
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
  return <Badge variant={variant}>{t(meetingStatusKeys[status])}</Badge>;
}
