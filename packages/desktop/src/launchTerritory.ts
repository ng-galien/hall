import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Commune montrée par l'écran de lancement et manière de la nommer. */
export interface LaunchTarget {
  communeCode: string;
  departementCode: string;
  presentation: "alesia" | "official";
}

/** Site d'Alésia du Jura (Chaux-des-Crotenay), montré sans code INSEE enregistré connu. */
export const alesiaTarget: LaunchTarget = { communeCode: "39129", departementCode: "39", presentation: "alesia" };

const memoryFile = "launch-territory.json";

/** Département métropolitain d'un code INSEE de commune, ou null pour un code d'outre-mer ou mal formé. */
export function departementOfCommune(code: string): string | null {
  const match = /^(2A|2B|\d{2})\d{3}$/.exec(code);
  if (!match || match[1] === "97" || match[1] === "98") return null;
  return match[1];
}

/** Code mémorisé s'il désigne une commune des géométries embarquées, sinon le site d'Alésia. */
export async function resolveLaunchTarget(
  storedCode: string | null,
  communeExists: (departementCode: string, communeCode: string) => Promise<boolean>,
): Promise<LaunchTarget> {
  const departementCode = storedCode ? departementOfCommune(storedCode) : null;
  if (!storedCode || !departementCode) return alesiaTarget;
  if (!(await communeExists(departementCode, storedCode))) return alesiaTarget;
  return { communeCode: storedCode, departementCode, presentation: "official" };
}

export async function readStoredInseeCode(userDataPath: string): Promise<string | null> {
  try {
    const content: unknown = JSON.parse(await readFile(join(userDataPath, memoryFile), "utf8"));
    if (content && typeof content === "object" && "inseeCode" in content && typeof content.inseeCode === "string") {
      return content.inseeCode;
    }
    return null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeStoredInseeCode(userDataPath: string, inseeCode: string | null): Promise<void> {
  await mkdir(userDataPath, { recursive: true });
  await writeFile(
    join(userDataPath, memoryFile),
    `${JSON.stringify({ inseeCode, readAt: new Date().toISOString() })}\n`,
  );
}

/** Code INSEE d'une réponse de GET /api/settings, en JSON simple ou en représentation Siren. */
export function inseeCodeOfSettings(body: unknown): string | null | undefined {
  if (!body || typeof body !== "object") return undefined;
  const properties =
    "properties" in body && body.properties && typeof body.properties === "object" ? body.properties : body;
  if (!("inseeCode" in properties)) return undefined;
  const { inseeCode } = properties;
  if (inseeCode === null) return null;
  return typeof inseeCode === "string" ? inseeCode : undefined;
}
