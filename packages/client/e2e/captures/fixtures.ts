import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test as base, expect } from "../fixtures/application";

/** The documentation captures: every screen of the user documentation, taken on the Alésia dataset. */
const capturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "../../public/documentation/captures");

export async function capture(page: Page, name: string) {
  const path = join(capturesDirectory, `${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, animations: "disabled", caret: "hide" });
}

/** A local date-time input value (YYYY-MM-DDTHH:mm) for the given instant. */
export function localDateTimeInput(instant: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

/** Waits for the finite animations of the page, such as its entrance, so that a click lands on a still target. */
export async function waitForPageEntrance(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

export const test = base.extend<{ docsPage: Page }>({
  docsPage: async ({ page, isolatedDatabase: _isolatedDatabase }, use) => {
    await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
    await page.goto("/app/");
    await expect(page.getByTestId("application-sync-status")).toHaveAttribute("data-sync-state", "synchronized");
    await use(page);
  },
});

export { expect };
