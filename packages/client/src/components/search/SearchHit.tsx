import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { ListRow } from "../ui/list-row";

// @implements-requirement HALL-FR-SRC-040
/**
 * One option of a shared search listbox, drawn as the shared list row: title on the first line, kind and folder on
 * the second, the full title as a tooltip when it is cut.
 */
export function SearchHit({
  testId,
  referenceId,
  resourceKind,
  glyph,
  title,
  meta,
  wide,
  active,
  selected,
  ariaSelected,
  disabled,
  onActive,
  onPick,
  onKey,
}: {
  testId: string;
  referenceId: string;
  resourceKind: string;
  glyph: ReactNode;
  title: string;
  meta: string;
  wide?: ReactNode;
  active: boolean;
  selected?: boolean;
  ariaSelected: boolean;
  disabled?: boolean;
  onActive(): void;
  onPick(): void;
  onKey(event: KeyboardEvent<HTMLElement>): void;
}) {
  const titleElement = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const optionProps = {
    role: "option",
    "aria-selected": ariaSelected,
    "data-reference-id": referenceId,
    "data-resource-kind": resourceKind,
    title: truncated ? title : undefined,
    disabled,
    onKeyDown: onKey,
    onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
    onPointerEnter: () => {
      const element = titleElement.current;
      setTruncated(Boolean(element && element.scrollWidth > element.clientWidth));
    },
  };
  return (
    <ListRow
      role="none"
      className="search-hit"
      data-active={active || undefined}
      selected={selected}
      onMouseEnter={onActive}
      onOpen={onPick}
      openTestId={testId}
      openProps={optionProps}
      head={glyph}
      title={
        <span ref={titleElement} className="search-hit-title" data-testid="search-hit-title">
          {title}
        </span>
      }
      detail={meta ? <span data-testid="search-hit-meta">{meta}</span> : undefined}
      wide={wide}
    />
  );
}
