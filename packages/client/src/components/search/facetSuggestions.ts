import type { Searchable, SearchableMedia, SearchableState } from "../../lib/search";
import { normalizeForSearch } from "../../lib/search";

/* The `#` facet autocompletion shared by every search surface: typing `#` lists the available
   criteria (types, folders, tags, states and media), the fragment after `#` filters them, and
   applying one adds the facet to the surface's structured search state. */

export interface FacetOption<TValue extends string = string> {
  value: TValue;
  label: string;
  count?: number;
}

export interface FacetOptionSets<
  TKind extends string = string,
  TState extends string = SearchableState,
  TMedia extends string = SearchableMedia,
> {
  types: FacetOption<TKind>[];
  folders: FacetOption[];
  tags: FacetOption[];
  states: FacetOption<TState>[];
  media: FacetOption<TMedia>[];
}

export type FacetSuggestion<
  TKind extends string = string,
  TState extends string = SearchableState,
  TMedia extends string = SearchableMedia,
> =
  | { facet: "type"; value: TKind; label: string; count?: number }
  | { facet: "folder"; value: string; label: string; count?: number }
  | { facet: "tag"; value: string; label: string; count?: number }
  | { facet: "state"; value: TState; label: string; count?: number }
  | { facet: "media"; value: TMedia; label: string; count?: number };

export interface FacetValueLabels {
  state(value: SearchableState): string;
  media(value: SearchableMedia): string;
}

/** The `#fragment` being typed at the end of the query, if any. */
export const facetHashPattern = /#([^\s#]*)$/;

/** Facet options with counts, derived from any searchable corpus. */
export function facetOptionsFrom<TKind extends Searchable["kind"]>(
  candidates: readonly (Searchable & { kind: TKind })[],
  typeLabel: (kind: TKind) => string,
  typeOrder?: readonly TKind[],
  valueLabels: FacetValueLabels = { state: (value) => value, media: (value) => value },
): FacetOptionSets<TKind> {
  const typeCounts = new Map<TKind, number>();
  const folderCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const stateCounts = new Map<SearchableState, number>();
  const mediaCounts = new Map<SearchableMedia, number>();
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
    if (candidate.state) stateCounts.set(candidate.state, (stateCounts.get(candidate.state) ?? 0) + 1);
    if (candidate.media) mediaCounts.set(candidate.media, (mediaCounts.get(candidate.media) ?? 0) + 1);
  }
  const descending = (counts: Map<string, number>) =>
    [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
      .map(([value, count]) => ({ value, label: value, count }));
  const orderedTypes = typeOrder ?? [...typeCounts.keys()];
  return {
    types: orderedTypes.map((value) => ({ value, label: typeLabel(value), count: typeCounts.get(value) ?? 0 })),
    folders: descending(folderCounts),
    tags: descending(tagCounts),
    states: [...stateCounts.entries()]
      .sort((left, right) => valueLabels.state(left[0]).localeCompare(valueLabels.state(right[0]), "fr"))
      .map(([value, count]) => ({ value, label: valueLabels.state(value), count })),
    media: [...mediaCounts.entries()]
      .sort((left, right) => valueLabels.media(left[0]).localeCompare(valueLabels.media(right[0]), "fr"))
      .map(([value, count]) => ({ value, label: valueLabels.media(value), count })),
  };
}

/** The suggestions for a `#` fragment, best first, capped for display. */
export function facetSuggestionsFor<TKind extends string, TState extends string, TMedia extends string>(
  fragment: string,
  options: FacetOptionSets<TKind, TState, TMedia>,
): FacetSuggestion<TKind, TState, TMedia>[] {
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
  const states = options.states
    .filter((option) => matches(option.label))
    .map((option) => ({ facet: "state" as const, ...option }));
  const media = options.media
    .filter((option) => matches(option.label))
    .map((option) => ({ facet: "media" as const, ...option }));
  return [...types, ...states, ...media, ...folders, ...tags].slice(0, 14);
}
