import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function LoadingIndicator({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span role="status" data-testid="loading-indicator" {...props} className={cn("spinner", className)} />;
}
