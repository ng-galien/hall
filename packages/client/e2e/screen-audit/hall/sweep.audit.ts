import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test } from "../../fixtures/application";
import { measureLayout, settleLayout } from "../engine/sweep.mjs";
import { sweepPlan } from "./sweep-config.mjs";
import { ready, screens } from "./screens.mjs";

/* Width sweep of every Hall screen on the seeded disposable database: measurements only, no screenshot. */

type Finding = { rule: string; selector: string; detail: string };
type Screen = (typeof screens)[number];

const outputDirectory = process.env.HALL_SCREEN_AUDIT_OUTPUT ?? "";
const sweeping = process.env.HALL_SCREEN_AUDIT_MODE === "sweep";
const onlyScreens = process.env.HALL_SCREEN_AUDIT_SCREENS?.split(",");

async function setMenu(page: Page, expanded: boolean) {
  const toggle = page.getByTestId("navigation-toggle").first();
  if (!(await toggle.isVisible().catch(() => false))) return false;
  if ((await toggle.getAttribute("aria-expanded")) !== String(expanded)) await toggle.click();
  return true;
}

/** Opens or folds the module pane of the screen; answers false when the screen has none. */
async function setPane(page: Page, open: boolean) {
  const pane = page.locator("aside.module-pane").first();
  const paneOpen = await pane.isVisible().catch(() => false);
  if (paneOpen === open) return true;
  if (paneOpen) {
    await pane.locator('[data-testid$="-toggle"]').first().click();
    return true;
  }
  const reopen = page.locator('[data-testid$="-toggle"][aria-expanded="false"]').first();
  if (!(await reopen.isVisible().catch(() => false))) return false;
  await reopen.click();
  return true;
}

async function hasPane(page: Page) {
  if (await page.locator("aside.module-pane").first().isVisible().catch(() => false)) return true;
  return page
    .locator('[data-testid$="-toggle"][aria-expanded="false"]')
    .first()
    .isVisible()
    .catch(() => false);
}

if (sweeping) {
  if (!outputDirectory) throw new Error("HALL_SCREEN_AUDIT_OUTPUT names the screen-audit output directory");
  for (const input of ["pointer", "touch"] as const) {
    const plan = sweepPlan[input];
    for (const scenario of ["minutes", "default"] as const) {
      const selected = screens.filter(
        (screen: Screen) =>
          screen.scenario === scenario && (!onlyScreens || onlyScreens.includes(screen.id)) && plan.screens(screen),
      );
      for (let start = 0; start < selected.length; start += plan.chunk) {
        const chunk = selected.slice(start, start + plan.chunk);
        test.describe(`${input} ${scenario} ${start / plan.chunk + 1}`, () => {
          test.use({
            viewport: { width: 1280, height: 900 },
            hasTouch: input === "touch",
            isMobile: input === "touch",
            locale: "fr-FR",
            seedScenario: scenario,
          });
          test(`sweep ${input} ${scenario} ${chunk.map((screen: Screen) => screen.id).join(" ")}`, async ({
            appPage: page,
          }) => {
            test.setTimeout(9 * 60_000);
            await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
            const findings: Array<Finding & Record<string, unknown>> = [];
            let measures = 0;
            const measure = async (screen: Screen, width: number, menu: string, pane: string) => {
              await page.setViewportSize({ width, height: plan.height });
              await settleLayout(page);
              const found: Finding[] = await page.evaluate(measureLayout, {
                ignoreSelectors: plan.ignoreSelectors,
                touch: input === "touch",
                keyAttribute: "data-testid",
              });
              measures += 1;
              for (const finding of found) findings.push({ ...finding, screen: screen.id, width, input, menu, pane });
            };
            const open = async (screen: Screen, width: number) => {
              await page.setViewportSize({ width, height: plan.height });
              await screen.open(page);
              await page.waitForLoadState("networkidle");
              await ready(page);
            };
            const missing: string[] = [];
            for (const screen of chunk) {
              const widths = plan.widths(screen);
              try {
                if (screen.reopenAtEveryWidth) {
                  for (const width of widths) {
                    await open(screen, width);
                    await measure(screen, width, "—", "—");
                  }
                  continue;
                }
                await open(screen, widths.at(-1) ?? 1280);
                const phoneWidths = widths.filter((width: number) => width <= plan.phoneWidth);
                const wideWidths = widths.filter((width: number) => width > plan.phoneWidth);
                for (const width of [...phoneWidths].reverse()) await measure(screen, width, "—", "—");
                if (!wideWidths.length) continue;
                await page.setViewportSize({ width: 1280, height: plan.height });
                await settleLayout(page);
                const menus = (await setMenu(page, true)) ? [true, false] : [null];
                for (const menu of menus) {
                  if (menu !== null) {
                    await page.setViewportSize({ width: 1280, height: plan.height });
                    await settleLayout(page);
                    await setMenu(page, menu);
                  }
                  const panes = (await hasPane(page)) ? [true, false] : [null];
                  for (const pane of panes) {
                    if (pane !== null) {
                      await page.setViewportSize({ width: 1280, height: plan.height });
                      await settleLayout(page);
                      await setPane(page, pane);
                    }
                    for (const width of wideWidths) {
                      await measure(
                        screen,
                        width,
                        menu === null ? "—" : menu ? "déplié" : "replié",
                        pane === null ? "—" : pane ? "ouvert" : "replié",
                      );
                    }
                  }
                }
                await setMenu(page, true);
                await setPane(page, true);
              } catch (error) {
                missing.push(`${screen.id}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
              }
            }
            const directory = join(outputDirectory, "sweep");
            mkdirSync(directory, { recursive: true });
            writeFileSync(
              join(directory, `${input}-${scenario}-${start}.json`),
              JSON.stringify({ input, scenario, screens: chunk.map((screen: Screen) => screen.id), measures, missing, findings }),
            );
          });
        });
      }
    }
  }
}
