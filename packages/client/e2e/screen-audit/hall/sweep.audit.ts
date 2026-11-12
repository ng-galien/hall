import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { test } from "../../fixtures/application";
import {
  measureConformance,
  measureDesignReference,
  measureFormFields,
  measureMenuLines,
  readBreakpoints,
  readComponentUnity,
  readContainers,
  readContentWidth,
  stretchTexts,
} from "../engine/conformance.mjs";
import { intervalsOf, measureLayout, parseRanges, planWidths, settleLayout } from "../engine/sweep.mjs";
import { ready, screens } from "./screens.mjs";
import { sweepPlan } from "./sweep-config.mjs";

/*
 * Width sweep of the Hall screens on the seeded disposable database: measurements only, no screenshot. One test per
 * input and seed scenario; inside it, several browser contexts take the screens from one queue. The widths are both
 * ends of every interval between two width thresholds of the application, read from its loaded style sheets and its
 * scripts: the narrowest end with every rule, the widest end with the geometry rules. Above the phone layout every
 * width is measured with the menu unfolded and folded, plus the window widths that put each query container just
 * under and at its threshold. A last pass lengthens names and titles and measures the narrowest ends again.
 */

type Finding = { rule: string; selector: string; detail: string };
type Screen = (typeof screens)[number];
type Breakpoint = { kind: string; breakpoint: number; query: string; source: string; container: string | null };
type Container = { names: string[]; selector: string; width: number; viewport: number };
type Step = { width: number; full: boolean };

const outputDirectory = process.env.HALL_SCREEN_AUDIT_OUTPUT ?? "";
const sweeping = process.env.HALL_SCREEN_AUDIT_MODE === "sweep";
const onlyScreens = process.env.HALL_SCREEN_AUDIT_SCREENS?.split(",");
const onlyIntervals = parseRanges(process.env.HALL_SCREEN_AUDIT_INTERVALS ?? "");
/** Exact window widths of a targeted pass, measured with every rule instead of the ends of the intervals. */
const onlyWidths = process.env.HALL_SCREEN_AUDIT_WIDTHS?.split(",").map(Number) ?? null;

async function setMenu(page: Page, expanded: boolean) {
  const toggle = page.getByTestId("navigation-toggle").first();
  if (!(await toggle.isVisible().catch(() => false))) return false;
  if ((await toggle.getAttribute("aria-expanded")) !== String(expanded)) await toggle.click();
  return true;
}

