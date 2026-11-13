import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * The lock of the test database and its container, shared by e2e/run.mjs and the screen audit: a directory created
 * with mkdir (atomic) and removed at the end of the run. On macOS it is /private/tmp/hall-e2e.lock, the path also taken
 * by hand; elsewhere it lives in the temporary directory of the system.
 */
export const testDatabaseLockDirectory =
  process.platform === "darwin" ? "/private/tmp/hall-e2e.lock" : join(tmpdir(), "hall-e2e.lock");
