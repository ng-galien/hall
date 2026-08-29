import type { CouncilBusiness, Resource } from "@hall/domain";

export interface PathNode {
  path: string;
  name: string;
  count: number;
  children: PathNode[];
}

/** All known paths, intermediate segments included, sorted. */
export function listAllPaths(
  businesses: CouncilBusiness[],
  resources: Resource[],
  extraPaths: string[] = [],
): string[] {
  const known = new Set<string>();
  for (const folderPath of [
    ...businesses.map((business) => business.folderPath),
    ...resources.map((resource) => resource.folderPath),
    ...extraPaths,
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

/** Path tree with the object count (businesses + resources) per subtree. */
export function buildPathTree(
  businesses: CouncilBusiness[],
  resources: Resource[],
  extraPaths: string[] = [],
): PathNode[] {
  const folderPaths = [
    ...businesses.map((business) => business.folderPath),
    ...resources.map((resource) => resource.folderPath),
  ];
  const knownPaths = new Set<string>();
  for (const folderPath of [...folderPaths, ...extraPaths]) {
    const segments = folderPath.split("/").filter(Boolean);
    segments.forEach((_segment, index) => {
      knownPaths.add(segments.slice(0, index + 1).join("/"));
    });
  }
  const countFor = (path: string) => folderPaths.filter((folderPath) => isUnderPath(folderPath, path)).length;
  const childrenOf = (parent: string): PathNode[] =>
    [...knownPaths]
      .filter((path) => {
        if (parent === "") return !path.includes("/");
        return path.startsWith(`${parent}/`) && !path.slice(parent.length + 1).includes("/");
      })
      .map((path) => ({
        path,
        name: path.split("/").at(-1) ?? path,
        count: countFor(path),
        children: childrenOf(path),
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "fr-FR"));
  return childrenOf("");
}
