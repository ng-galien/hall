import { Badge, Button, Field, Input, Textarea, Title2 } from "@fluentui/react-components";
import { AppsListRegular, DismissRegular, GridRegular, SearchRegular } from "@fluentui/react-icons";
import type {
  AgendaItemStatus,
  AttendanceStatus,
  CouncilDecisionStatus,
  MeetingStatus,
  MinutesStatus,
  TopicState,
} from "@hall/domain";
import { type ReactNode, useEffect, useId, useState } from "react";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import type { ApiErrorCode } from "../services/apiClient";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="border-b border-border bg-surface px-7 py-4">
      <Title2 as="h1">{title}</Title2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </header>
  );
}

type StatusValue =
  | AgendaItemStatus
  | AttendanceStatus
  | CouncilDecisionStatus
  | MeetingStatus
  | MinutesStatus
  | TopicState
  | "active"
  | "inactive";

export function StatusBadge({ value }: { value: StatusValue }) {
  const { t } = useI18n();
  const color = ["adopted", "enforceable", "ready", "present", "published"].includes(value)
    ? "success"
    : ["rejected", "cancelled", "absent"].includes(value)
      ? "danger"
      : "informative";
  const labelKeys: Record<StatusValue, TranslationKey> = {
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
    toSchedule: "status.toSchedule",
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
  return (
    <Badge color={color} appearance="tint">
      {t(labelKeys[value])}
    </Badge>
  );
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
  const color =
    status === "inProgress"
      ? "success"
      : status === "cancelled"
        ? "danger"
        : status === "scheduled"
          ? "brand"
          : status === "draft"
            ? "warning"
            : "informative";
  return (
    <Badge color={color} appearance={status === "closed" ? "outline" : "tint"}>
      {t(meetingStatusKeys[status])}
    </Badge>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export type CollectionLayout = "list" | "cards";

const normalizeForSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalizeForSearch(field).includes(needle));
}

export function useCollectionView() {
  const [layout, setLayout] = useState<CollectionLayout>("list");
  const [query, setQuery] = useState("");
  return { layout, setLayout, query, setQuery };
}

export function CollectionToolbar({
  query,
  onQueryChange,
  layout,
  onLayoutChange,
  children,
}: {
  query: string;
  onQueryChange(query: string): void;
  layout: CollectionLayout;
  onLayoutChange(layout: CollectionLayout): void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="collection-toolbar">
      <div className="collection-search">
        <SearchRegular aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t("common.searchPlaceholder")}
          aria-label={t("common.search")}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </div>
      <div className="collection-toolbar-side">
        <div className="collection-layout-toggle">
          <button
            type="button"
            aria-pressed={layout === "list"}
            aria-label={t("common.layoutList")}
            className={layout === "list" ? "collection-layout-active" : undefined}
            onClick={() => onLayoutChange("list")}
          >
            <AppsListRegular aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={layout === "cards"}
            aria-label={t("common.layoutCards")}
            className={layout === "cards" ? "collection-layout-active" : undefined}
            onClick={() => onLayoutChange("cards")}
          >
            <GridRegular aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);
  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: closing on backdrop click complements the Escape key handler
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal-surface" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <Button appearance="subtle" icon={<DismissRegular />} aria-label={t("common.close")} onClick={onClose} />
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

const errorTranslationKeys: Record<ApiErrorCode, TranslationKey> = {
  agenda_ballot_required: "error.agenda_ballot_required",
  agenda_inconsistent: "error.agenda_inconsistent",
  agenda_item_not_found: "error.agenda_item_not_found",
  agenda_sequence_invalid: "error.agenda_sequence_invalid",
  attendance_incomplete: "error.attendance_incomplete",
  authentication_required: "error.authentication_required",
  permission_denied: "error.permission_denied",
  invalid_credentials: "error.invalid_credentials",
  bootstrap_unavailable: "error.bootstrap_unavailable",
  last_administrator_required: "error.last_administrator_required",
  ballot_already_recorded: "error.ballot_already_recorded",
  ballot_not_found: "error.ballot_not_found",
  ballot_voters_invalid: "error.ballot_voters_invalid",
  conflict: "error.conflict",
  council_decision_not_found: "error.council_decision_not_found",
  council_member_not_found: "error.council_member_not_found",
  upload_too_large: "error.upload_too_large",
  invalid_request: "error.invalid_request",
  invalid_meeting_transition: "error.invalid_meeting_transition",
  meeting_not_found: "error.meeting_not_found",
  meeting_officers_required: "error.meeting_officers_required",
  meeting_roster_locked: "error.meeting_roster_locked",
  network_unavailable: "error.network_unavailable",
  proxy_invalid: "error.proxy_invalid",
  quorum_not_reached: "error.quorum_not_reached",
  request_too_large: "error.request_too_large",
  request_failed: "error.request_failed",
  resource_content_unavailable: "error.resource_content_unavailable",
  resource_not_found: "error.resource_not_found",
  topic_not_found: "error.topic_not_found",
  attendance_not_found: "error.attendance_not_found",
  csrf_validation_failed: "error.csrf_validation_failed",
  route_not_found: "error.route_not_found",
  too_many_login_attempts: "error.too_many_login_attempts",
};

export function RequestErrorBanner({ error }: { error: ApiErrorCode | null }) {
  const { t } = useI18n();
  return error ? (
    <div className="error-banner" role="alert">
      {t(errorTranslationKeys[error])}
    </div>
  ) : null;
}

export { Field, Input, Textarea };
