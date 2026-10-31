import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HttpServerHandle } from "@hall/server";
import { selectSeed } from "../../../scripts/seed/data/catalog.mjs";
import { createSeedApi } from "../../../scripts/seed/data/common/api.mjs";
import { assertEmptyDatabase } from "../../../scripts/seed/data/common/empty-database.mjs";

export const desktopEditions = ["local", "demonstration"] as const;
export type DesktopEdition = (typeof desktopEditions)[number];

const demonstrationDataset = "alesia";
const demonstrationScenario = "default";

type DemonstrationState = {
  status: "seeding" | "ready";
  version: string;
  email: string;
  password: string;
};

export type SessionCookie = { name: string; value: string };

export type DemonstrationProfile = {
  userDataPath: string;
  applicationVersion: string;
  startServer: () => Promise<HttpServerHandle>;
};

function parseEdition(value: unknown, source: string): DesktopEdition {
  if (typeof value === "string" && (desktopEditions as readonly string[]).includes(value)) {
    return value as DesktopEdition;
  }
  throw new Error(`Édition Hall inconnue dans ${source} : ${String(value)}`);
}

/** Reads the edition from HALL_DESKTOP_EDITION, then from edition.json written into the packaged application. */
export async function resolveDesktopEdition(applicationPath: string): Promise<DesktopEdition> {
  if (process.env.HALL_DESKTOP_EDITION) return parseEdition(process.env.HALL_DESKTOP_EDITION, "HALL_DESKTOP_EDITION");
  const editionPath = join(applicationPath, "edition.json");
  try {
    const content: unknown = JSON.parse(await readFile(editionPath, "utf8"));
    const edition = content && typeof content === "object" && "edition" in content ? content.edition : undefined;
    return parseEdition(edition, editionPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return "local";
    throw error;
  }
}

function statePath(userDataPath: string): string {
  return join(userDataPath, "demonstration.json");
}

function databasePath(userDataPath: string): string {
  return join(userDataPath, "postgres");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function readState(userDataPath: string): Promise<DemonstrationState | null> {
  let content: unknown;
  try {
    content = JSON.parse(await readFile(statePath(userDataPath), "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  if (
    !content ||
    typeof content !== "object" ||
    !("status" in content) ||
    (content.status !== "seeding" && content.status !== "ready") ||
    !("version" in content) ||
    typeof content.version !== "string" ||
    !("email" in content) ||
    typeof content.email !== "string" ||
    !("password" in content) ||
    typeof content.password !== "string"
  ) {
    throw new Error(`L’état de la démonstration est invalide : ${statePath(userDataPath)}`);
  }
  return { status: content.status, version: content.version, email: content.email, password: content.password };
}

async function writeState(userDataPath: string, state: DemonstrationState): Promise<void> {
  await mkdir(userDataPath, { recursive: true });
  await writeFile(statePath(userDataPath), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

/** Deletes the demonstration database and state; refuses a profile whose database is not a demonstration. */
export async function eraseDemonstration(userDataPath: string): Promise<void> {
  if (!(await exists(statePath(userDataPath)))) {
    if (await exists(databasePath(userDataPath))) {
      throw new Error(
        `Ce profil contient une base Hall qui n’est pas une démonstration ; elle n’est pas effacée : ${databasePath(userDataPath)}`,
      );
    }
    return;
  }
  await rm(databasePath(userDataPath), { recursive: true, force: true });
  await rm(statePath(userDataPath), { force: true });
}

/** Loads the dataset through the public API, as the seed command line does, as the first administrator. */
async function seed(server: HttpServerHandle, state: DemonstrationState): Promise<void> {
  const { dataset, scenario } = selectSeed(demonstrationDataset, demonstrationScenario);
  const api = createSeedApi(new URL("/api", server.url).href);
  if (!(await api.signInAsFirstAdministrator(dataset.administrator, state.password))) {
    throw new Error("Le serveur embarqué de la démonstration n’attend pas de premier administrateur.");
  }
  await assertEmptyDatabase(api);
  await scenario.run(api, await dataset.run(api, { password: state.password }));
}

/**
 * Starts the embedded server on a demonstration profile. An empty profile, an interrupted load or a
 * profile from another application version is erased and loaded again with the Alésia dataset.
 */
export async function openDemonstration(profile: DemonstrationProfile): Promise<{
  server: HttpServerHandle;
  state: DemonstrationState;
}> {
  const { userDataPath, applicationVersion } = profile;
  const current = await readState(userDataPath);
  if (current?.status === "ready" && current.version === applicationVersion) {
    return { server: await profile.startServer(), state: current };
  }
  await eraseDemonstration(userDataPath);
  const state: DemonstrationState = {
    status: "seeding",
    version: applicationVersion,
    email: selectSeed(demonstrationDataset, demonstrationScenario).dataset.administrator.email,
    password: randomBytes(24).toString("base64url"),
  };
  await writeState(userDataPath, state);
  const server = await profile.startServer();
  try {
    await seed(server, state);
  } catch (error) {
    await server.close();
    throw error;
  }
  const ready: DemonstrationState = { ...state, status: "ready" };
  await writeState(userDataPath, ready);
  return { server, state: ready };
}

/** Opens a session of the demonstration administrator through the public login endpoint. */
export async function signInToDemonstration(
  server: HttpServerHandle,
  state: DemonstrationState,
): Promise<SessionCookie> {
  const response = await fetch(new URL("/api/auth/login", server.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: state.email, password: state.password }),
  });
  if (!response.ok) {
    throw new Error(`La connexion à la démonstration a échoué : ${response.status} ${await response.text()}`);
  }
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  const separator = cookie?.indexOf("=") ?? -1;
  if (!cookie || separator <= 0) throw new Error("La connexion à la démonstration n’a pas ouvert de session.");
  return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
}
