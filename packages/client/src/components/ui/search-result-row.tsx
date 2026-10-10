import { type ButtonHTMLAttributes, type ReactNode, useRef, useState } from "react";

// @implements-requirement HALL-FR-SRC-040
/** Shared search row: title on the first line, kind and folder on the second; also usable as a card. */
export function SearchResultRow({
  glyph,
  title,
  meta,
  badge,
  active = false,
  card = false,
  onPick,
  onPointerEnter,
  ...button
}: {
  glyph: ReactNode;
  title: string;
  meta: string;
  badge?: ReactNode;
  active?: boolean;
  card?: boolean;
  onPick(): void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "onClick">) {
  const titleElement = useRef<HTMLElement>(null);
  const [truncated, setTruncated] = useState(false);
  return (
    <button
      className={card ? "wsearch-hit" : "workspace-explorer-row search-result-row"}
      type="button"
      data-testid="search-hit"
      data-active={active || undefined}
      title={truncated ? title : undefined}
      onClick={onPick}
      onPointerEnter={(event) => {
        const element = titleElement.current;
        setTruncated(Boolean(element && element.scrollWidth > element.clientWidth));
        onPointerEnter?.(event);
      }}
      {...button}
    >
      {glyph}
      <span className="workspace-row-copy">
        <strong ref={titleElement} data-testid="search-hit-title">
          {title}
        </strong>
        {meta ? <span data-testid="search-hit-meta">{meta}</span> : null}
      </span>
      {badge}
    </button>
  );
}
