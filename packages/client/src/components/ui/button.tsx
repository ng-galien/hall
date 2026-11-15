import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { useContext } from "react";

import { I18nContext } from "@/i18n/i18nContext";
import { cn } from "@/lib/utils";
import { LoadingIndicator } from "./loading-indicator";

/**
 * The single button of Hall (choice 5B): one main action in solid blue per screen, the other actions on pale blue,
 * deletion in solid red, and `plain` for an icon or a menu trigger drawn without a background. An action the user
 * cannot do is absent, never greyed. A `pending` button waits for its request: it keeps its size, shows the wait sign
 * in place of its label and is named by `pendingLabel` (by default "Saving…").
 * @implements-requirement HALL-FR-LAY-090
 */
const buttonVariants = cva("hall-button", {
  variants: {
    variant: {
      primary: "",
      secondary: "",
      danger: "",
      plain: "",
    },
    size: {
      default: "",
      icon: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "default",
  },
});

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  type,
  pending = false,
  pendingLabel,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    pending?: boolean;
    pendingLabel?: string;
  }) {
  const i18n = useContext(I18nContext);
  const Comp = asChild ? Slot.Root : "button";
  const waiting = pending && !asChild;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
      {...(waiting
        ? { "data-pending": "true", "aria-busy": true, "aria-label": pendingLabel ?? i18n?.t("common.saving") }
        : {})}
    >
      {waiting ? (
        <>
          {children}
          <LoadingIndicator aria-hidden="true" />
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
