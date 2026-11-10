import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { captureScreen, defaultCollectOptions, settle } from "./capture.mjs";
import { runAudit } from "./cli.mjs";

/*
 * Audits a report written by this engine with the engine itself: its summary page and three screen pages, at a tablet
 * and a desktop format, with the default rules. Usage: node self-audit.mjs <report directory> [<output directory>].
 */

const [reportArgument, outputArgument] = process.argv.slice(2);
if (!reportArgument) throw new Error("Usage: node self-audit.mjs <report directory> [<output directory>]");
const reportDirectory = resolve(reportArgument);
const pages = existsSync(join(reportDirectory, "pages")) ? readdirSync(join(reportDirectory, "pages")).sort() : [];
const pick = (pattern) => pages.find((page) => pattern.test(page));
const screens = [
  { id: "recapitulatif", title: "Récapitulatif", path: "index.html" },
  ...[
    ["page-telephone", "Page d'un écran sur téléphone", /^telephone--/],
    ["page-tablette", "Page d'un écran sur tablette", /^tablette--/],
    ["page-ordinateur", "Page d'un écran sur ordinateur", /^ordinateur--/],
  ]
    .map(([id, title, pattern]) => ({ id, title, path: pick(pattern) && `pages/${pick(pattern)}` }))
    .filter((screen) => screen.path),
];

const formats = [
  { id: "tablette", label: "Tablette", width: 768, height: 1024, touch: true },
  { id: "ordinateur", label: "Ordinateur", width: 1440, height: 900, touch: false },
];

await runAudit(
  {
    name: "Relevé (rapport)",
    formats,
    collect: defaultCollectOptions,
    rules: { "text-size": { params: { minimum: { tablette: 14, ordinateur: 13 } } } },
    screenOrder: screens.map((screen) => screen.id),
    outputDirectory: resolve(outputArgument ?? `${reportDirectory}-self-audit`),
    baselineFile: resolve(outputArgument ?? `${reportDirectory}-self-audit`, "baseline.json"),
    async capture({ outputDirectory }) {
      const browser = await chromium.launch();
      try {
        for (const format of formats) {
          const context = await browser.newContext({
            viewport: { width: format.width, height: format.height },
            hasTouch: format.touch,
            isMobile: format.touch,
            locale: "fr-FR",
          });
          const page = await context.newPage();
          for (const screen of screens) {
            await page.goto(pathToFileURL(join(reportDirectory, screen.path)).href);
            await settle(page);
            await captureScreen(page, { screen, format, outputDirectory, collect: defaultCollectOptions });
          }
          await context.close();
        }
      } finally {
        await browser.close();
      }
    },
  },
  process.argv.slice(4),
);
