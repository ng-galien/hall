import type { ResourceCatalogEntry } from "@hall/api-contract";
import type { Resource } from "@hall/domain";
import type { CouncilBusinessView } from "../../models/councilBusiness";

export type PathBusiness = Pick<CouncilBusinessView, "id" | "folderResourceId" | "folderPath" | "title">;

export interface PathNode<TBusiness extends PathBusiness = CouncilBusinessView> {
  path: string;
  name: string;
  children: PathNode<TBusiness>[];
  business: TBusiness | null;
}

/** All known paths, intermediate segments included, sorted. */
export function listAllPaths(
  businesses: CouncilBusinessView[],
  resources: Resource[],
  persistedPaths: string[] = [],
): string[] {
  const known = new Set<string>();
  for (const folderPath of [
    ...persistedPaths,
    ...businesses.map((business) => business.folderPath),
    ...resources.map((resource) => resource.folderPath),
  ]) {
    const segments = folderPath.split("/").filter(Boolean);
    segments.forEach((_segment, index) => {
      known.add(segments.slice(0, index + 1).join("/"));
    });
  }
  return [...known].sort((left, right) => left.localeCompare(right, "fr-FR"));
}

export function isUnderPath(folderPath: string, path: string): boolean {
  if (path === "") return true;
  return folderPath === path || folderPath.startsWith(`${path}/`);
}

/** Documentary filing paths advertised by the lightweight canonical catalogue. */
export function listCatalogPaths(catalog: ResourceCatalogEntry[]): string[] {
  const known = new Set<string>();
  for (const entry of catalog) {
    const folderPath = entry.kind === "folder" ? entry.fullPath : entry.path;
    const segments = folderPath.split("/").filter(Boolean);
    segments.forEach((_segment, index) => {
      known.add(segments.slice(0, index + 1).join("/"));
    });
  }
  return [...known].sort((left, right) => left.localeCompare(right, "fr-FR"));
}

/** Path tree preserving the business identity of its documentary folder.
 * @implements-requirement HALL-FR-WSP-240
 */
export function buildPathTree<TBusiness extends PathBusiness>(
  businesses: TBusiness[],
  catalog: ResourceCatalogEntry[],
  additionalPaths: string[] = [],
): PathNode<TBusiness>[] {
  const businessesByFolderId = new Map(businesses.map((business) => [business.folderResourceId, business]));
  const businessesByPath = new Map(
    catalog
      .filter((entry) => entry.kind === "folder")
      .map((entry) => [entry.fullPath, businessesByFolderId.get(entry.id)]),
  );
  const knownPaths = new Set(listCatalogPaths(catalog));
  for (const folderPath of [...additionalPaths, ...businesses.map((business) => business.folderPath)]) {
    const segments = folderPath.split("/").filter(Boolean);
    segments.forEach((_segment, index) => {
      knownPaths.add(segments.slice(0, index + 1).join("/"));
    });
  }
  const childrenOf = (parent: string): PathNode<TBusiness>[] =>
    [...knownPaths]
      .filter((path) => {
        if (!path || path === parent) return false;
        if (parent === "") return !path.includes("/");
        return path.startsWith(`${parent}/`) && !path.slice(parent.length + 1).includes("/");
      })
      .map((path) => ({
        path,
        name: businessesByPath.get(path)?.title ?? path.split("/").at(-1) ?? path,
        business: businessesByPath.get(path) ?? null,
        children: childrenOf(path),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "fr-FR"));
  return childrenOf("");
}
