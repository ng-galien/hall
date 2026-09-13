import type { ResourceKind } from "@hall/api-contract";
import type { CouncilDecisionStatus, MeetingStatus, ReferenceEntityKind } from "@hall/domain";

export type SearchableKind = ReferenceEntityKind;
export type SearchType = ReferenceEntityKind | Exclude<ResourceKind, "folder">;
export type SearchableState =
  | "incomplete"
  | "empty"
  | "ready"
  | CouncilDecisionStatus
  | MeetingStatus
  | import("@hall/api-contract").CouncilDecisionSummary["state"];
export const searchableMedia = ["image"] as const;
export type SearchableMedia = (typeof searchableMedia)[number];

export interface Searchable<TKind extends SearchableKind = SearchableKind> {
  kind: TKind;
  resourceKind?: Exclude<ResourceKind, "folder">;
  id: string;
  label: string;
  /** Presentation metadata; deliberately excluded from title search. */
  extra?: readonly (string | null | undefined)[];
  folderPath?: string;
  preferred?: boolean;
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

/** Title words only: whole word, prefix, substring. */
// @implements-requirement HALL-FR-SRC-010
function termQuality(term: string, label: string): number {
  const words = label.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.includes(term)) return 3;
  if (words.some((word) => word.startsWith(term))) return 2;
  return label.includes(term) ? 1 : 0;
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
  kinds?: readonly SearchType[];
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
    if (
      kinds.length > 0 &&
      !kinds.includes(candidate.kind) &&
      !(candidate.resourceKind && kinds.includes(candidate.resourceKind))
    )
      continue;
    if (states.length > 0 && (!candidate.state || !states.includes(candidate.state))) continue;
    if (media.length > 0 && (!candidate.media || !media.includes(candidate.media))) continue;
    const folder = candidate.folderPath ? normalizeForSearch(candidate.folderPath) : "";
    if (folders.length > 0 && !folders.some((f) => folder === f || folder.startsWith(`${f}/`))) continue;
    if (tags.length > 0) {
      const carried = (candidate.tags ?? []).map(normalizeForSearch);
      if (!tags.every((tag) => carried.includes(tag))) continue;
    }

    const label = normalizeForSearch(candidate.label);
    let quality = label === terms.join(" ") ? 1000 : 0;
    let matchesAll = true;
    for (const term of terms) {
      const termScore = termQuality(term, label);
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
      right.quality - left.quality ||
      Number(Boolean(right.item.preferred)) - Number(Boolean(left.item.preferred)) ||
      right.nearness - left.nearness ||
      left.label.localeCompare(right.label, "fr") ||
      left.item.id.localeCompare(right.item.id),
  );

  const results = options.limit !== undefined ? scored.slice(0, options.limit) : scored;
  return { results: results.map((entry) => entry.item), total: scored.length };
}
