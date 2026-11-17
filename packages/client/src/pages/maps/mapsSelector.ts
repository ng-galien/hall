import type { ResourceSummary } from "@hall/api-contract";
import { compareNames } from "../../lib/names";
import { normalizeForSearch } from "../../lib/search";
import type { CouncilBusinessView } from "../../models/councilBusiness";

export type MapSummary = Extract<ResourceSummary, { kind: "geographic" }>;

/** A map of the list of maps with the businesses it is associated with. */
export interface MapEntry {
  map: MapSummary;
  businesses: CouncilBusinessView[];
}

/**
 * Every map in alphabetical order of its name, each with its associated businesses in alphabetical order of their title.
 * @implements-requirement HALL-FR-WSP-320
 */
export function mapEntries(maps: readonly MapSummary[], businesses: readonly CouncilBusinessView[]): MapEntry[] {
  return [...maps]
    .sort((left, right) => compareNames(left.name, right.name))
    .map((map) => ({
      map,
      businesses: businesses
        .filter((business) => business.resources.some((resource) => resource.id === map.id))
        .sort((left, right) => compareNames(left.title, right.title)),
    }));
}

/**
 * Maps whose name, folder path or business title contains the query, ignoring accents and case.
 * @implements-requirement HALL-FR-WSP-320
 */
export function matchingMapEntries(entries: readonly MapEntry[], query: string): MapEntry[] {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return [...entries];
  return entries.filter(({ map, businesses }) =>
    [map.name, map.path, ...businesses.map((business) => business.title)].some((field) =>
      normalizeForSearch(field).includes(needle),
    ),
  );
}

/** Folder path segments with the workspace path each segment opens. */
export function mapPathSegments(path: string): { name: string; path: string }[] {
  const segments = path.split("/").filter(Boolean);
  return segments.map((name, index) => ({ name, path: segments.slice(0, index + 1).join("/") }));
}
