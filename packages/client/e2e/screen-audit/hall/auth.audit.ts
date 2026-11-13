import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test } from "../../fixtures/application";
import {
  measureConformance,
  measureDesignReference,
  measureFormFields,
  readBreakpoints,
} from "../engine/conformance.mjs";
import { intervalsOf, measureLayout, parseRanges, planWidths, settleLayout } from "../engine/sweep.mjs";
import { sweepPlan } from "./sweep-config.mjs";

/*
 * Width sweep of the screens shown without a session (sign-in, forgotten password, password link), on the disposable
 * instance in its authenticated mode. Each screen is opened at every width and measured by the same rules as the
 * other screens; the records have the form of the main sweep.
 */

type Finding = { rule: string; selector: string; detail: string };
type Breakpoint = { kind: string; breakpoint: number; query: string; source: string; container: string | null };

const outputDirectory = process.env.HALL_SCREEN_AUDIT_OUTPUT ?? "";
const onlyWidths = process.env.HALL_SCREEN_AUDIT_WIDTHS?.split(",").map(Number) ?? null;
const onlyIntervals = parseRanges(process.env.HALL_SCREEN_AUDIT_INTERVALS ?? "");

/** Screens without a session, each opened from the address of the application. */
export const authScreens = [
  {
    id: "connexion",
    async open(page: Page) {
      await page.goto("/app/");
      await page.getByTestId("auth-email").waitFor({ state: "visible" });
    },
  },
  {
    id: "mot-de-passe-oublie",
    async open(page: Page) {
      await page.goto("/app/");
      await page.getByTestId("auth-forgot-password").click();
      await page.getByTestId("password-recovery").waitFor({ state: "visible" });
    },
  },
  {
    id: "lien-inutilisable",
    async open(page: Page) {
      await page.goto("/app/password-link#jeton-inutilisable");
      await page.getByTestId("password-link-unusable").waitFor({ state: "visible" });
    },
  },
];

if (process.env.HALL_SCREEN_AUDIT_MODE === "auth-sweep") {
  if (!outputDirectory) throw new Error("HALL_SCREEN_AUDIT_OUTPUT names the screen-audit output directory");
  for (const input of ["pointer", "touch"] as const) {
    const height = sweepPlan.height[input];
    test.describe(`sans session ${input}`, () => {
      test.use({
        viewport: { width: 1280, height },
        hasTouch: input === "touch",
        isMobile: input === "touch",
        locale: "fr-FR",
      });
      test(`sweep sans session ${input}`, async ({ page, isolatedDatabase: _isolatedDatabase }) => {
        test.setTimeout(10 * 60_000);
        page.setDefaultTimeout(15_000);
        await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
        const directory = join(outputDirectory, "sweep");
        mkdirSync(directory, { recursive: true });
        const missing: string[] = [];
        for (const screen of authScreens) {
          const findings: Array<Finding & Record<string, unknown>> = [];
          let measures = 0;
          try {
            await page.setViewportSize({ width: sweepPlan.to, height });
            await screen.open(page);
            const sheets: Breakpoint[] = await page.evaluate(readBreakpoints);
            const all = [...sheets, ...sweepPlan.scriptBreakpoints];
            const intervals = intervalsOf(
              all.filter((entry) => entry.kind !== "container").map((entry) => entry.breakpoint),
              sweepPlan.from,
              sweepPlan.to,
            );
            const steps = onlyWidths
              ? onlyWidths.map((width) => ({ width, full: true }))
              : planWidths(intervals, {
                  below: input === "touch" ? sweepPlan.touchBelow : Number.POSITIVE_INFINITY,
                  only: onlyIntervals,
                });
            for (const step of steps) {
              await page.setViewportSize({ width: step.width, height });
              await settleLayout(page);
              const phone = step.width < sweepPlan.wideFrom;
              const settings = {
                ignoreSelectors: sweepPlan.ignoreSelectors,
                keyAttribute: "data-testid",
                touch: input === "touch",
                phone,
                item: false,
                exceptions: sweepPlan.exceptions,
              };
              const found: Finding[] = [
                ...(await page.evaluate(measureLayout, { ...settings, touch: input === "touch" && phone })),
                ...(step.full ? await page.evaluate(measureConformance, settings) : []),
                ...(step.full
                  ? await page.evaluate(measureFormFields, { ...settings, field: sweepPlan.formField })
                  : []),
                ...(step.full
                  ? await page.evaluate(measureDesignReference, {
                      ...settings,
                      entries: sweepPlan.designReference.entries,
                      tolerance: sweepPlan.designReference.tolerance,
                    })
                  : []),
              ];
              measures += 1;
              for (const finding of found)
                findings.push({
                  ...finding,
                  screen: screen.id,
                  width: step.width,
                  input,
                  menu: "\u2014",
                  pane: "\u2014",
                  text: "réel",
                });
            }
            writeFileSync(
              join(directory, `${input}-auth-${screen.id}.json`),
              JSON.stringify({
                input,
                scenario: "auth",
                screens: [screen.id],
                measures,
                missing: [],
                findings,
                contentWidths: [],
                unity: [],
                breakpoints: all,
              }),
            );
          } catch (error) {
            missing.push(`${screen.id}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
          }
        }
        writeFileSync(
          join(directory, `${input}-auth-non-ouverts.json`),
          JSON.stringify({
            input,
            scenario: "auth",
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
