import type { ResourceSummary } from "@hall/api-contract";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { PathNode } from "../workspace/paths";

export type MapSummary = Extract<ResourceSummary, { kind: "geographic" }>;

export interface MapsTreeNode {
  path: string;
  name: string;
  business: CouncilBusinessView | null;
  children: MapsTreeNode[];
  maps: MapSummary[];
  mapCount: number;
}

export interface MapsBusinessGroup {
  business: CouncilBusinessView;
  maps: MapSummary[];
}

const RECENT_MAPS_KEY = "hall.maps.recent";
export const RECENT_MAPS_LIMIT = 5;

function byName(left: MapSummary, right: MapSummary): number {
  return left.name.localeCompare(right.name, "fr-FR");
}

/**
 * Workspace path tree reduced to the branches that hold at least one map, each node carrying its own maps.
 * @implements-requirement HALL-FR-WSP-320
 */
export function mapsTree(tree: readonly PathNode[], maps: readonly MapSummary[]): MapsTreeNode[] {
  const mapsByPath = new Map<string, MapSummary[]>();
  for (const map of maps) mapsByPath.set(map.path, [...(mapsByPath.get(map.path) ?? []), map]);
  const reduce = (nodes: readonly PathNode[]): MapsTreeNode[] =>
    nodes.flatMap((node) => {
      const children = reduce(node.children);
      const own = [...(mapsByPath.get(node.path) ?? [])].sort(byName);
      const mapCount = own.length + children.reduce((total, child) => total + child.mapCount, 0);
      if (mapCount === 0) return [];
      return [{ path: node.path, name: node.name, business: node.business, children, maps: own, mapCount }];
    });
  return reduce(tree);
}

/** Maps filed at the workspace root, outside every folder. */
export function rootMaps(maps: readonly MapSummary[]): MapSummary[] {
  return maps.filter((map) => map.path === "").sort(byName);
}

/** Businesses that have at least one associated map; a map associated to several businesses appears under each. */
export function mapsByBusiness(
  businesses: readonly CouncilBusinessView[],
  maps: readonly MapSummary[],
): MapsBusinessGroup[] {
  const mapsById = new Map(maps.map((map) => [map.id, map]));
  return businesses
    .map((business) => ({
      business,
      maps: business.resources
        .map((resource) => mapsById.get(resource.id))
        .filter((map): map is MapSummary => map !== undefined),
    }))
    .filter((group) => group.maps.length > 0)
    .sort((left, right) => left.business.title.localeCompare(right.business.title, "fr-FR"));
}

/** Folder path segments with the workspace path each segment opens. */
export function mapPathSegments(path: string): { name: string; path: string }[] {
  const segments = path.split("/").filter(Boolean);
  return segments.map((name, index) => ({ name, path: segments.slice(0, index + 1).join("/") }));
}

export function readRecentMapIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(RECENT_MAPS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string").slice(0, RECENT_MAPS_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentMap(id: string): string[] {
  const next = [id, ...readRecentMapIds().filter((entry) => entry !== id)].slice(0, RECENT_MAPS_LIMIT);
  try {
    window.localStorage.setItem(RECENT_MAPS_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}
