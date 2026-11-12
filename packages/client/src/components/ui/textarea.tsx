import type * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControl, useFieldEmptyText } from "./field";

/** Multi-line input, drawn like Input. */
function Textarea({ className, placeholder, ...props }: React.ComponentProps<"textarea">) {
  const empty = useFieldEmptyText();
  return (
    <textarea
      data-slot="textarea"
      className={cn("hall-input hall-textarea", className)}
      placeholder={placeholder ?? empty}
      {...useFieldControl(props)}
    />
  );
}

export { Textarea };
