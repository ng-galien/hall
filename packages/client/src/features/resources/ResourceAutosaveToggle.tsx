import { SaveStatusGlyph } from "../../components/ui/save-status-indicator";
import { useI18n } from "../../i18n/I18nProvider";
import type { SaveStatus } from "../../pages/workspace/saveStatusStore";
import "./ResourceAutosaveToggle.css";

export function ResourceAutosaveToggle({
  enabled,
  status,
  disabled = false,
  onChange,
  showLabel = false,
}: {
  enabled: boolean;
  status: SaveStatus;
  disabled?: boolean;
  onChange(enabled: boolean): void;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const statusLabel =
    status === "saving"
      ? t("common.saving")
      : status === "saved"
        ? t("workspace.saved")
        : status === "dirty"
          ? t("workspace.saveDirty")
          : status === "error"
            ? t("common.requestFailed")
            : null;
  const stateLabel = t(enabled ? "workspace.autosaveOn" : "workspace.autosaveOff");
  const accessibleLabel = statusLabel ? `${stateLabel}. ${statusLabel}` : stateLabel;

  return (
    <button
      className={`resource-autosave-toggle${showLabel ? " resource-autosave-toggle-labeled" : ""}`}
      data-testid="resource-autosave-toggle"
      data-enabled={enabled}
      data-save-status={status}
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
    >
      <span className="resource-autosave-icon" aria-hidden="true">
        <SaveStatusGlyph status={status} enabled={enabled} />
      </span>
      {showLabel ? (
        <span role="status">
          {t("workspace.autosave")}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </span>
      ) : null}
    </button>
  );
}
