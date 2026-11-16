import { type ComponentPropsWithoutRef, Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The `mailto:` address of an email address. */
export function mailHref(address: string): string {
  return `mailto:${address}`;
}

/**
 * A telephone number that opens the call, or an email address that opens the mail application. Inside a list row, a
 * click opens the call or the mail application and leaves the row closed.
 * @implements-requirement HALL-FR-DIR-180
 */
export function CoordinateLink({
  href,
  className,
  onClick,
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      className={cn("hall-link", className)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

/** Facts of a line separated by « · ». */
export function separatedFacts(facts: ReactNode[]): ReactNode {
  return facts
    .filter((fact) => fact !== null && fact !== undefined && fact !== false && fact !== "")
    .map((fact, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the facts of a line keep their order.
      <Fragment key={index}>
        {index > 0 ? " · " : null}
        {fact}
      </Fragment>
    ));
}
