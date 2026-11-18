import type { ReactNode } from "react";
import { AutosaveOffIcon, AutosaveOnIcon, AutosaveSavingIcon, WarningIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** The icon of a save state; `bold` by default for the small indicator, `regular` beside the other commands. */
export function SaveStatusGlyph({
  status,
  enabled = true,
  weight = "bold",
}: {
  status: SaveStatus;
  enabled?: boolean;
  weight?: "bold" | "regular";
}) {
  const glyphs: Record<SaveStatus, ReactNode> = {
    idle: enabled ? <AutosaveOnIcon weight={weight} /> : <AutosaveOffIcon weight={weight} />,
    dirty: <AutosaveSavingIcon weight={weight} />,
    saving: <AutosaveSavingIcon weight={weight} />,
    saved: <AutosaveOnIcon weight={weight} />,
    error: <WarningIcon weight={weight} />,
  };
  return <>{glyphs[status]}</>;
}

export function SaveStatusIndicator({
  status,
  label,
  testId,
  className,
}: {
  status: SaveStatus;
  label: string;
  testId?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("save-status-indicator", className)}
      data-save-status={status}
      data-testid={testId}
      role="status"
      title={label}
    >
      <span className="save-status-indicator-icon" aria-hidden="true">
        <SaveStatusGlyph status={status} />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
