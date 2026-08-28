import { unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(scriptDirectory, "../data/hall.sqlite");
const databaseFiles = [databasePath, `${databasePath}-shm`, `${databasePath}-wal`];

for (const path of databaseFiles) {
  try {
    await unlink(path);
    console.log(`Supprimé : ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log("Base de démonstration réinitialisée.");
