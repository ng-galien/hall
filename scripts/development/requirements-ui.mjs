import { createServer } from "node:http";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  requirementsRegistrySchema,
  resolveRequirementTheme,
  validateRequirements,
} from "../verification/check-requirements.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), "../..");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export async function readRequirementsView(root = defaultRoot) {
  const catalogPath = resolve(root, "requirements/catalog.json");
  const catalog = requirementsRegistrySchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
  const validation = validateRequirements(root, catalog);
  const evidence = new Map(validation.evidence.map(item => [item.id, item]));
  const requirements = Object.entries(catalog.requirements).map(([id, requirement]) => ({
    id,
    ...requirement,
    theme: resolveRequirementTheme(catalog, id),
    evidence: evidence.get(id),
  }));
  return {
    schemaVersion: catalog.schemaVersion,
    themes: catalog.taxonomy.themes,
    requirements,
    summary: {
      requirements: validation.requirements,
      implemented: validation.implementations,
      verified: validation.verifications,
      tracked: validation.tracked,
      errors: validation.errors,
      unproven: validation.unproven,
    },
  };
}

export async function updateRequirementTheme(root, id, theme) {
  const catalogPath = resolve(root, "requirements/catalog.json");
  const catalog = requirementsRegistrySchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
  if (!catalog.requirements[id]) throw new Error(`Exigence inconnue : ${id}`);
  if (!catalog.taxonomy.themes[theme]) throw new Error(`Thème inconnu : ${theme}`);
  const prefixTheme = catalog.taxonomy.prefixThemes[id.match(/^HALL-(?:FR|TR)-([A-Z]+)-/)?.[1]];
  if (theme === prefixTheme) delete catalog.taxonomy.requirementThemes[id];
  else catalog.taxonomy.requirementThemes[id] = theme;
  requirementsRegistrySchema.parse(catalog);
  const temporaryPath = `${catalogPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await rename(temporaryPath, catalogPath);
  return { id, theme, overridden: theme !== prefixTheme };
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Requête trop volumineuse");
  }
  return JSON.parse(body || "{}");
}

export function createRequirementsServer(root = defaultRoot) {
  const appRoot = resolve(root, "requirements/app");
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/catalog") {
        return json(response, 200, await readRequirementsView(root));
      }
      const themeRoute = url.pathname.match(/^\/api\/requirements\/(HALL-(?:FR|TR)-[A-Z]+-\d{3})\/theme$/);
      if (request.method === "PATCH" && themeRoute) {
        const body = await readJson(request);
        return json(response, 200, await updateRequirementTheme(root, themeRoute[1], body.theme));
      }
      if (request.method !== "GET") return json(response, 405, { error: "Méthode non autorisée" });
      const relativeAsset = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!["index.html", "app.js", "styles.css"].includes(relativeAsset)) return json(response, 404, { error: "Introuvable" });
      const content = await readFile(resolve(appRoot, relativeAsset));
      response.writeHead(200, { "content-type": contentTypes[extname(relativeAsset)] ?? "application/octet-stream" });
      response.end(content);
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const port = Number(process.env.HALL_REQUIREMENTS_PORT ?? 4317);
  createRequirementsServer().listen(port, "127.0.0.1", () => {
    console.log(`Catalogue des exigences : http://localhost:${port}/`);
  });
}
