import type {
  AgendaItemStatus,
  AttendanceStatus,
  CouncilDecisionStatus,
  MeetingStatus,
  MinutesStatus,
} from "@hall/domain";
import { Badge } from "@/components/ui/badge";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

type DomainStatus =
  | AgendaItemStatus
  | AttendanceStatus
  | CouncilDecisionStatus
  | MeetingStatus
  | MinutesStatus
  | "active"
  | "inactive";

const domainStatusKeys: Record<DomainStatus, TranslationKey> = {
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

const meetingStatusKeys: Record<MeetingStatus, TranslationKey> = {
  draft: "meetingStatus.draft",
  scheduled: "meetingStatus.scheduled",
  inProgress: "meetingStatus.inProgress",
  closed: "meetingStatus.closed",
  cancelled: "meetingStatus.cancelled",
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
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
