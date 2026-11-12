import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test } from "../../fixtures/application";
import { ready, screens } from "./screens.mjs";

/*
 * Captures of every screen for a before-and-after board: each screen of screens.mjs, opened on the seeded disposable
 * database, photographed at 1280 px under a mouse and, for the phone screens, at 375 px under a finger. Used by
 * avant-apres.mjs on the client of two commits; nothing is measured.
 */

type Screen = (typeof screens)[number];

const outputDirectory = process.env.HALL_SCREEN_AUDIT_OUTPUT ?? "";
const onlyScreens = process.env.HALL_SCREEN_AUDIT_SCREENS?.split(",");
const formats = [
  {
    id: "ordinateur",
    width: 1280,
    height: 900,
    touch: false,
    exists: (screen: Screen) => screen.formats.includes("ordinateur") || screen.formats.includes("tablette"),
  },
  {
    id: "800",
    width: 800,
    height: 900,
    touch: false,
    exists: (screen: Screen) => ["seance-en-cours", "mode-seance", "mode-seance-vote"].includes(screen.id),
  },
  {
    id: "telephone",
    width: 375,
    height: 812,
    touch: true,
    exists: (screen: Screen) => screen.formats.includes("telephone"),
  },
];

if (process.env.HALL_SCREEN_AUDIT_MODE === "capture") {
  if (!outputDirectory) throw new Error("HALL_SCREEN_AUDIT_OUTPUT names the capture directory");
  for (const format of formats) {
    for (const scenario of ["minutes", "default"] as const) {
      const selected = screens.filter(
        (screen: Screen) =>
          screen.scenario === scenario && format.exists(screen) && (!onlyScreens || onlyScreens.includes(screen.id)),
      );
      if (!selected.length) continue;
      test.describe(`captures ${format.id} ${scenario}`, () => {
        test.use({
          viewport: { width: format.width, height: format.height },
          hasTouch: format.touch,
          isMobile: format.touch,
          locale: "fr-FR",
          seedScenario: scenario,
        });
        test(`captures ${format.id} ${scenario}`, async ({ appPage: page }: { appPage: Page }) => {
          test.setTimeout(20 * 60_000);
          page.setDefaultTimeout(15_000);
          await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
          const directory = join(outputDirectory, format.id);
          mkdirSync(directory, { recursive: true });
          const missing: Record<string, string> = {};
          for (const screen of selected) {
            try {
              await page.setViewportSize({ width: format.width, height: format.height });
              await screen.open(page);
              await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
              await ready(page);
              // A screen still compiling or loading shows an empty main area: wait until it shows content.
              await page
                .waitForFunction(
                  () =>
                    (document.querySelector("main, [data-testid=application-main]")?.textContent ?? "").trim().length >
                    20,
                  undefined,
                  { timeout: 20_000 },
                )
                .catch(() => undefined);
              await page.waitForTimeout(600);
              await page.screenshot({ path: join(directory, `${screen.id}.png`), fullPage: true });
            } catch (error) {
              missing[screen.id] = error instanceof Error ? error.message.split("\n")[0] : String(error);
            }
          }
          writeFileSync(
            join(directory, `non-ouverts-${scenario}${onlyScreens ? "-reprise" : ""}.json`),
            JSON.stringify(missing, null, 2),
          );
        });
      });
    }
  }
}
