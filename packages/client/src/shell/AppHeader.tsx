import { PanelLeftContractRegular, PanelLeftExpandRegular } from "@fluentui/react-icons";
import { useApplicationStatus } from "../hooks/useApplicationData";
import { useI18n } from "../i18n/I18nProvider";
import { HeaderBreadcrumb } from "./HeaderBreadcrumb";

interface AppHeaderProps {
  compact: boolean;
  onToggleSidebar(): void;
}

export function AppHeader({ compact, onToggleSidebar }: AppHeaderProps) {
  const { phase, error } = useApplicationStatus();
  const { t } = useI18n();
  const connectionLabel = error
    ? error === "authentication_required"
      ? t("common.authenticationRequired")
      : t("common.serverUnavailable")
    : phase === "initializing"
      ? t("common.initializing")
      : phase === "synchronizing"
        ? t("common.syncing")
        : t("common.serverConnected");
  const pending = phase === "initializing" || phase === "synchronizing";

  return (
    <header className="flex h-(--mairie-size-header) shrink-0 items-center gap-5 border-b border-border bg-surface px-3">
      <button
        type="button"
        className="icon-button"
        aria-label={compact ? t("common.expandNavigation") : t("common.collapseNavigation")}
        aria-expanded={!compact}
        onClick={onToggleSidebar}
      >
        {compact ? <PanelLeftExpandRegular /> : <PanelLeftContractRegular />}
      </button>

      <a href="/app/" className="flex w-52 shrink-0 items-center gap-2.5" aria-label={t("app.home")}>
        <span className="grid h-7 w-7 place-items-center rounded-(--radius-small) bg-brand text-xs font-bold text-on-brand">
          M
        </span>
        <span className="text-sm font-bold tracking-brand text-text">{t("app.name")}</span>
      </a>

      <div className="flex min-w-0 items-center">
        <HeaderBreadcrumb />
      </div>

      <div
        className="ml-auto flex shrink-0 items-center gap-2 rounded-(--radius-medium) px-2 py-1 text-xs font-medium text-muted"
        role="status"
        aria-live="polite"
        data-sync-state={phase}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${error ? "bg-danger" : pending ? "connection-status-pending bg-warning" : "bg-success"}`}
        />
        <span>{connectionLabel}</span>
      </div>
    </header>
  );
}
