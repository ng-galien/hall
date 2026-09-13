import type { ReactNode } from "react";
import { AutosaveOffIcon, AutosaveOnIcon, AutosaveSavingIcon, WarningIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function SaveStatusGlyph({ status, enabled = true }: { status: SaveStatus; enabled?: boolean }) {
  const glyphs: Record<SaveStatus, ReactNode> = {
    idle: enabled ? <AutosaveOnIcon weight="bold" /> : <AutosaveOffIcon weight="bold" />,
    dirty: <AutosaveSavingIcon weight="bold" />,
    saving: <AutosaveSavingIcon weight="bold" />,
    saved: <AutosaveOnIcon weight="bold" />,
    error: <WarningIcon weight="bold" />,
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
      <span>{label}</span>
    </span>
  );
}