if (sweeping) {
  if (!outputDirectory) throw new Error("HALL_SCREEN_AUDIT_OUTPUT names the screen-audit output directory");
  for (const input of ["pointer", "touch"] as const) {
    const height = sweepPlan.height[input];
    for (const scenario of ["minutes", "default"] as const) {
      const selected = screens.filter(
        (screen: Screen) =>
          screen.scenario === scenario &&
          (!onlyScreens || onlyScreens.includes(screen.id)) &&
          (input === "pointer" || screen.formats.some((format: string) => format !== "ordinateur")),
      );
      if (!selected.length) continue;
      test.describe(`${input} ${scenario}`, () => {
        test.use({
          viewport: { width: 1280, height },
          hasTouch: input === "touch",
          isMobile: input === "touch",
          locale: "fr-FR",
          seedScenario: scenario,
        });
        test(`sweep ${input} ${scenario}`, async ({ appPage, browser, baseURL }) => {
          test.setTimeout(30 * 60_000);
          const storageState = await appPage.context().storageState();
          const findings: Array<Finding & Record<string, unknown>> = [];
          const contentWidths: Array<Record<string, unknown>> = [];
          const unity: Array<Record<string, unknown>> = [];
          const breakpointsSeen = new Map<string, Breakpoint>();
          const missing: string[] = [];
          const measured: string[] = [];
          let measures = 0;
          const queue = [...selected];
          const menusOpened = new Set<string>();
          const menusFailed = new Map<string, string>();
          const directory = join(outputDirectory, "sweep");
          mkdirSync(directory, { recursive: true });
          const measuresOf = new Map<string, number>();
          /* Each screen writes its own record as soon as it is measured: an interrupted pass keeps what it measured. */
          const done = (id: string) => {
            measured.push(id);
            const mine = (entry: Record<string, unknown>) => entry.screen === id;
            writeFileSync(
              join(directory, `${input}-${scenario}-${id}.json`),
              JSON.stringify({
                input,
                scenario,
                screens: [id],
                measures: measuresOf.get(id) ?? 0,
                missing: [],
                findings: findings.filter(mine),
                contentWidths: contentWidths.filter(mine),
                unity: unity.filter(mine),
                breakpoints: [...breakpointsSeen.values()],
              }),
            );
          };

          const worker = async (browserInstance: Browser) => {
            const context = await browserInstance.newContext({
              storageState,
              baseURL,
              viewport: { width: sweepPlan.to, height },
              hasTouch: input === "touch",
              isMobile: input === "touch",
              locale: "fr-FR",
            });
            await context.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
            const page = await context.newPage();
            /* Without a bound, an action on a covered element waits for the end of the test: a step fails after 15 s
               and the screen is reported as not opened, with the reason. */
            page.setDefaultTimeout(15_000);
            page.setDefaultNavigationTimeout(30_000);
            const resize = async (width: number) => {
              await page.setViewportSize({ width, height });
              await settleLayout(page);
            };
            /* The time of each step, written to the log, so that a slow pass says where its time goes. */
            const timed = async <T>(label: string, step: () => Promise<T>) => {
              const begin = Date.now();
              const result = await step();
              const spent = Date.now() - begin;
              if (spent > 3000)
                appendFileSync(
                  join(directory, "..", "lenteurs.txt"),
                  `${input} ${label} : ${Math.round(spent / 100) / 10} s\n`,
                );
              return result;
            };
            const open = async (screen: Screen, width: number) => {
              await page.setViewportSize({ width, height });
              await timed(`${screen.id} ouverture`, () => screen.open(page));
              // A screen that keeps a connection open (live updates) never reaches network idle: wait 5 s at most.
              await timed(`${screen.id} réseau au repos`, () =>
                page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined),
              );
              await timed(`${screen.id} chargement`, () => ready(page));
              await page.evaluate((icons) => {
                (window as unknown as { __screenAuditIcons: unknown }).__screenAuditIcons = icons;
              }, sweepPlan.fingerprints);
            };
            /* Every menu of the screen (a command with aria-haspopup="menu") is opened, read and closed. */
            const openMenus = async (screen: Screen, width: number, menu: string) => {
              const triggers = page.locator('[aria-haspopup="menu"]:visible');
              const count = Math.min(await triggers.count(), 12);
              for (let index = 0; index < count; index++) {
                const trigger = triggers.nth(index);
                const name =
                  (await trigger.getAttribute("data-testid").catch(() => null)) ??
                  (await trigger.getAttribute("aria-label").catch(() => null)) ??
                  `menu ${index + 1}`;
                try {
                  await trigger.click({ timeout: 3_000 });
                  await page.locator("[role=menu]").first().waitFor({ state: "visible", timeout: 2_000 });
                  await settleLayout(page);
                  const read = await page.evaluate(measureMenuLines, { keyAttribute: "data-testid" });
                  menusOpened.add(`${screen.id} ${name}`);
                  for (const finding of read.findings)
                    findings.push({
                      ...finding,
                      selector: `${name} › ${finding.selector}`,
                      screen: screen.id,
                      width,
                      input,
                      menu,
                      pane: "—",
                      text: "réel",
                    });
                } catch (error) {
                  menusFailed.set(
                    `${screen.id} ${name}`,
                    error instanceof Error ? error.message.split("\n")[0] : String(error),
                  );
                }
                await page.keyboard.press("Escape").catch(() => undefined);
                await page
                  .locator("[role=menu]")
                  .first()
                  .waitFor({ state: "hidden", timeout: 2_000 })
                  .catch(() => undefined);
              }
            };
            const measure = (screen: Screen, step: Step, menu: string, text: string) =>
              timed(`${screen.id} mesure à ${step.width} px, menu ${menu}`, () =>
                measureOnce(screen, step, menu, text),
              );
            const measureOnce = async (screen: Screen, step: Step, menu: string, text: string) => {
              const { width } = step;
              await resize(width);
              const phone = width < sweepPlan.wideFrom;
              const full = step.full && text === "réel";
              const where = { screen: screen.id, width, input, menu, pane: "—" };
              const evaluate = async () => {
                const geometry: Finding[] = await page.evaluate(measureLayout, {
                  ignoreSelectors: sweepPlan.ignoreSelectors,
                  touch: input === "touch" && phone,
                  keyAttribute: "data-testid",
                });
                if (!full) return geometry;
                const settings = {
                  ignoreSelectors: sweepPlan.ignoreSelectors,
                  keyAttribute: "data-testid",
                  touch: input === "touch",
                  phone,
                  item: sweepPlan.isItem(screen),
                  exceptions: sweepPlan.exceptions,
                };
                const decisions: Finding[] = await page.evaluate(measureConformance, settings);
                const fields: Finding[] = await page.evaluate(measureFormFields, {
                  ...settings,
                  field: sweepPlan.formField,
                });
                const design: Finding[] = await page.evaluate(measureDesignReference, {
                  ...settings,
                  entries: sweepPlan.designReference.entries,
                  tolerance: sweepPlan.designReference.tolerance,
                });
                return [...geometry, ...decisions, ...fields, ...design];
              };
              /* A finding counts when a second measure, once the layout has settled, finds it again. */
              let found = await evaluate();
              if (found.length) {
                await page.waitForTimeout(150);
                await settleLayout(page);
                const again = new Set((await evaluate()).map((finding) => `${finding.rule}|${finding.selector}`));
                found = found.filter((finding) => again.has(`${finding.rule}|${finding.selector}`));
              }
              if (full)
                for (const entry of await page.evaluate(readComponentUnity, {
                  components: sweepPlan.unityComponents,
                  phone,
                  touch: input === "touch",
                }))
                  unity.push({ ...entry, ...where });
              if (full) await openMenus(screen, width, menu);
              const areas = await page.evaluate(readContentWidth);
              measures += 1;
              measuresOf.set(screen.id, (measuresOf.get(screen.id) ?? 0) + 1);
              contentWidths.push({ ...where, content: areas.content, menuWidth: areas.menu, paneWidth: areas.pane });
              for (const finding of found) findings.push({ ...finding, ...where, text });
            };

            /** Window widths that put each query container one pixel under and at its threshold. */
            const containerWidths = async (queries: Breakpoint[]) => {
              const targets = new Set<number>();
              const containers: Container[] = await page.evaluate(readContainers);
              for (const query of queries) {
                for (const container of containers) {
                  if (query.container && !container.names.includes(query.container)) continue;
                  for (const wanted of [query.breakpoint - 1, query.breakpoint]) {
                    let window = Math.round(wanted + container.viewport - container.width);
                    for (let attempt = 0; attempt < 3; attempt++) {
                      if (window < sweepPlan.wideFrom || window > sweepPlan.to) break;
                      if (onlyIntervals && !onlyIntervals.some((range) => window >= range.from && window <= range.to))
                        break;
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

            for (let screen = queue.shift(); screen; screen = queue.shift()) {
              try {
                // A screen that exists on a phone only (the « Plus » sheet) is opened at a phone width.
                await open(screen, screen.formats.includes("ordinateur") ? sweepPlan.to : 375);
                const sheets: Breakpoint[] = await page.evaluate(readBreakpoints);
                const all = [...sheets, ...sweepPlan.scriptBreakpoints];
                for (const entry of all)
                  breakpointsSeen.set(`${entry.kind}|${entry.breakpoint}|${entry.source}|${entry.query}`, entry);
                const intervals = intervalsOf(
                  all.filter((entry) => entry.kind !== "container").map((entry) => entry.breakpoint),
                  sweepPlan.from,
                  sweepPlan.to,
                );
                const steps: Step[] = onlyWidths
                  ? onlyWidths
                      .filter((width) => input === "pointer" || width < sweepPlan.touchBelow)
                      .map((width) => ({ width, full: true }))
                  : planWidths(intervals, {
                      below: input === "touch" ? sweepPlan.touchBelow : Number.POSITIVE_INFINITY,
                      only: onlyIntervals,
                    });
                // A screen is measured only at the widths of the formats where it exists.
                const exists = (width: number) =>
                  width < sweepPlan.wideFrom
                    ? screen.formats.includes("telephone")
                    : screen.formats.some((format: string) => format !== "telephone");
                steps.splice(0, steps.length, ...steps.filter((step) => exists(step.width)));
                const phoneSteps = steps.filter((step) => step.width < sweepPlan.wideFrom);
                const wideSteps = steps.filter((step) => step.width >= sweepPlan.wideFrom);

                if (screen.reopenAtEveryWidth) {
                  for (const step of steps) {
                    await open(screen, step.width);
                    await measure(screen, step, "—", "réel");
                  }
                  done(screen.id);
                  continue;
                }
                for (const step of [...phoneSteps].reverse()) await measure(screen, step, "—", "réel");
                if (wideSteps.length) {
                  await resize(sweepPlan.to);
                  const menus = (await setMenu(page, true)) ? [true, false] : [null];
                  for (const menu of menus) {
                    if (menu !== null) {
                      await resize(sweepPlan.to);
                      await setMenu(page, menu);
                    }
                    const extra =
                      input === "pointer" && !onlyWidths
                        ? await containerWidths(all.filter((entry) => entry.kind === "container"))
                        : [];
                    const plan = [...wideSteps, ...extra.map((width) => ({ width, full: false }))].sort(
                      (a, b) => a.width - b.width,
                    );
                    for (const step of plan)
                      await measure(screen, step, menu === null ? "—" : menu ? "déplié" : "replié", "réel");
                  }
                  await resize(sweepPlan.to);
                  await setMenu(page, true);
                }
                /* Long texts: the narrowest end of every interval, menu unfolded. */
                await resize(sweepPlan.to);
                await page.evaluate(stretchTexts);
                for (const step of steps.filter((entry) => entry.full)) await measure(screen, step, "déplié", "long");
                done(screen.id);
              } catch (error) {
                // The call log of Playwright says what blocked the step (an element covering another, for instance).
                const message = error instanceof Error ? error.message : String(error);
                const blocked = message
                  .split("\n")
                  .filter((line) => /intercepts|not visible|not stable|outside|waiting for/.test(line));
                missing.push(
                  `${screen.id}: ${message.split("\n")[0]}${blocked.length ? ` — ${[...new Set(blocked.map((line) => line.trim()))].slice(-2).join(" ; ")}` : ""}`,
                );
              }
            }
            await context.close();
          };

          await Promise.all(Array.from({ length: Math.min(sweepPlan.pages, selected.length) }, () => worker(browser)));
          writeFileSync(
            join(outputDirectory, `menus-${input}-${scenario}.json`),
            JSON.stringify({ opened: [...menusOpened], failed: Object.fromEntries(menusFailed) }),
          );
          writeFileSync(
            join(directory, `${input}-${scenario}-non-ouverts.json`),
            JSON.stringify({
              input,
              scenario,
              screens: [],
              measures: 0,
              missing,
              findings: [],
              contentWidths: [],
              unity: [],
            }),
          );
        });
      });
    }
  }
}
