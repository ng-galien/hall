import { type ComponentPropsWithoutRef, useContext } from "react";
import { I18nContext } from "@/i18n/i18nContext";
import { cn } from "@/lib/utils";

/**
 * The one wait sign of Hall: a turning ring, shown after a short delay so that a brief wait does not flicker. Its label
 * is read by screen readers only. `inline` sits in a line or a button, `zone` fills and centres in the area it stands
 * for, `page` fills a whole screen.
 */
export type LoadingIndicatorSize = "inline" | "zone" | "page";

export function LoadingIndicator({
  size = "inline",
  label,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  size?: LoadingIndicatorSize;
  label?: string;
  /** A plain text child is taken as the label. */
  children?: string;
}) {
  const i18n = useContext(I18nContext);
  const hidden = props["aria-hidden"] === true || props["aria-hidden"] === "true";
  const text = label ?? children ?? i18n?.t("common.loading");
  return (
    <span
      role={hidden ? undefined : "status"}
      data-testid="loading-indicator"
      data-size={size}
      {...props}
      className={cn("loading-indicator", className)}
    >
      <span className="loading-indicator-ring" aria-hidden="true" />
      {hidden || !text ? null : <span className="sr-only">{text}</span>}
    </span>
  );
}
