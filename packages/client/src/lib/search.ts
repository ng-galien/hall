import type { CouncilDecisionStatus, MeetingStatus, ReferenceEntityKind } from "@hall/domain";

export type SearchableKind = ReferenceEntityKind;
export type SearchableState = CouncilDecisionStatus | MeetingStatus | import("@hall/api-contract").CouncilDecisionSummary["state"];
export const searchableMedia = ["image"] as const;
export type SearchableMedia = (typeof searchableMedia)[number];

export interface Searchable<TKind extends SearchableKind = SearchableKind> {
  kind: TKind;
  id: string;
  label: string;
  /** Secondary fields the query also matches: number, file name, role. */
  extra?: readonly (string | null | undefined)[];
  folderPath?: string;
  /** Classification tags, matched by the tag facet. */
  tags?: readonly string[];
  /** Persisted lifecycle state, matched by the state facet. */
  state?: SearchableState;
  /** Document subtype, matched by the image facet. */
  media?: SearchableMedia;
}

/** Lowercases, decomposes to NFD and strips diacritics. */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Plain text terms; a trailing `#fragment` belongs to SearchBox facet completion. */
function searchTerms(raw: string): string[] {
  return normalizeForSearch(raw)
    .split(/\s+/)
    .filter((term) => term.length > 0 && !term.startsWith("#"));
}

/** Scores a term: label prefix 3, word start 2, substring 1, secondary field 0.5, no match 0. */
function termQuality(term: string, label: string, extra: string): number {
  if (label.startsWith(term)) return 3;
  if (label.includes(` ${term}`) || label.includes(`'${term}`) || label.includes(`-${term}`)) return 2;
  if (label.includes(term)) return 1;
  if (extra.includes(term)) return 0.5;
  return 0;
}

/** Scores folder nearness: same folder 2, same subtree either way 1, otherwise 0. */
function proximity(context: string | undefined, folderPath: string | undefined): number {
  if (!context || !folderPath) return 0;
  const here = normalizeForSearch(context);
  const there = normalizeForSearch(folderPath);
  if (here === there) return 2;
  if (there.startsWith(`${here}/`) || here.startsWith(`${there}/`)) return 1;
  return 0;
}

export interface SearchOptions {
  /** Folder used to rank nearby entries first. */
  context?: string;
  limit?: number;
  /** Type facets selected through the structured search state. */
  kinds?: readonly SearchableKind[];
  /** Folder facets; an entry matches when it lives at or under one of them. */
  folders?: readonly string[];
  /** Tag facets; an entry matches when it carries every one of them. */
  tags?: readonly string[];
  /** Lifecycle-state facets selected through the structured search state. */
  states?: readonly SearchableState[];
  /** Media facets selected through the structured search state. */
  media?: readonly SearchableMedia[];
}

export interface SearchOutcome<T extends Searchable> {
  results: T[];
  /** Total match count before `limit` is applied. */
  total: number;
}

export function searchEntities<T extends Searchable>(
  candidates: readonly T[],
  rawQuery: string,
  options: SearchOptions = {},
): SearchOutcome<T> {
  const terms = searchTerms(rawQuery);
  const kinds = options.kinds ?? [];
  const folders = (options.folders ?? []).map(normalizeForSearch);
  const tags = (options.tags ?? []).map(normalizeForSearch);
  const states = options.states ?? [];
  const media = options.media ?? [];
  const scored: { item: T; quality: number; nearness: number; label: string }[] = [];

  for (const candidate of candidates) {
    if (kinds.length > 0 && !kinds.includes(candidate.kind)) continue;
    if (states.length > 0 && (!candidate.state || !states.includes(candidate.state))) continue;
    if (media.length > 0 && (!candidate.media || !media.includes(candidate.media))) continue;
    const folder = candidate.folderPath ? normalizeForSearch(candidate.folderPath) : "";
    if (folders.length > 0 && !folders.some((f) => folder === f || folder.startsWith(`${f}/`))) continue;
    if (tags.length > 0) {
      const carried = (candidate.tags ?? []).map(normalizeForSearch);
      if (!tags.every((tag) => carried.includes(tag))) continue;
    }

    const label = normalizeForSearch(candidate.label);
    const extra = normalizeForSearch((candidate.extra ?? []).filter(Boolean).join(" "));
    let quality = 0;
    let matchesAll = true;
    for (const term of terms) {
      const termScore = termQuality(term, label, extra);
      if (termScore === 0) {
        matchesAll = false;
        break;
      }
      quality += termScore;
    }
    if (!matchesAll) continue;
    scored.push({ item: candidate, quality, nearness: proximity(options.context, candidate.folderPath), label });
  }

  scored.sort(
    (left, right) =>
      right.nearness - left.nearness || right.quality - left.quality || left.label.localeCompare(right.label, "fr"),
  );

  const results = options.limit !== undefined ? scored.slice(0, options.limit) : scored;
  return { results: results.map((entry) => entry.item), total: scored.length };
}
