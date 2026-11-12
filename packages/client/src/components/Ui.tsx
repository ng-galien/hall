import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { normalizeForSearch } from "../lib/search";
import type { ApiErrorCode } from "../services/apiClient";
import { ScreenTitle } from "../shell/headerTrail";
import { CloseIcon } from "./icons";
import { SearchInput } from "./ui/search-input";

/**
 * Names the screen in the large title of the screen header and lays out what goes under it: the description, shown
 * from tablet width, and the controls of the page. It never repeats the title.
 */
export function PageHeader({
  title,
  description,
  children,
  titleAction,
  above,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  titleAction?: ReactNode;
  above?: ReactNode;
}) {
  const controls = titleAction || children;
  return (
    <>
      <ScreenTitle>{title}</ScreenTitle>
      {above || description || controls ? (
        <div className="page-header">
          {above}
          {description ? <p className="page-header-description">{description}</p> : null}
          {controls ? (
            <div className="page-header-controls">
              {titleAction}
              {children}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function EmptyState({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="empty-state" data-testid={testId}>
      {children}
    </div>
  );
}

/** Substring match over fields using the shared search normalization; an empty query matches. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalizeForSearch(field).includes(needle));
}

/** Query of a collection. */
export function useCollectionView() {
  const [query, setQuery] = useState("");
  return { query, setQuery };
}

export function CollectionToolbar({
  query,
  onQueryChange,
  children,
}: {
  query: string;
  onQueryChange(query: string): void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="collection-toolbar">
      <SearchInput
        type="search"
        data-testid="collection-search"
        value={query}
        placeholder={t("common.searchPlaceholder")}
        aria-label={t("common.search")}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
      <div className="collection-toolbar-side">{children}</div>
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
  returnFocusRef,
  size = "default",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose(): void;
  testId?: string;
  initialFocusRef?: { current: HTMLElement | null };
  returnFocusRef?: { current: HTMLElement | null };
  size?: "default" | "wide";
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className={`modal-surface gap-0 p-0 ${
          size === "wide"
            ? "modal-surface-wide max-w-[min(calc(100%-2rem),var(--hall-size-modal-wide))]"
            : "max-w-[min(calc(100%-2rem),var(--hall-size-modal))]"
        }`}
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid={testId}
        onCloseAutoFocus={
          returnFocusRef
            ? (event) => {
                event.preventDefault();
                returnFocusRef.current?.focus();
              }
            : undefined
        }
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
          <Button
            size="icon"
            variant="plain"
            aria-label={t("common.close")}
            data-testid={testId ? `${testId}-close` : undefined}
            onClick={onClose}
          >
            <CloseIcon />
          </Button>
        </header>
        <div className="modal-content" data-testid={testId ? `${testId}-content` : undefined}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const errorTranslationKeys: Record<ApiErrorCode, TranslationKey> = {
  ballot_preview_stale: "error.ballot_preview_stale",
  agenda_item_notes_clear_unconfirmed: "error.agenda_item_notes_clear_unconfirmed",
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
  password_change_required: "error.password_change_required",
  password_must_differ: "error.password_must_differ",
  password_link_unusable: "error.password_link_unusable",
  password_link_too_frequent: "error.password_link_too_frequent",
  invalid_current_password: "error.invalid_current_password",
  invalid_credentials: "error.invalid_credentials",
  bootstrap_unavailable: "error.bootstrap_unavailable",
  last_administrator_required: "error.last_administrator_required",
  built_in_administrator_protected: "error.built_in_administrator_protected",
  invalid_authorization_grant: "error.invalid_authorization_grant",
  authorization_role_changed: "error.authorization_role_changed",
  authorization_role_in_use: "error.authorization_role_in_use",

  councillor_requires_active_member: "error.councillor_requires_active_member",
  personal_workspace_resource_not_associable: "error.personal_workspace_resource_not_associable",
  council_business_report_not_deletable: "error.council_business_report_not_deletable",
  council_business_folder_not_deletable: "error.council_business_folder_not_deletable",
  meeting_cited_document_not_deletable: "error.meeting_cited_document_not_deletable",
  meeting_dossier_unavailable: "error.meeting_dossier_unavailable",
  deliberation_list_unavailable: "error.deliberation_list_unavailable",
  proxy_form_invalid: "error.proxy_form_invalid",
  meeting_attendance_documents_closed: "error.meeting_attendance_documents_closed",
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
  recusal_member_not_present: "error.recusal_member_not_present",
  ballot_chair_invalid: "error.ballot_chair_invalid",
  ballot_officers_not_present: "error.ballot_officers_not_present",
  meeting_officer_change_invalid: "error.meeting_officer_change_invalid",
  auxiliary_attendance_invalid: "error.auxiliary_attendance_invalid",
  attendance_outside_membership: "error.attendance_outside_membership",
  agenda_revision_item_moved: "error.agenda_revision_item_moved",
  proxy_consecutive_limit: "error.proxy_consecutive_limit",
  closed_session_invalid: "error.closed_session_invalid",
  recusal_immutable: "error.recusal_immutable",
  recusal_occurrence_locked: "error.recusal_occurrence_locked",
  request_too_large: "error.request_too_large",
  request_failed: "error.request_failed",
  database_statement_timeout: "error.database_statement_timeout",
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

export function RequestErrorBanner({
  error,
  onDismiss,
  compact = false,
  testId = "request-error-dismiss",
}: {
  error: ApiErrorCode | null;
  onDismiss?(): void;
  compact?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  return error ? (
    <div
      className={`${compact ? "error-banner error-banner-compact" : "error-banner"}${onDismiss ? " flex items-center gap-2" : ""}`}
      role="alert"
    >
      <span className={onDismiss ? "flex-1" : undefined}>{t(errorTranslationKeys[error])}</span>
      {onDismiss ? (
        <Button
          type="button"
          variant="plain"
          size="icon"
          onClick={onDismiss}
          aria-label={t("common.close")}
          data-testid={testId}
        >
          <CloseIcon />
        </Button>
      ) : null}
    </div>
  ) : null;
}
