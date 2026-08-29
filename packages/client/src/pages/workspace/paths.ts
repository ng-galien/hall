import type { CouncilBusiness, Resource } from "@hall/domain";

export interface PathNode {
  path: string;
  name: string;
  count: number;
  children: PathNode[];
}

/** Tous les chemins connus (segments intermédiaires inclus), triés. */
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

/** Arbre des chemins de classement, avec le nombre d'objets (businesses + ressources) par sous-arbre. */
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
      // Les dossiers les plus vivants d'abord ; à volume égal, alphabétique.
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "fr-FR"));
  return childrenOf("");
}
