/** CLI for explicitly selecting a dataset and a meeting scenario. See docs/development.md. */

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { describeSeeds, selectSeed } from "./data/catalog.mjs";
import { createSeedApi } from "./data/common/api.mjs";
import { assertEmptyDatabase } from "./data/common/empty-database.mjs";
import { backdateMeetingConduct, demonstrationDatabaseUrl } from "./data/common/meeting-history.mjs";

export async function main(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      dataset: { type: "string" },
      scenario: { type: "string" },
      list: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help || values.list) {
    console.log("npm run seed:dev -w @hall/server -- --dataset alesia --scenario preparation\n");
    console.log(describeSeeds());
    console.log(
      "\nSEED_API : URL de l’API du serveur dédié vide. SEED_DATASET et SEED_MEETING_SCENARIO : sélection sans arguments.\nLes arguments explicites priment sur les variables d’environnement. Aucun appel API pour --list ou --help.",
    );
    return;
  }
  const datasetName = values.dataset ?? env.SEED_DATASET ?? "alesia";
  const scenarioName = values.scenario ?? env.SEED_MEETING_SCENARIO ?? "default";
  const { dataset, scenario } = selectSeed(datasetName, scenarioName);
  const baseUrl = new URL(env.SEED_API ?? "http://127.0.0.1:3100/api");
  if (!["http:", "https:"].includes(baseUrl.protocol)) throw new Error("SEED_API doit être une URL HTTP ou HTTPS");
  const api = createSeedApi(baseUrl.href.replace(/\/$/, ""));
  // The server dates conduct at reception; with SEED_DATABASE_URL the past meetings are then moved
  // to their historical dates in the demonstration or browser-test database (outside the API).
  if (env.SEED_DATABASE_URL) {
    const databaseUrl = demonstrationDatabaseUrl(env.SEED_DATABASE_URL).href;
    api.backdateMeeting = (meetingId, target, since) => backdateMeetingConduct(databaseUrl, meetingId, target, since);
  }
  console.log(`Jeu : ${datasetName} ; scénario : ${scenarioName}`);
  const password = env.SEED_DEMO_PASSWORD ?? "Hall-demo-2026!";
  if (await api.signInAsFirstAdministrator(dataset.administrator, password)) {
    console.log(
      `Serveur sans accès de développement : jeu semé sous le compte de ${dataset.administrator.displayName}`,
    );
  }
  await assertEmptyDatabase(api);
  const fixture = await dataset.run(api, { password });
  await scenario.run(api, fixture);
  console.log("Seed terminé.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
