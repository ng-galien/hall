import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

/** A tooltip that lists labelled facts about the element it wraps, instead of one line of text. */
export function DetailTooltip({ rows, children }: { rows: readonly DetailRow[]; children: ReactNode }) {
  const shown = rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
  if (!shown.length) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="detail-tooltip" side="bottom" align="start">
        <dl>
          {shown.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
