import type { ReferenceKind } from "@hall/templating";

export type SearchableKind = ReferenceKind;

export interface Searchable {
  kind: SearchableKind;
  id: string;
  label: string;
  /** Secondary fields the query also matches: number, file name, role. */
  extra?: readonly (string | null | undefined)[];
  folderPath?: string;
  /** Optional lifecycle state, matched by the state facet. */
  state?: string;
  /** Document subtype, matched by the image facet. */
  media?: "image";
}

/** Lowercases, decomposes to NFD and strips diacritics. */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Keys are normalized before lookup: lowercase, no accents.
const kindAliases: Record<string, SearchableKind> = {
  m: "member",
  membre: "member",
  member: "member",
  p: "resource",
  piece: "resource",
  doc: "resource",
  document: "resource",
  resource: "resource",
  s: "councilBusiness",
  sujet: "councilBusiness",
  subject: "councilBusiness",
  topic: "councilBusiness",
  seance: "meeting",
  meeting: "meeting",
  d: "decision",
  delib: "decision",
  deliberation: "decision",
  decision: "decision",
};

const folderKeys = new Set(["dossier", "chemin", "folder"]);
const stateKeys = new Set(["etat", "state"]);

const stateAliases: Record<string, string> = {
  "a-planifier": "toSchedule",
  aplanifier: "toSchedule",
  toschedule: "toSchedule",
  planifie: "scheduled",
  scheduled: "scheduled",
  examine: "examined",
  examined: "examined",
};

/** Facet prefixes shown to the user, per interface language. */
export const searchFacetTokens: Record<"fr" | "en", readonly string[]> = {
  fr: ["membre:", "doc:", "image:", "sujet:", "séance:", "délib:", "dossier:", "état:"],
  en: ["member:", "doc:", "image:", "subject:", "meeting:", "decision:", "folder:", "state:"],
};

export interface ParsedQuery {
  kinds: SearchableKind[];
  media: "image"[];
  folders: string[];
  states: string[];
  terms: string[];
}

/** Parses a query; an unknown facet falls back to a plain term. */
export function parseQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = { kinds: [], media: [], folders: [], states: [], terms: [] };
  for (const token of normalizeForSearch(raw).split(/\s+/)) {
    if (!token) continue;
    if (token === "image" || token === "img") {
      parsed.kinds.push("resource");
      parsed.media.push("image");
      continue;
    }
    const separator = token.indexOf(":");
    if (separator > 0) {
      const key = token.slice(0, separator);
      const value = token.slice(separator + 1);
      if (key === "image" || key === "img") {
        parsed.kinds.push("resource");
        parsed.media.push("image");
        if (value) parsed.terms.push(value);
        continue;
      }
      const kind = kindAliases[key];
      if (kind) {
        parsed.kinds.push(kind);
        if (value) parsed.terms.push(value);
        continue;
      }
      if (folderKeys.has(key) && value) {
        parsed.folders.push(value);
        continue;
      }
      if (stateKeys.has(key) && value) {
        parsed.states.push(stateAliases[value] ?? value);
        continue;
      }
    }
    parsed.terms.push(token);
  }
  return parsed;
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
  const query = parseQuery(rawQuery);
  const scored: { item: T; quality: number; nearness: number; label: string }[] = [];

  for (const candidate of candidates) {
    if (query.kinds.length > 0 && !query.kinds.includes(candidate.kind)) continue;
    if (query.media.length > 0 && candidate.media !== "image") continue;
    const folder = candidate.folderPath ? normalizeForSearch(candidate.folderPath) : "";
    if (query.folders.length > 0 && !query.folders.some((f) => folder === f || folder.startsWith(`${f}/`))) continue;
    if (query.states.length > 0 && (!candidate.state || !query.states.includes(candidate.state))) continue;

    const label = normalizeForSearch(candidate.label);
    const extra = normalizeForSearch((candidate.extra ?? []).filter(Boolean).join(" "));
    let quality = 0;
    let matchesAll = true;
    for (const term of query.terms) {
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
