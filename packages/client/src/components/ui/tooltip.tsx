"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

/** Keys that move the focus from one control to the next; a focus they bring opens the tooltip of its control. */
const focusMovingKeys = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
let focusMovedByKey = false;
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (event) => (focusMovedByKey = focusMovingKeys.has(event.key)), true);
  document.addEventListener("pointerdown", () => (focusMovedByKey = false), true);
}

/** The control a tooltip names. Its tooltip opens on hover, and on focus only when the person moves the focus with the
 * keyboard: a focus the program gives, such as the first control of a window that opens, leaves it closed, so that
 * Escape goes to the window. */
function TooltipTrigger({ onFocus, ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onFocus={(event) => {
        onFocus?.(event);
        if (!focusMovedByKey) event.preventDefault();
      }}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  tone = "dark",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  /** `light` draws the label like the menus of the application: white surface, grey rule, light shadow. */
  tone?: "dark" | "light";
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-(--hall-z-popover) inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md px-3 py-1.5 text-xs has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-(--hall-z-content) **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          tone === "light"
            ? "bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
            : "bg-foreground text-background",
          className,
        )}
        {...props}
      >
        {children}
        {tone === "light" ? null : (
          <TooltipPrimitive.Arrow className="z-(--hall-z-content) size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
