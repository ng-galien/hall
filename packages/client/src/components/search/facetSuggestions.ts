import type { Searchable } from "../../lib/search";
import { normalizeForSearch } from "../../lib/search";

/* The `#` facet autocompletion shared by every search surface: typing `#` lists the available
   criteria (types, folders, tags), the fragment after `#` filters them, and applying one adds
   the facet to the surface's structured search state. */

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface FacetOptionSets {
  types: FacetOption[];
  folders: FacetOption[];
  tags: FacetOption[];
}

export interface FacetSuggestion {
  facet: "type" | "folder" | "tag";
  value: string;
  label: string;
  count?: number;
}

/** The `#fragment` being typed at the end of the query, if any. */
export const facetHashPattern = /#([^\s#]*)$/;

/** Facet options with counts, derived from any searchable corpus. */
export function facetOptionsFrom(
  candidates: readonly Searchable[],
  typeLabel: (kind: string) => string,
): FacetOptionSets {
  const typeCounts = new Map<string, number>();
  const folderCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const candidate of candidates) {
    typeCounts.set(candidate.kind, (typeCounts.get(candidate.kind) ?? 0) + 1);
    if (candidate.folderPath) {
      const segments = candidate.folderPath.split("/");
      for (let index = 1; index <= segments.length; index += 1) {
        const prefix = segments.slice(0, index).join("/");
        folderCounts.set(prefix, (folderCounts.get(prefix) ?? 0) + 1);
      }
    }
    for (const tag of candidate.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const descending = (counts: Map<string, number>) =>
    [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
      .map(([value, count]) => ({ value, label: value, count }));
  return {
    types: [...typeCounts.entries()].map(([value, count]) => ({ value, label: typeLabel(value), count })),
    folders: descending(folderCounts),
    tags: descending(tagCounts),
  };
}

/** The suggestions for a `#` fragment, best first, capped for display. */
export function facetSuggestionsFor(fragment: string, options: FacetOptionSets): FacetSuggestion[] {
  const needle = normalizeForSearch(fragment.trim());
  const matches = (label: string) => !needle || normalizeForSearch(label).includes(needle);
  const types = options.types
    .filter((option) => matches(option.label))
    .map((option) => ({ facet: "type" as const, value: option.value, label: option.label, count: option.count }));
  const folders = options.folders
    .filter((option) => matches(option.value))
    .slice(0, 6)
    .map((option) => ({ facet: "folder" as const, value: option.value, label: option.value, count: option.count }));
  const tags = options.tags
    .filter((option) => matches(option.value))
    .slice(0, 5)
    .map((option) => ({ facet: "tag" as const, value: option.value, label: option.value, count: option.count }));
  return [...types, ...folders, ...tags].slice(0, 14);
}
