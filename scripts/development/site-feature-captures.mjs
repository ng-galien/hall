/**
 * Captures of the Hall screens shown in the « Fonctionnalités » section of the public site
 * (site/public/captures/<name>-clair.png and <name>-sombre.png), on the Foncine-le-Bas dataset.
 * Each scenario is loaded into its own disposable database of the browser-test cluster
 * (127.0.0.1:54330), served by a Hall server on a free loopback port, then dropped.
 *
 *   node scripts/development/site-feature-captures.mjs
 *
 * Requires the test PostgreSQL cluster and the built server and client (npm run build:verified).
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import pg from "pg";

const project = resolve(import.meta.dirname, "../..");
const output = join(project, "site/public/captures");
const keep = process.argv.includes("--keep");
const password = process.env.SEED_DEMO_PASSWORD ?? "Hall-demo-2026!";
const account = "maire@foncine-le-bas.example";
const themes = [
  ["light", "clair"],
  ["dark", "sombre"],
];

function loadOwnerEnvironment() {
  const file = join(process.env.HOME ?? "", ".hall/environment");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
}

function freePort() {
  return new Promise((accept, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => accept(port));
    });
  });
}

const maintenance = new pg.Pool({
  connectionString: "postgresql://hall_test:hall-test-only@127.0.0.1:54330/postgres",
  max: 1,
});

async function recreate(name) {
  await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await maintenance.query(`CREATE DATABASE "${name}" OWNER hall_test`);
}

async function serve(scenario, database) {
  const url = `postgresql://hall_test:hall-test-only@127.0.0.1:54330/${database}`;
  await recreate(database);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const { startHttpServer } = await import("@hall/server");
  const { configFromEnvironment } = await import(join(project, "packages/server/dist/core/config.js"));
  const server = await startHttpServer({
    ...configFromEnvironment(),
    host: "127.0.0.1",
    port,
    database: { kind: "postgres", url },
    clientDirectory: join(project, "packages/client/dist"),
    devAutoLogin: false,
    environment: "test",
    allowedOrigins: [origin],
  });
  const { main } = await import(join(project, "scripts/seed/seed-dev.mjs"));
  await main(["--dataset", "foncine-le-bas", "--scenario", scenario], {
    ...process.env,
    SEED_API: `${origin}/api`,
    SEED_DATABASE_URL: url,
    SEED_DEMO_PASSWORD: password,
  });
  return { origin, server, database };
}

async function close({ server, database }) {
  await server.close();
  if (!keep) await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
}

async function entities(page, path) {
  const body = await page.evaluate(async (target) => (await fetch(target)).json(), `/api${path}`);
  return (body.entities ?? []).map((entity) => entity.properties);
}

const find = (list, pattern) => list.find((item) => pattern.test(JSON.stringify(item)));

/** Opens each screen in both themes of Hall and writes its two images. */
async function shoot(browser, origin, screens) {
  for (const [colorScheme, suffix] of themes) {
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1200, height: 750 },
      colorScheme,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
    });
    const page = await context.newPage();
    await page.goto("/app/");
    const login = await page.evaluate(
      async ([email, secret]) =>
        (
          await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: secret }),
          })
        ).status,
      [account, password],
    );
    if (login >= 300) throw new Error(`Sign-in refused (${login})`);
    for (const screen of screens) {
      const route = await screen.route(page);
      await page.goto(`/app${route}`);
      await page.waitForLoadState("networkidle");
      if (screen.settle) await screen.settle(page);
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: join(output, `${screen.name}-${suffix}.png`),
        animations: "disabled",
        caret: "hide",
      });
      console.log(`${screen.name}-${suffix}.png  ${route}`);
    }
    await context.close();
  }
}

loadOwnerEnvironment();
process.env.LOG_LEVEL ??= "warn";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--lang=fr-FR"] });
try {
  const session = await serve("foncine-le-bas-session", "hall_e2e_site_captures_session");
  try {
    await shoot(browser, session.origin, [
      {
        name: "affaires",
        route: async (page) => {
          for (const business of await entities(page, "/council-business")) {
            const folder = await page.evaluate(
              async (target) => (await (await fetch(target)).json()).properties,
              `/api/resources/${business.folderResourceId}`,
            );
            if (/Mont Noir/.test(folder.name)) return `/workspace?councilBusiness=${business.id}`;
          }
          throw new Error("No business of the Mont Noir road");
        },
      },
      { name: "espace-de-travail", route: async () => "/workspace" },
      {
        name: "cartes",
        route: async (page) => {
          const maps = (await entities(page, "/resources")).filter((resource) => resource.kind === "geographic");
          return `/maps/${(find(maps, /chemin/i) ?? maps[0]).id}`;
        },
        settle: (page) => page.waitForTimeout(3000),
      },
      {
        name: "seance",
        route: async (page) => {
          const meeting = (await entities(page, "/council-meetings")).find((item) => item.startedAt && !item.closedAt);
          return `/meetings/${meeting.id}/live`;
        },
      },
      {
        name: "deliberation",
        route: async (page) => {
          const drafts = (await entities(page, "/council-decisions")).filter((item) => item.state === "draft");
          return `/council-decisions/${(find(drafts, /Éclairage public/) ?? drafts[0]).id}`;
        },
      },
    ]);
  } finally {
    await close(session);
  }
  const preparation = await serve("foncine-le-bas-preparation", "hall_e2e_site_captures_preparation");
  try {
    await shoot(browser, preparation.origin, [
      {
        name: "preparation",
        route: async (page) => {
          const meeting = (await entities(page, "/council-meetings")).find((item) => !item.startedAt && !item.closedAt);
          return `/meetings/${meeting.id}`;
        },
      },
    ]);
  } finally {
    await close(preparation);
  }
} finally {
  await browser.close();
  await maintenance.end();
}
