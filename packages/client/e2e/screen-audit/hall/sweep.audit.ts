import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test } from "../../fixtures/application";
import {
  measureConformance,
  measureDesignReference,
  readBreakpoints,
  readComponentUnity,
  readContainers,
  readContentWidth,
  stretchTexts,
} from "../engine/conformance.mjs";
import { intervalsOf, measureLayout, settleLayout } from "../engine/sweep.mjs";
import { ready, screens } from "./screens.mjs";
import { sweepPlan } from "./sweep-config.mjs";

/*
 * Width sweep of every Hall screen on the seeded disposable database: measurements only, no screenshot. The widths are
 * both ends of every interval between two width thresholds of the application, read from its loaded style sheets and
 * its scripts; above the phone layout, every interval is measured with the menu unfolded and folded and the module pane
 * open and folded, plus the window widths that put each query container just under and at its threshold. A last pass
 * lengthens names and titles and measures the narrowest end of every interval again.
 */

type Finding = { rule: string; selector: string; detail: string };
type Screen = (typeof screens)[number];
type Breakpoint = { kind: string; breakpoint: number; query: string; source: string; container: string | null };
type Container = { names: string[]; selector: string; width: number; viewport: number };

const outputDirectory = process.env.HALL_SCREEN_AUDIT_OUTPUT ?? "";
const sweeping = process.env.HALL_SCREEN_AUDIT_MODE === "sweep";
const onlyScreens = process.env.HALL_SCREEN_AUDIT_SCREENS?.split(",");

async function setMenu(page: Page, expanded: boolean) {
  const toggle = page.getByTestId("navigation-toggle").first();
  if (!(await toggle.isVisible().catch(() => false))) return false;
  if ((await toggle.getAttribute("aria-expanded")) !== String(expanded)) await toggle.click();
  return true;
}

/**
 * The module pane (`aside.module-pane`) folds by the control `[data-testid=module-pane-toggle]` it carries, and comes
 * back by `[data-testid=module-pane-open]`. Opens or folds it; answers false when the screen has none.
 */
const paneSelector = "aside.module-pane";
const paneControls = "[data-testid=module-pane-toggle], [data-testid=module-pane-open]";

async function setPane(page: Page, open: boolean) {
  const pane = page.locator(paneSelector).first();
  const paneOpen = await pane.isVisible().catch(() => false);
  if (paneOpen === open) return true;
  const control = page.locator(paneControls).first();
  if (!(await control.isVisible().catch(() => false))) return false;
  await control.click();
  return true;
}

async function hasPane(page: Page) {
  return (
    (await page
      .locator(paneSelector)
      .first()
      .isVisible()
      .catch(() => false)) ||
    (await page
      .locator(paneControls)
      .first()
      .isVisible()
      .catch(() => false))
  );
}

