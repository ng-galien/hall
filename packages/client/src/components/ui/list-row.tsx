import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Colour family of a type icon. Every type of Hall maps to one nature in `ResourceGlyph`. */
export type ResourceNature = "writing" | "data" | "visual" | "council" | "folder";

/** Fact written after a coloured dot on the second line; never an action. */
export type ListRowStatusTone = "neutral" | "success" | "warning" | "danger";
export type ListRowStatus = { tone: ListRowStatusTone; label: ReactNode; testId?: string };

type ListRowOpen =
  | { to: string; onOpen?: never; state?: unknown }
  | { onOpen: () => void; to?: never; state?: never }
  | { to?: never; onOpen?: never; state?: never };

export type ListRowProps = Omit<ComponentPropsWithoutRef<"li">, "title" | "children"> &
  ListRowOpen & {
    head?: ReactNode;
    title: ReactNode;
    /** Second line: type, date, place or any short fact. */
    detail?: ReactNode;
    status?: ListRowStatus;
    /** Additional facts shown from 1000 pixels wide and hidden on a phone. */
    wide?: ReactNode;
    /** One button for a Siren action available to the user; the caller omits it otherwise. */
    action?: ReactNode;
    /** Content unfolded under the line. */
    children?: ReactNode;
    prominent?: boolean;
    selected?: boolean;
    /** Test identifier of the zone that opens the object. */
    openTestId?: string;
    openLabel?: string;
    openProps?: Omit<ComponentPropsWithoutRef<"button">, "onClick" | "children">;
    /** Handlers of the visible line, for selection, drag or a context menu on a tree row. */
    lineProps?: Omit<ComponentPropsWithoutRef<"div">, "children">;
    /** Wraps the visible line, for instance in a context menu trigger. */
    wrapLine?: (line: ReactElement) => ReactNode;
  };

/**
 * The single row of every list of objects, on phone, tablet and computer alike.
 * @implements-requirement HALL-FR-LAY-060
 */
export function ListRow({
  head,
  title,
  detail,
  status,
  wide,
  action,
  children,
  prominent,
  selected,
  to,
  state,
  onOpen,
  openTestId,
  openLabel,
  openProps,
  lineProps,
  wrapLine,
  className,
  ...rest
}: ListRowProps) {
  const content = (
    <>
      {head ? <span className="list-row-head">{head}</span> : null}
      <span className="list-row-text">
        <span className="list-row-title">{title}</span>
        {detail || status ? (
          <span className="list-row-detail">
            {detail ? <span className="list-row-detail-text">{detail}</span> : null}
            {status ? (
              <span className="list-row-status" data-tone={status.tone} data-testid={status.testId}>
                {status.label}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {wide ? <span className="list-row-wide">{wide}</span> : null}
    </>
  );
  const main = to ? (
    <Link className="list-row-main" to={to} state={state} data-testid={openTestId} aria-label={openLabel}>
      {content}
    </Link>
  ) : onOpen ? (
    <button
      type="button"
      {...openProps}
      className={cn("list-row-main", openProps?.className)}
      onClick={onOpen}
      data-testid={openTestId}
      aria-label={openLabel}
    >
      {content}
    </button>
  ) : (
    <div className="list-row-main" data-testid={openTestId}>
      {content}
    </div>
  );
  return (
    <li
      {...rest}
      className={cn("list-row", className)}
      data-slot="list-row"
      data-prominent={prominent ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-openable={to || onOpen || lineProps?.onClick ? "true" : undefined}
    >
      {(wrapLine ?? ((element: ReactElement) => element))(
        <div {...lineProps} className={cn("list-row-line", lineProps?.className)}>
          {main}
          {action ? <div className="list-row-action">{action}</div> : null}
        </div>,
      )}
      {children ? <div className="list-row-children">{children}</div> : null}
    </li>
  );
}

/** List of `ListRow`: white surface separated by rules. */
export function ListRows({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return <ul {...props} className={cn("list-row-list", className)} data-slot="list-row-list" />;
}

/** Type icon: Phosphor outline drawn without a pad, tinted by its nature. Used in rows and everywhere a type shows. */
export function ListRowIcon({
  nature,
  children,
  large,
  className,
}: {
  nature: ResourceNature;
  children: ReactNode;
  large?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("type-icon", large && "type-icon-large", className)} data-nature={nature} aria-hidden="true">
      {children}
    </span>
  );
}

/** Head of a council decision: its number above its year. */
export function ListRowNumber({ number, year }: { number: ReactNode; year?: ReactNode }) {
  return (
    <span className="list-row-number" aria-hidden="true">
      <strong>{number}</strong>
      {year ? <small>{year}</small> : null}
    </span>
  );
}

/** Head of a meeting: its day above its month. */
export function ListRowDate({ day, month }: { day: ReactNode; month: ReactNode }) {
  return (
    <span className="list-row-date" aria-hidden="true">
      <strong>{day}</strong>
      <small>{month}</small>
    </span>
  );
}

/** Head of a person: initials only. */
export function ListRowAvatar({ initials }: { initials: string }) {
  return (
    <span className="list-row-avatar" aria-hidden="true">
      {initials}
    </span>
  );
}
