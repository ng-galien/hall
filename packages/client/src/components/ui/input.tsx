import type * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldControl, useFieldEmptyText } from "./field";

/** Text input; inside a Field it takes the field's label, help and « Non renseigné » when it is empty. */
function Input({ className, type, placeholder, ...props }: React.ComponentProps<"input">) {
  const empty = useFieldEmptyText();
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("hall-input", className)}
      placeholder={placeholder ?? empty}
      {...useFieldControl(props)}
    />
  );
}

export { Input };