if (sweeping) {
  if (!outputDirectory) throw new Error("HALL_SCREEN_AUDIT_OUTPUT names the screen-audit output directory");
  for (const input of ["pointer", "touch"] as const) {
    const chunkSize = sweepPlan.chunk[input];
    const height = sweepPlan.height[input];
    for (const scenario of ["minutes", "default"] as const) {
      const selected = screens.filter(
        (screen: Screen) =>
          screen.scenario === scenario &&
          (!onlyScreens || onlyScreens.includes(screen.id)) &&
          (input === "pointer" || screen.formats.some((format: string) => format !== "ordinateur")),
      );
      for (let start = 0; start < selected.length; start += chunkSize) {
        const chunk = selected.slice(start, start + chunkSize);
        test.describe(`${input} ${scenario} ${start / chunkSize + 1}`, () => {
          test.use({
            viewport: { width: 1280, height },
            hasTouch: input === "touch",
            isMobile: input === "touch",
            locale: "fr-FR",
            seedScenario: scenario,
          });
          test(`sweep ${input} ${scenario} ${chunk.map((screen: Screen) => screen.id).join(" ")}`, async ({
            appPage: page,
          }) => {
            test.setTimeout(20 * 60_000);
            await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
            const findings: Array<Finding & Record<string, unknown>> = [];
            const contentWidths: Array<Record<string, unknown>> = [];
            const unity: Array<Record<string, unknown>> = [];
            const breakpointsSeen = new Map<string, Breakpoint>();
            let measures = 0;
            const missing: string[] = [];

            const resize = async (width: number) => {
              await page.setViewportSize({ width, height });
              await settleLayout(page);
            };
            const measure = async (screen: Screen, width: number, menu: string, pane: string, text: string) => {
              await resize(width);
              const phone = width < sweepPlan.wideFrom;
              const evaluate = async () => {
                const geometry: Finding[] = await page.evaluate(measureLayout, {
                  ignoreSelectors: sweepPlan.ignoreSelectors,
                  touch: input === "touch" && phone,
                  keyAttribute: "data-testid",
                });
                const decisions: Finding[] =
                  text === "réel"
                    ? await page.evaluate(measureConformance, {
                        ignoreSelectors: sweepPlan.ignoreSelectors,
                        keyAttribute: "data-testid",
                        touch: input === "touch",
                        phone,
                        item: sweepPlan.isItem(screen),
                        exceptions: sweepPlan.exceptions,
                      })
                    : [];
                const design: Finding[] =
                  text === "réel"
                    ? await page.evaluate(measureDesignReference, {
                        entries: sweepPlan.designReference.entries,
                        tolerance: sweepPlan.designReference.tolerance,
                        touch: input === "touch",
                        phone,
                        keyAttribute: "data-testid",
                        ignoreSelectors: sweepPlan.ignoreSelectors,
                      })
                    : [];
                return [...geometry, ...decisions, ...design];
              };
              /* A finding counts when a second measure, after the layout has had time to settle, finds it again: a
                 layout still switching after the resize is not measured as a defect. */
              let found = await evaluate();
              if (found.length) {
                await page.waitForTimeout(600);
                await settleLayout(page);
                const again = new Set((await evaluate()).map((finding) => `${finding.rule}|${finding.selector}`));
                found = found.filter((finding) => again.has(`${finding.rule}|${finding.selector}`));
              }
              const tactile = phone || input === "touch";
              if (text === "réel") {
                const where = { screen: screen.id, width, input, menu, pane };
                for (const entry of await page.evaluate(readComponentUnity, {
                  components: sweepPlan.unityComponents,
                  tactile,
                }))
                  unity.push({ ...entry, ...where });
                /* Below the drawer width, the unfolded menu opens over the content: it is measured open, then closed. */
                const toggle = page.getByTestId("navigation-toggle").first();
                if (!phone && width < sweepPlan.drawerBelow && menu !== "replié" && (await toggle.isVisible())) {
                  await toggle.click();
                  const drawer = page.getByTestId("mobile-navigation");
                  if (await drawer.isVisible({ timeout: 2_000 }).catch(() => false)) {
                    await settleLayout(page);
                    for (const entry of await page.evaluate(readComponentUnity, {
                      components: sweepPlan.unityComponents,
                      tactile,
                    }))
                      if (entry.component.includes("menu"))
                        unity.push({ ...entry, ...where, menu: "ouvert par-dessus le contenu" });
                    for (const finding of (await page.evaluate(measureDesignReference, {
                      entries: sweepPlan.designReference.entries.filter((entry: { component: string }) =>
                        entry.component.startsWith("barre latérale"),
                      ),
                      tolerance: sweepPlan.designReference.tolerance,
                      touch: input === "touch",
                      phone,
                      keyAttribute: "data-testid",
                      ignoreSelectors: sweepPlan.ignoreSelectors,
                    })) as Finding[])
                      findings.push({ ...finding, ...where, menu: "ouvert par-dessus le contenu", text });
                    await page.keyboard.press("Escape");
                    await drawer.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => undefined);
                  }
                }
              }
              const areas = await page.evaluate(readContentWidth);
              measures += 1;
              contentWidths.push({
                screen: screen.id,
                width,
                input,
                menu,
                pane,
                content: areas.content,
                menuWidth: areas.menu,
                paneWidth: areas.pane,
              });
              for (const finding of found)
                findings.push({ ...finding, screen: screen.id, width, input, menu, pane, text });
            };
            const open = async (screen: Screen, width: number) => {
              await page.setViewportSize({ width, height });
              await screen.open(page);
              await page.waitForLoadState("networkidle");
              await ready(page);
              await page.evaluate((icons) => {
                (window as unknown as { __screenAuditIcons: unknown }).__screenAuditIcons = icons;
              }, sweepPlan.fingerprints);
            };

            for (const screen of chunk) {
              try {
                await open(screen, sweepPlan.to);
                const sheets: Breakpoint[] = await page.evaluate(readBreakpoints);
                const all = [...sheets, ...sweepPlan.scriptBreakpoints];
                for (const entry of all)
                  breakpointsSeen.set(`${entry.kind}|${entry.breakpoint}|${entry.source}|${entry.query}`, entry);
                const viewportBreakpoints = all
                  .filter((entry) => entry.kind !== "container")
                  .map((entry) => entry.breakpoint);
                const intervals = intervalsOf(viewportBreakpoints, sweepPlan.from, sweepPlan.to);
                const ends = [...new Set(intervals.flatMap((interval) => [interval.from, interval.to]))].sort(
                  (a, b) => a - b,
                );
                const touchEnds = ends.filter((width) => width < sweepPlan.touchBelow);
                const widths = input === "touch" ? touchEnds : ends;
                const phoneWidths = widths.filter((width) => width < sweepPlan.wideFrom);
                const wideWidths = widths.filter((width) => width >= sweepPlan.wideFrom);
                const containerQueries = all.filter((entry) => entry.kind === "container");

                if (screen.reopenAtEveryWidth) {
                  for (const width of widths) {
                    await open(screen, width);
                    await measure(screen, width, "—", "—", "réel");
                  }
                  continue;
                }
                for (const width of [...phoneWidths].reverse()) await measure(screen, width, "—", "—", "réel");

                /** Window widths that put each query container one pixel under and at its threshold. */
                const containerWidths = async () => {
                  const targets = new Set<number>();
                  const containers: Container[] = await page.evaluate(readContainers);
                  for (const query of containerQueries) {
                    for (const container of containers) {
                      if (query.container && !container.names.includes(query.container)) continue;
                      for (const wanted of [query.breakpoint - 1, query.breakpoint]) {
                        let window = Math.round(wanted + container.viewport - container.width);
                        for (let attempt = 0; attempt < 3; attempt++) {
                          if (window < sweepPlan.wideFrom || window > sweepPlan.to) break;
                          await resize(window);
                          const now: Container[] = await page.evaluate(readContainers);
                          const same = now.find((entry) => entry.selector === container.selector);
                          if (!same) break;
                          const gap = wanted - Math.floor(same.width);
                          if (gap === 0) {
                            targets.add(window);
                            break;
                          }
                          window += gap;
                        }
                      }
                    }
                  }
                  await resize(sweepPlan.to);
                  return [...targets];
                };

                if (wideWidths.length) {
                  await resize(sweepPlan.to);
                  const menus = (await setMenu(page, true)) ? [true, false] : [null];
                  for (const menu of menus) {
                    if (menu !== null) {
                      await resize(sweepPlan.to);
                      await setMenu(page, menu);
                    }
                    const panes = (await hasPane(page)) ? [true, false] : [null];
                    for (const pane of panes) {
                      if (pane !== null) {
                        await resize(sweepPlan.to);
                        await setPane(page, pane);
                      }
                      const extra = input === "pointer" ? await containerWidths() : [];
                      for (const width of [...new Set([...wideWidths, ...extra])].sort((a, b) => a - b))
                        await measure(
                          screen,
                          width,
                          menu === null ? "—" : menu ? "déplié" : "replié",
                          pane === null ? "—" : pane ? "ouvert" : "replié",
                          "réel",
                        );
                    }
                  }
                  await resize(sweepPlan.to);
                  await setMenu(page, true);
                  await setPane(page, true);
                }

                /* Long texts: the narrowest end of every interval, menu unfolded and pane open. */
                await resize(sweepPlan.to);
                await page.evaluate(stretchTexts);
                const narrowest = intervals
                  .map((interval) => interval.from)
                  .filter((width) => (input === "touch" ? width < sweepPlan.touchBelow : true));
                for (const width of narrowest) await measure(screen, width, "déplié", "ouvert", "long");
              } catch (error) {
                missing.push(`${screen.id}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
              }
            }
            const directory = join(outputDirectory, "sweep");
            mkdirSync(directory, { recursive: true });
            writeFileSync(
              join(directory, `${input}-${scenario}-${start}.json`),
              JSON.stringify({
                input,
                scenario,
                screens: chunk.map((screen: Screen) => screen.id),
                measures,
                missing,
                findings,
                contentWidths,
                unity,
                breakpoints: [...breakpointsSeen.values()],
              }),
            );
          });
        });
      }
    }
  }
}
