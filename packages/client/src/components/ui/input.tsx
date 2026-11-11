import type * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

/** Text input, filled and underlined; inside a Field it takes the field's label and help. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("hall-input", className)} {...useFieldControl(props)} />;
}

export { Input };
