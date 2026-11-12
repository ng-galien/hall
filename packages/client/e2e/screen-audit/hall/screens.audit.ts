import { test } from "../../fixtures/application";
import { captureScreen, recordDataStrings, recordMissingScreen, writeDataStrings } from "../engine/capture.mjs";
import { collect, formats } from "./config.mjs";
import { ready, screens } from "./screens.mjs";

/* Opens every Hall screen at every format on the seeded disposable database and records its measurements. */

const outputDirectory = process.env.HALL_SCREEN_AUDIT_OUTPUT;
if (!outputDirectory && process.env.HALL_SCREEN_AUDIT_MODE !== "sweep") throw new Error("HALL_SCREEN_AUDIT_OUTPUT names the screen-audit output directory");
const onlyScreens = process.env.HALL_SCREEN_AUDIT_SCREENS?.split(",");
const onlyFormats = process.env.HALL_SCREEN_AUDIT_FORMATS?.split(",");

const reporting = process.env.HALL_SCREEN_AUDIT_MODE !== "sweep";

for (const format of formats.filter((entry) => reporting && (!onlyFormats || onlyFormats.includes(entry.id)))) {
  for (const scenario of ["minutes", "default"] as const) {
    const selected = screens.filter(
      (screen) =>
        screen.scenario === scenario &&
        screen.formats.includes(format.id) &&
        (!onlyScreens || onlyScreens.includes(screen.id)),
    );
    if (!selected.length) continue;
    test.describe(`${format.label}, scenario ${scenario}`, () => {
      test.use({
        viewport: { width: format.width, height: format.height },
        hasTouch: format.touch,
        isMobile: format.touch,
        locale: "fr-FR",
        colorScheme: process.env.HALL_SCREEN_AUDIT_COLOR_SCHEME === "dark" ? "dark" : "light",
        seedScenario: scenario,
      });

      test(`${format.id} ${scenario}`, async ({ appPage: page }) => {
        test.setTimeout(9 * 60_000);
        await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
        const strings = recordDataStrings(page, /\/api\//);
        for (const screen of selected) {
          try {
            await screen.open(page);
            await page.waitForLoadState("networkidle");
            await ready(page);
            await page.waitForTimeout(400);
            await captureScreen(page, { screen, format, outputDirectory, collect });
          } catch (error) {
            recordMissingScreen({
              screen,
              format,
              outputDirectory,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
        writeDataStrings({ outputDirectory, format, name: scenario, strings });
      });
    });
  }
}
