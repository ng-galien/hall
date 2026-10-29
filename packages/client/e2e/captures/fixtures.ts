import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test as base, expect } from "../fixtures/application";

/** The documentation captures: every screen of the user documentation, taken on the Alésia dataset. */
const capturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "../../public/documentation/captures");

/** Writes the capture only when producing the documentation images; the CI journeys run every step without writing. */
export async function capture(page: Page, name: string) {
  if (process.env.HALL_DOCS_CAPTURES !== "true") return;
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

/** The Alésia accounts the captures sign in with: each step is taken by the account that does it at the town hall. */
export const accounts = {
  /** Écriture du conseil - Convictolitavis, role Secrétariat: preparation, decisions, minutes, appointments. */
  secretariat: "secretariat@alesia.example",
  /**
   * Vercassivellaunos l’Arverne, councillor linked to his contact: designated secretary of the meetings of the
   * journeys, he records the roll call, the votes and the conduct as an officer of the meeting.
   */
  conduite: "vercassivellaunos@alesia.example",
  /** Vercingétorix l’Arverne, role Administrateur: users and reserved settings only. */
  administrateur: "vercingetorix@alesia.example",
} as const;

export const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Hall-demo-2026!";

/** Opens a real session of an Alésia account for the page and its API requests, without navigating. */
export async function switchAccount(page: Page, account: keyof typeof accounts) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: accounts[account], password: demoPassword },
  });
  expect(response.ok(), `sign-in of ${accounts[account]}`).toBeTruthy();
}

/** Signs in with an Alésia account, then reopens the current address or `path`. */
export async function signIn(page: Page, account: keyof typeof accounts, path?: string) {
  await switchAccount(page, account);
  await page.goto(path ?? page.url());
  await page.waitForLoadState("networkidle");
}

export const test = base.extend<{ docsPage: Page }>({
  docsPage: async ({ page, isolatedDatabase: _isolatedDatabase }, use) => {
    await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
    await switchAccount(page, "secretariat");
    await page.goto("/app/");
    await expect(page.getByTestId("application-sync-status")).toHaveAttribute("data-sync-state", "synchronized");
    await use(page);
  },
});

export { expect };

/** The council member of the conduct account, whom the journeys designate secretary of the meeting. */
export async function conductMemberId(page: Page): Promise<string> {
  const entities = async <T>(path: string): Promise<T[]> => {
    const response = await page.request.get(path);
    expect(response.ok(), path).toBeTruthy();
    return (((await response.json()) as { entities?: Array<{ properties: T }> }).entities ?? []).map(
      (entity) => entity.properties,
    );
  };
  const contact = (await entities<{ id: string; firstName: string }>("/api/contacts")).find(
    (entry) => entry.firstName === "Vercassivellaunos",
  )!;
  return (await entities<{ id: string; contactId: string; active: boolean }>("/api/council-members")).find(
    (member) => member.contactId === contact.id && member.active,
  )!.id;
}
