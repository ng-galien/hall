import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { acquireTestDatabaseLock, releaseTestDatabaseLock } from "./database-lock.mjs";

test("the shared test database lock rejects a live owner and recovers a dead one", () => {
  const directory = mkdtempSync(join(tmpdir(), "hall-test-lock-"));
  const path = join(directory, "database.lock");
  try {
    acquireTestDatabaseLock(path);
    assert.throws(() => acquireTestDatabaseLock(path), /already in use/);
    releaseTestDatabaseLock(path);

    writeFileSync(path, "99999999");
    acquireTestDatabaseLock(path);
    assert.equal(readFileSync(path, "utf8"), String(process.pid));
    releaseTestDatabaseLock(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
