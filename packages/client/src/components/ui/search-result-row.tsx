import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared search row, also usable in the workspace card view. */
export function SearchResultRow({
  glyph,
  title,
  meta,
  badge,
  active = false,
  card = false,
  onPick,
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
  return (
    <button
      className={card ? "wsearch-hit" : "workspace-explorer-row"}
      type="button"
      data-testid="search-hit"
      data-active={active || undefined}
      onClick={onPick}
      {...button}
    >
      {glyph}
      <span className={card ? "workspace-row-copy" : "workspace-explorer-copy"}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </span>
      {badge}
    </button>
  );
}
