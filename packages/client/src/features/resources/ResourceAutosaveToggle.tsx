import type { SaveStatus } from "../../pages/workspace/saveStatusStore";
import { AutosaveOffIcon, AutosaveOnIcon, AutosaveSavingIcon, WarningIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import "./ResourceAutosaveToggle.css";

export function ResourceAutosaveToggle({
  enabled,
  status,
  disabled = false,
  onChange,
}: {
  enabled: boolean;
  status: SaveStatus;
  disabled?: boolean;
  onChange(enabled: boolean): void;
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
      className="resource-autosave-toggle"
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
        {status === "error" ? (
          <WarningIcon weight="bold" />
        ) : status === "saving" || status === "dirty" ? (
          <AutosaveSavingIcon weight="bold" />
        ) : enabled ? (
          <AutosaveOnIcon weight="bold" />
        ) : (
          <AutosaveOffIcon weight="bold" />
        )}
      </span>
    </button>
  );
}
