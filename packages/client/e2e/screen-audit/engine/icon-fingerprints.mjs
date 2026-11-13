import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/*
 * Fingerprints of the Phosphor icons an application imports: the `d` attribute of the first path of every weight,
 * mapped to « Name:weight ». The page only shows an <svg>; this map tells which icon it is and whether it is drawn
 * filled, so that rules on chevrons, the « + » of creation and filled icons measure the screen and not the code.
 */

const weights = ["regular", "fill", "bold", "light", "thin", "duotone"];

/** Names imported from @phosphor-icons/react by the sources under `sourceDirectory`. */
function importedNames(sourceDirectory) {
  const names = new Set();
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(tsx?|mjs)$/.test(entry)) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(
          /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react["']/g,
        ))
          for (const part of match[1].split(","))
            names.add(
              part
                .trim()
                .split(/\s+as\s+/)[0]
                .replace(/^type\s+/, ""),
            );
        for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react["']/g))
          for (const part of match[1].split(",")) names.add(part.trim().split(/\s+as\s+/)[0]);
      }
    }
  };
  visit(sourceDirectory);
  names.delete("");
  return names;
}

/** `{ d: "Name:weight" }` for every weight of every Phosphor icon imported by the sources. */
export function iconFingerprints(sourceDirectory, resolveFrom = sourceDirectory) {
  const require = createRequire(join(resolveFrom, "noop.js"));
  const definitions = join(dirname(require.resolve("@phosphor-icons/react/package.json")), "dist/defs");
  const fingerprints = {};
  for (const name of importedNames(sourceDirectory)) {
    const file = join(definitions, `${name}.es.js`);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const weight of weights) {
      const block = source.split(`"${weight}",`)[1];
      const path = block?.match(/d:\s*"([^"]+)"/)?.[1];
      if (!path) continue;
      if (fingerprints[path] && weight !== "regular") continue;
      fingerprints[path] = `${name}:${weight}`;
    }
  }
  return fingerprints;
}
