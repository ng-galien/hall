/**
 * Le moteur de recherche commun — la spec vit dans docs/spec-recherche-unifiee.md.
 *
 * Une seule grammaire (`[facette:]* termes`), une seule normalisation (casse et accents
 * ignorés), un seul classement (proximité de dossier, puis qualité de correspondance,
 * puis alphabétique). Le menu `@` de l'éditeur, la recherche de l'espace de travail et
 * les filtres de listes consomment ce module : aucune surface ne réimplémente la sienne.
 */

import type { ReferenceKind } from "@hall/templating";

/** Les types cherchables sont exactement les références du contrat de templating. */
export type SearchableKind = ReferenceKind;

export interface Searchable {
  kind: SearchableKind;
  id: string;
  label: string;
  /** Champs secondaires où la requête porte aussi : numéro, nom de fichier, rôle… */
  extra?: readonly (string | null | undefined)[];
  folderPath?: string;
  /** État d'un sujet, pour la facette `état:`. */
  state?: string;
}

/** La normalisation du contrat : minuscules, décomposition NFD, diacritiques supprimés. */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/* Les alias de la facette de type — le français courant et l'anglais, sans accents
   puisque la clé est normalisée avant d'être résolue. */
const kindAliases: Record<string, SearchableKind> = {
  m: "member",
  membre: "member",
  member: "member",
  p: "resource",
  piece: "resource",
  doc: "resource",
  document: "resource",
  resource: "resource",
  s: "topic",
  sujet: "topic",
  topic: "topic",
  seance: "meeting",
  meeting: "meeting",
  d: "decision",
  delib: "decision",
  deliberation: "decision",
  decision: "decision",
};

const folderKeys = new Set(["dossier", "chemin", "folder"]);
const stateKeys = new Set(["etat", "state"]);

/* Les valeurs de la facette `état:`, alignées sur les états des sujets. */
const stateAliases: Record<string, string> = {
  "a-planifier": "toSchedule",
  aplanifier: "toSchedule",
  toschedule: "toSchedule",
  planifie: "scheduled",
  scheduled: "scheduled",
  examine: "examined",
  examined: "examined",
};

/** Les préfixes à enseigner à l'utilisateur, dans la langue de l'interface. */
export const searchFacetTokens: Record<"fr" | "en", readonly string[]> = {
  fr: ["membre:", "doc:", "sujet:", "séance:", "délib:", "dossier:", "état:"],
  en: ["member:", "doc:", "topic:", "meeting:", "decision:", "folder:", "state:"],
};

export interface ParsedQuery {
  kinds: SearchableKind[];
  folders: string[];
  states: string[];
  terms: string[];
}

/** Une facette inconnue n'est pas une erreur : le jeton redevient un terme ordinaire. */
export function parseQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = { kinds: [], folders: [], states: [], terms: [] };
  for (const token of normalizeForSearch(raw).split(/\s+/)) {
    if (!token) continue;
    const separator = token.indexOf(":");
    if (separator > 0) {
      const key = token.slice(0, separator);
      const value = token.slice(separator + 1);
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

/** Préfixe du libellé > début de mot > inclusion > champ secondaire seulement. */
function termQuality(term: string, label: string, extra: string): number {
  if (label.startsWith(term)) return 3;
  if (label.includes(` ${term}`) || label.includes(`'${term}`) || label.includes(`-${term}`)) return 2;
  if (label.includes(term)) return 1;
  if (extra.includes(term)) return 0.5;
  return 0;
}

/** Même dossier : 2 ; même sous-arbre (dans un sens ou l'autre) : 1 ; sinon 0. */
function proximity(context: string | undefined, folderPath: string | undefined): number {
  if (!context || !folderPath) return 0;
  const here = normalizeForSearch(context);
  const there = normalizeForSearch(folderPath);
  if (here === there) return 2;
  if (there.startsWith(`${here}/`) || here.startsWith(`${there}/`)) return 1;
  return 0;
}

export interface SearchOptions {
  /** Le dossier « d'où l'on cherche » : ce qui en est proche remonte en premier. */
  context?: string;
  limit?: number;
}

export interface SearchOutcome<T extends Searchable> {
  results: T[];
  /** Le nombre total de correspondances, avant la coupe — l'interface doit l'annoncer. */
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
