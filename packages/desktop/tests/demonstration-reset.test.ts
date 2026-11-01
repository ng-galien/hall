import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaContractError } from "@hall/postgres";
import { isLocalSchemaFingerprintMismatch } from "@hall/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const seed = vi.hoisted(() => ({
  signIn: vi.fn().mockResolvedValue(true),
  empty: vi.fn().mockResolvedValue(undefined),
  dataset: vi.fn().mockResolvedValue({}),
  scenario: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../scripts/seed/data/catalog.mjs", () => ({
  selectSeed: () => ({
    dataset: { administrator: { email: "demo@example.invalid" }, run: seed.dataset },
    scenario: { run: seed.scenario },
  }),
}));
vi.mock("../../../scripts/seed/data/common/api.mjs", () => ({
  createSeedApi: () => ({ signInAsFirstAdministrator: seed.signIn }),
}));
vi.mock("../../../scripts/seed/data/common/empty-database.mjs", () => ({ assertEmptyDatabase: seed.empty }));

import { openDemonstration } from "../src/demonstration.js";

const roots: string[] = [];
const oldState = { status: "ready", version: "1.0.0", email: "demo@example.invalid", password: "fixture-only" };
const server = () => ({ url: "http://127.0.0.1:1", close: vi.fn().mockResolvedValue(undefined) });
async function profile(marked = true) {
  const root = await mkdtemp(join(tmpdir(), "hall-demo-reset-test-"));
  roots.push(root);
  await mkdir(join(root, "postgres"));
  await writeFile(join(root, "postgres", "old-data"), "fictional previous dataset");
  await writeFile(join(root, "unrelated"), "keep");
  if (marked) await writeFile(join(root, "demonstration.json"), JSON.stringify(oldState));
  return root;
}
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

// @verifies-requirement HALL-TR-DSK-010
it("recreates a recognized same-version demonstration after an exact fingerprint mismatch", async () => {
  const root = await profile();
  const handle = server();
  const mismatch = new SchemaContractError("schema differs", "f".repeat(64), "0".repeat(64));
  expect(isLocalSchemaFingerprintMismatch(mismatch)).toBe(true);
  const start = vi.fn().mockRejectedValueOnce(mismatch).mockResolvedValueOnce(handle);
  const onPlan = vi.fn();
  const opened = await openDemonstration({
    userDataPath: root,
    applicationVersion: "1.0.0",
    startServer: start,
    onPlan,
  });
  expect(opened.server).toBe(handle);
  expect(start).toHaveBeenCalledTimes(2);
  expect(onPlan.mock.calls).toEqual([[false], [true]]);
  await expect(access(join(root, "postgres", "old-data"))).rejects.toThrow();
  expect(await readFile(join(root, "unrelated"), "utf8")).toBe("keep");
  expect(seed.scenario).toHaveBeenCalledTimes(1);
  const state = JSON.parse(await readFile(join(root, "demonstration.json"), "utf8"));
  expect(state.status).toBe("ready");
  expect(state.version).toBe("1.0.0");
  expect(state.password).not.toBe(oldState.password);
});

// @verifies-requirement HALL-TR-DSK-010
it("reuses a compatible demonstration without loading its data again", async () => {
  const root = await profile();
  const start = vi.fn().mockResolvedValue(server());
  await openDemonstration({ userDataPath: root, applicationVersion: "1.0.0", startServer: start });
  expect(start).toHaveBeenCalledTimes(1);
  expect(seed.scenario).not.toHaveBeenCalled();
  expect(await readFile(join(root, "postgres", "old-data"), "utf8")).toBe("fictional previous dataset");
  expect(JSON.parse(await readFile(join(root, "demonstration.json"), "utf8"))).toEqual(oldState);
});

// @verifies-requirement HALL-TR-DSK-010
it.each([
  new Error("ECONNREFUSED"),
  new Error("PostgreSQL schema fingerprint differs from the exact Hall manifest; run the Hall schema upgrade"),
  new SchemaContractError("No schema contract", "f".repeat(64)),
  new SchemaContractError("Unknown failure", "f".repeat(64), "f".repeat(64)),
])("does not erase a demonstration for an unrelated or unidentified failure: %s", async (error) => {
  const root = await profile();
  expect(isLocalSchemaFingerprintMismatch(error)).toBe(false);
  const start = vi.fn().mockRejectedValue(error);
  await expect(openDemonstration({ userDataPath: root, applicationVersion: "1.0.0", startServer: start })).rejects.toBe(
    error,
  );
  expect(start).toHaveBeenCalledTimes(1);
  expect(seed.scenario).not.toHaveBeenCalled();
  expect(await readFile(join(root, "postgres", "old-data"), "utf8")).toBe("fictional previous dataset");
  expect(JSON.parse(await readFile(join(root, "demonstration.json"), "utf8"))).toEqual(oldState);
});

// @verifies-requirement HALL-TR-DSK-010
it("refuses to erase an unmarked local or municipal database", async () => {
  const root = await profile(false);
  const start = vi.fn().mockResolvedValue(server());
  await expect(
    openDemonstration({ userDataPath: root, applicationVersion: "1.0.0", startServer: start }),
  ).rejects.toThrow("n’est pas une démonstration");
  expect(start).not.toHaveBeenCalled();
  expect(await readFile(join(root, "postgres", "old-data"), "utf8")).toBe("fictional previous dataset");
});
