import { type ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { normalizeForSearch } from "../lib/search";
import type { ApiErrorCode } from "../services/apiClient";
import { CardViewIcon, CloseIcon, ListViewIcon, SearchIcon } from "./icons";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="border-b border-border bg-surface px-7 py-4">
      <h1 className="page-title">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
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
            <ListViewIcon aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={layout === "cards"}
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
    <div className="modal-backdrop" role="presentation">
      <section className="modal-surface" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <Button size="icon" variant="ghost" aria-label={t("common.close")} onClick={onClose}>
            <CloseIcon />
          </Button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

export const errorTranslationKeys: Record<ApiErrorCode, TranslationKey> = {
  agenda_ballot_required: "error.agenda_ballot_required",
  agenda_inconsistent: "error.agenda_inconsistent",
  agenda_item_not_found: "error.agenda_item_not_found",
  agenda_order_invalid: "error.agenda_order_invalid",
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
  minutes_approval_required: "error.minutes_approval_required",
  meeting_roster_locked: "error.meeting_roster_locked",
  network_unavailable: "error.network_unavailable",
  proxy_invalid: "error.proxy_invalid",
  quorum_not_reached: "error.quorum_not_reached",
  request_too_large: "error.request_too_large",
  request_failed: "error.request_failed",
  resource_content_unavailable: "error.resource_content_unavailable",
  resource_preview_conversion_failed: "error.resource_preview_conversion_failed",
  resource_preview_conversion_unavailable: "error.resource_preview_conversion_unavailable",
  resource_preview_unavailable: "error.resource_preview_unavailable",
  resource_not_found: "error.resource_not_found",
  council_business_not_found: "error.council_business_not_found",
  council_committee_not_found: "error.council_committee_not_found",
  committee_membership_not_found: "error.committee_membership_not_found",
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
