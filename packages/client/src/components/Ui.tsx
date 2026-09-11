import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { normalizeForSearch } from "../lib/search";
import type { ApiErrorCode } from "../services/apiClient";
import { CardViewIcon, CloseIcon, ListViewIcon, SearchIcon } from "./icons";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface px-7 py-4">
      <h1 className="page-title">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {children}
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export type CollectionLayout = "list" | "cards";

/** Substring match over fields using the shared search normalization; an empty query matches. */
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
        <SearchIcon aria-hidden="true" />
        <input
          type="search"
          data-testid="collection-search"
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
            data-testid="collection-layout-list"
            aria-label={t("common.layoutList")}
            className={layout === "list" ? "collection-layout-active" : undefined}
            onClick={() => onLayoutChange("list")}
          >
            <ListViewIcon aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={layout === "cards"}
            data-testid="collection-layout-cards"
            aria-label={t("common.layoutCards")}
            className={layout === "cards" ? "collection-layout-active" : undefined}
            onClick={() => onLayoutChange("cards")}
          >
            <CardViewIcon aria-hidden="true" />
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
  testId,
  initialFocusRef,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose(): void;
  testId?: string;
  initialFocusRef?: { current: HTMLElement | null };
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="modal-surface gap-0 p-0 sm:max-w-[var(--hall-size-modal)]"
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid={testId}
        onOpenAutoFocus={
          initialFocusRef
            ? (event) => {
                event.preventDefault();
                initialFocusRef.current?.focus();
              }
            : undefined
        }
      >
        <header className="modal-header">
          <DialogTitle>{title}</DialogTitle>
          <Button size="icon" variant="ghost" aria-label={t("common.close")} onClick={onClose}>
            <CloseIcon />
          </Button>
        </header>
        <div className="modal-content">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export const errorTranslationKeys: Record<ApiErrorCode, TranslationKey> = {
  ballot_preview_stale: "error.ballot_preview_stale",
  ballot_already_confirmed: "error.ballot_already_confirmed",
  ballot_candidate_invalid: "error.ballot_candidate_invalid",
  ballot_preview_not_found: "error.ballot_preview_not_found",
  ballot_preview_required: "error.ballot_preview_required",
  ballot_preview_mismatch: "error.ballot_preview_mismatch",
  ballot_preview_immutable: "error.ballot_preview_immutable",
  ballot_procedure_unsupported: "error.ballot_procedure_unsupported",
  ballot_voter_no_longer_eligible: "error.ballot_voter_no_longer_eligible",
  quorum_membership_required: "error.quorum_membership_required",
  quorum_attendance_incomplete: "error.quorum_attendance_incomplete",
  quorum_not_met: "error.quorum_not_met",
  discussion_quorum_required: "error.discussion_quorum_required",
  membership_record_invalid: "error.membership_record_invalid",
  current_proxy_invalid: "error.current_proxy_invalid",
  meeting_conduct_closed: "error.meeting_conduct_closed",
  conduct_chronology_invalid: "error.conduct_chronology_invalid",
  attendance_movement_unavailable: "error.attendance_movement_unavailable",
  ballot_totals_invalid: "error.ballot_totals_invalid",
  agenda_ballot_required: "error.agenda_ballot_required",
  agenda_inconsistent: "error.agenda_inconsistent",
  agenda_item_not_found: "error.agenda_item_not_found",
  agenda_order_invalid: "error.agenda_order_invalid",
  agenda_sequence_invalid: "error.agenda_sequence_invalid",
  attendance_incomplete: "error.attendance_incomplete",
  authentication_required: "error.authentication_required",
  permission_denied: "error.permission_denied",
  invalid_current_password: "error.invalid_current_password",
  invalid_credentials: "error.invalid_credentials",
  bootstrap_unavailable: "error.bootstrap_unavailable",
  last_administrator_required: "error.last_administrator_required",
  ballot_already_recorded: "error.ballot_already_recorded",
  ballot_not_found: "error.ballot_not_found",
  ballot_voters_invalid: "error.ballot_voters_invalid",
  conflict: "error.conflict",
  workspace_title_conflict: "error.workspace_title_conflict",
  workspace_folder_conflict: "error.workspace_folder_conflict",
  workspace_folder_not_found: "error.workspace_folder_not_found",
  council_decision_not_found: "error.council_decision_not_found",
  council_member_not_found: "error.council_member_not_found",
  council_term_not_configured: "error.council_term_not_configured",
  council_term_capacity_reached: "error.council_term_capacity_reached",
  council_term_capacity_below_active_count: "error.council_term_capacity_below_active_count",
  contact_not_found: "error.contact_not_found",
  contact_archived: "error.contact_archived",
  contact_already_active_council_member: "error.contact_already_active_council_member",
  contact_has_active_council_membership: "error.contact_has_active_council_membership",
  upload_too_large: "error.upload_too_large",
  invalid_request: "error.invalid_request",
  invalid_meeting_transition: "error.invalid_meeting_transition",
  meeting_not_found: "error.meeting_not_found",
  meeting_officers_required: "error.meeting_officers_required",
  minutes_approval_required: "error.minutes_approval_required",
  meeting_roster_locked: "error.meeting_roster_locked",
  network_unavailable: "error.network_unavailable",
  official_source_access_denied: "error.official_source_access_denied",
  official_source_invalid_response: "error.official_source_invalid_response",
  official_source_unavailable: "error.official_source_unavailable",
  proxy_invalid: "error.proxy_invalid",
  quorum_not_reached: "error.quorum_not_reached",
  recusal_already_recorded: "error.recusal_already_recorded",
  recusal_recording_closed: "error.recusal_recording_closed",
  recusal_member_not_declared: "error.recusal_member_not_declared",
  recused_member_cannot_participate: "error.recused_member_cannot_participate",
  recusal_immutable: "error.recusal_immutable",
  recusal_occurrence_locked: "error.recusal_occurrence_locked",
  request_too_large: "error.request_too_large",
  request_failed: "error.request_failed",
  resource_content_unavailable: "error.resource_content_unavailable",
  resource_preview_conversion_failed: "error.resource_preview_conversion_failed",
  resource_preview_unavailable: "error.resource_preview_unavailable",
  resource_not_found: "error.resource_not_found",
  council_business_has_dependencies: "error.council_business_has_dependencies",
  council_business_not_found: "error.council_business_not_found",
  council_committee_not_found: "error.council_committee_not_found",
  committee_membership_not_found: "error.committee_membership_not_found",
  attendance_not_found: "error.attendance_not_found",
  csrf_validation_failed: "error.csrf_validation_failed",
  route_not_found: "error.route_not_found",
  too_many_login_attempts: "error.too_many_login_attempts",
};

export function RequestErrorBanner({ error, onDismiss }: { error: ApiErrorCode | null; onDismiss?(): void }) {
  const { t } = useI18n();
  return error ? (
    <div className={onDismiss ? "error-banner flex items-start gap-3" : "error-banner"} role="alert">
      <span className={onDismiss ? "flex-1" : undefined}>{t(errorTranslationKeys[error])}</span>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label={t("common.close")}
          data-testid="request-error-dismiss"
        >
          <CloseIcon />
        </Button>
      ) : null}
    </div>
  ) : null;
}
