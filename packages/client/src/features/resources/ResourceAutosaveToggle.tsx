import { Button } from "../../components/ui/button";
import { SaveStatusGlyph } from "../../components/ui/save-status-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import type { SaveStatus } from "../../pages/workspace/saveStatusStore";
import "./ResourceAutosaveToggle.css";

/**
 * Autosave switch shown as its icon only: the icon carries the save state, its tooltip names the switch, the current
 * state and, when given, the date of the last change; a press turns autosave on or off.
 */
export function ResourceAutosaveToggle({
  enabled,
  status,
  onChange,
  detail,
}: {
  enabled: boolean;
  status: SaveStatus;
  onChange(enabled: boolean): void;
  /** A further line of the tooltip, such as « Modifié le … ». */
  detail?: string;
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
  const accessibleLabel = [statusLabel ? `${stateLabel}. ${statusLabel}` : stateLabel, detail]
    .filter(Boolean)
    .join(". ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="plain"
          size="icon"
          className="resource-autosave-toggle"
          data-testid="resource-autosave-toggle"
          data-enabled={enabled}
          data-save-status={status}
          role="switch"
          aria-checked={enabled}
          aria-label={accessibleLabel}
          onClick={() => onChange(!enabled)}
        >
          <span className="resource-autosave-icon" aria-hidden="true">
            <SaveStatusGlyph status={status} enabled={enabled} />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{accessibleLabel}</TooltipContent>
    </Tooltip>
  );
}
