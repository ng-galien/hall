/* Groups ranked search hits along the folder tree, mirroring the workspace explorer: nested
   folder nodes in depth-first order, then one flat node per kind for entries that live outside
   the tree (members, meetings, decisions). */

export interface FolderSection<T> {
  key: string;
  /** Full folder path, or the kind for tree-less sections. */
  path: string;
  /** Last path segment, or the kind heading. */
  label: string;
  folder: boolean;
  items: T[];
  children: FolderSection<T>[];
}

interface TreeHit {
  kind: string;
  folderPath?: string;
}

function comparePaths(left: string, right: string): number {
  const a = left.split("/");
  const b = right.split("/");
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const step = a[index].localeCompare(b[index], "fr");
    if (step !== 0) return step;
  }
  return a.length - b.length;
}

export function folderSections<T extends TreeHit>(
  hits: readonly T[],
  kindLabel: (kind: T["kind"]) => string,
): FolderSection<T>[] {
  const byFolder = new Map<string, T[]>();
  const byKind = new Map<T["kind"], T[]>();
  for (const hit of hits) {
    if (hit.folderPath) {
      const bucket = byFolder.get(hit.folderPath) ?? [];
      bucket.push(hit);
      byFolder.set(hit.folderPath, bucket);
    } else {
      const bucket = byKind.get(hit.kind) ?? [];
      bucket.push(hit);
      byKind.set(hit.kind, bucket);
    }
  }

  const roots: FolderSection<T>[] = [];
  const nodes = new Map<string, FolderSection<T>>();
  const nodeFor = (path: string): FolderSection<T> => {
    const known = nodes.get(path);
    if (known) return known;
    const segments = path.split("/");
    const node: FolderSection<T> = {
      key: `folder:${path}`,
      path,
      label: segments[segments.length - 1],
      folder: true,
      items: [],
      children: [],
    };
    nodes.set(path, node);
    if (segments.length === 1) roots.push(node);
    else nodeFor(segments.slice(0, -1).join("/")).children.push(node);
    return node;
  };

  for (const path of [...byFolder.keys()].sort(comparePaths)) {
    nodeFor(path).items = byFolder.get(path) ?? [];
  }
  for (const [kind, items] of byKind) {
    roots.push({ key: `kind:${kind}`, path: kind, label: kindLabel(kind), folder: false, items, children: [] });
  }
  return roots;
}

/** The items of the tree in display order, for keyboard navigation over the rendered rows. */
export function sectionItems<T>(sections: FolderSection<T>[]): T[] {
  const out: T[] = [];
  const walk = (list: FolderSection<T>[]) => {
    for (const node of list) {
      out.push(...node.items);
      walk(node.children);
    }
  };
  walk(sections);
  return out;
}
