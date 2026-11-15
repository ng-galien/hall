import { cp, readdir, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

/**
 * The bundled seed modules read their files with `new URL("./files/…", import.meta.url)`, which resolves next to
 * the bundle. Copies the `files` directory of every dataset into `dist/files`; two datasets may not ship the same path.
 */
const desktopRoot = resolve(import.meta.dirname, "..");
const datasetsRoot = resolve(desktopRoot, "..", "..", "scripts", "seed", "data", "datasets");
const outputDirectory = join(desktopRoot, "dist", "files");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

await rm(outputDirectory, { recursive: true, force: true });
const owners = new Map();
for (const dataset of await readdir(datasetsRoot)) {
  const source = join(datasetsRoot, dataset, "files");
  try {
    if (!(await stat(source)).isDirectory()) continue;
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  for (const file of await listFiles(source)) {
    if (owners.has(file)) throw new Error(`Datasets ${owners.get(file)} and ${dataset} both ship files/${file}`);
    owners.set(file, dataset);
  }
  await cp(source, outputDirectory, { recursive: true });
}
