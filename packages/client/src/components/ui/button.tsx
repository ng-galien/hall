import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The single button of Hall (choice 5B): one main action in solid blue per screen, the other actions on pale blue,
 * deletion in solid red, and `plain` for an icon or a menu trigger drawn without a background. An action the user
 * cannot do is absent, never greyed.
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
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
