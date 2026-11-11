import type * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

/** Multi-line input, filled and underlined like Input. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea data-slot="textarea" className={cn("hall-input hall-textarea", className)} {...useFieldControl(props)} />
  );
}

export { Textarea };
