import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineBallotPersistenceContract } from "./support/ballotPersistenceContract.js";

defineBallotPersistenceContract("SQLite ballot persistence contract", () => ({
  kind: "sqlite",
  path: join(mkdtempSync(join(tmpdir(), "hall-sqlite-ballot-contract-")), "hall.sqlite"),
}));
