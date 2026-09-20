import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const testDatabaseLockPath = join(tmpdir(), "hall-postgres-tests.lock");

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

export function acquireTestDatabaseLock(path = testDatabaseLockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(path, "wx");
      try {
        writeFileSync(descriptor, String(process.pid));
      } finally {
        closeSync(descriptor);
      }
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner;
      try {
        owner = Number(readFileSync(path, "utf8"));
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        throw readError;
      }
      if (!Number.isSafeInteger(owner) || owner <= 0 || isRunning(owner)) {
        throw new Error("The shared Hall test database is already in use by another test command");
      }
      try {
        unlinkSync(path);
      } catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      }
    }
  }
  throw new Error("Could not acquire the shared Hall test database lock");
}

export function releaseTestDatabaseLock(path = testDatabaseLockPath) {
  try {
    if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
