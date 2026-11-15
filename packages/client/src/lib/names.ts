const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/**
 * Order of two names everywhere Hall ranks by name: French comparison, accents and case ignored, numbers in their
 * natural order (« Point 2 » before « Point 10 »).
 * @implements-requirement HALL-FR-WSP-500
 */
export function compareNames(left: string, right: string): number {
  return collator.compare(left, right);
}

/** Order of two folder paths, segment by segment, each segment compared as a name. */
export function comparePaths(left: string, right: string): number {
  const a = left.split("/");
  const b = right.split("/");
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const step = compareNames(a[index] ?? "", b[index] ?? "");
    if (step !== 0) return step;
  }
  return a.length - b.length;
}

/** Items ordered by name; items whose names compare equal are ordered by identifier. */
export function sortByName<T>(items: Iterable<T>, name: (item: T) => string, id: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const byName = compareNames(name(left), name(right));
    if (byName !== 0) return byName;
    const leftId = id(left);
    const rightId = id(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}
