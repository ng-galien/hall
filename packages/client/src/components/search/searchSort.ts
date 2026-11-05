import type { Mentionable } from "../editor/references";

export const searchSorts = ["relevance", "name", "recent", "type"] as const;
export type SearchSort = (typeof searchSorts)[number];

/** Orders search results; relevance keeps the order of the search itself. */
export function sortSearchItems(
  items: readonly Mentionable[],
  sort: SearchSort,
  typeLabel: (item: Mentionable) => string,
): Mentionable[] {
  const byName = (left: Mentionable, right: Mentionable) =>
    left.label.localeCompare(right.label, "fr", { sensitivity: "base", numeric: true });
  if (sort === "name") return [...items].sort(byName);
  if (sort === "recent")
    return [...items].sort(
      (left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || byName(left, right),
    );
  if (sort === "type")
    return [...items].sort(
      (left, right) => typeLabel(left).localeCompare(typeLabel(right), "fr") || byName(left, right),
    );
  return [...items];
}
