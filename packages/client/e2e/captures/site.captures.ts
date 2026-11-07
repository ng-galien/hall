import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test as docs, expect, switchAccount, waitForPageEntrance } from "./fixtures";

/**
 * The Hall screens of the Alésia presentation site (`site/public/captures/`), in the light theme. The pins of
 * `site/src/scenes.ts` point at pixels of these images and the scene captions name the dates of the Alésia meetings:
 * the seed and the browser run at the instant of the first captures, 31 October 2026 at 19:36, so that the meetings
 * keep the dates of 1 September, 3 October and 31 October. The server keeps the real clock: the dates it records
 * itself, such as a modification date or a document version, are the dates of the run.
 *
 * Run alone, on demand: `HALL_SITE_CAPTURES=true npm run docs:captures -w @hall/client -- site.captures.ts`.
 */
const siteCapturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "../../../../site/public/captures");
const captureInstant = Date.parse("2026-10-31T19:36:00+01:00");

/** Writes one image of the site, only when producing images. */
async function siteCapture(page: Page, name: string) {
  if (process.env.HALL_DOCS_CAPTURES !== "true") return;
  await mkdir(siteCapturesDirectory, { recursive: true });
  await page.screenshot({
    path: join(siteCapturesDirectory, `${name}.png`),
    animations: "disabled",
    caret: "hide",
  });
}

/** Moves `Date` by a fixed offset; the same source shifts the seed process and the browser page. */
function shiftedDateSource(offset: number) {
  return `{const Real=Date;const offset=${offset};class Shifted extends Real{constructor(...values){if(values.length===0)super(Real.now()+offset);else super(...values);}static now(){return Real.now()+offset;}}globalThis.Date=Shifted;}`;
}

const test = docs.extend<{
  siteScenario: "default" | "minutes";
  clockOffset: number;
}>({
  siteScenario: ["default", { option: true }],
  clockOffset: async ({ playwright: _playwright }, use) => use(captureInstant - Date.now()),
  // The seed runs in a child process of the worker: the option only lives while this test seeds and runs.
  seedScenario: async ({ siteScenario, clockOffset }, use) => {
    const previous = process.env.NODE_OPTIONS;
    const shim = Buffer.from(shiftedDateSource(clockOffset)).toString("base64");
    process.env.NODE_OPTIONS = `${previous ?? ""} --import=data:text/javascript;base64,${shim}`.trim();
    try {
      await use(siteScenario);
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
    }
  },
  page: async ({ page, clockOffset }, use) => {
    await page.addInitScript(shiftedDateSource(clockOffset));
    await page.addInitScript(() =>
      localStorage.setItem("hall.theme.prefs", JSON.stringify({ state: { preference: "light" }, version: 0 })),
    );
    await use(page);
  },
});
test.use({ colorScheme: "light" });
// biome-ignore lint/suspicious/noSkippedTests: the site images are produced on demand, not by every documentation run.
test.skip(process.env.HALL_SITE_CAPTURES !== "true", "site captures are produced on demand only");
test.setTimeout(6 * 60_000);

interface Entity<T> {
  properties: T;
}

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  const body = (await response.json()) as { entities?: Entity<T>[] } | T[];
  return Array.isArray(body) ? body : (body.entities ?? []).map((entity) => entity.properties);
}

/** The entity of a collection whose properties mention the given text, such as its name. */
async function named<T extends { id: string }>(page: Page, path: string, text: string): Promise<T> {
  const entries = await items<T>(page, path);
  const found = entries.find((entry) => JSON.stringify(entry).includes(text));
  expect(found, `${text} in ${path}`).toBeTruthy();
  return found!;
}

/** Every object of a JSON value that carries a name and an identifier. */
function namedObjects(value: unknown): Array<{ id: string; name: string }> {
  if (Array.isArray(value)) return value.flatMap(namedObjects);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own =
    typeof record.name === "string" && typeof record.id === "string" ? [record as { id: string; name: string }] : [];
  return [...own, ...Object.values(record).flatMap(namedObjects)];
}

/** Opens a council business in the workspace with its Documents section unfolded. */
async function openBusinessDocuments(page: Page, businessId: string) {
  await page.goto(`/app/workspace?councilBusiness=${businessId}`);
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  await page.getByTestId("business-category-documents-toggle").click();
  await expect(page.getByTestId("business-resource-tree")).toBeVisible();
}

async function settle(page: Page, delay = 800) {
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await page.waitForTimeout(delay);
}

test.describe("convocation", () => {
  test.use({ siteScenario: "minutes" });

  test("la convocation générée et ses destinataires", async ({ docsPage: page }) => {
    const meetings = await items<{
      id: string;
      startedAt: string | null;
      closedAt: string | null;
    }>(page, "/api/council-meetings");
    const next = meetings.find((meeting) => !meeting.startedAt && !meeting.closedAt)!;
    await page.goto(`/app/meetings/${next.id}`);
    await page.getByTestId("meeting-generate-notice").click();
    // The notice of the established revision opens in the document viewer; the capture shows the meeting with it.
    await page.getByTestId("meeting-notice-open").click();
    await page.getByTestId("document-object-viewer-close").click();
    await expect(page.getByTestId("document-object-viewer")).toBeHidden();
    await expect(page.getByTestId("meeting-export-notice-message")).toBeVisible({ timeout: 60_000 });
    await settle(page);
    await siteCapture(page, "sieger-convocation");
  });
});

test.describe("écrans du bureau", () => {
  test("préparer et siéger sur le jeu Alésia", async ({ docsPage: page }) => {
    const resources = await items<{ id: string; name: string }>(page, "/api/resources");
    const businesses = await items<{ id: string; folderResourceId: string }>(page, "/api/council-business");
    const folderNames = new Map<string, string>();
    for (const entry of businesses) {
      const folder = await page.request.get(`/api/resources/${entry.folderResourceId}`);
      expect(folder.ok()).toBeTruthy();
      const body = (await folder.json()) as {
        properties?: { name: string };
        name?: string;
      };
      folderNames.set(entry.id, body.properties?.name ?? body.name ?? "");
    }
    const business = (name: string) => {
      const found = businesses.find((entry) => folderNames.get(entry.id) === name);
      expect(found, `${name} among ${[...folderNames.values()].join(", ")}`).toBeTruthy();
      return found!;
    };
    const businessItems: unknown = await (
      await page.request.get(
        `/api/council-business/resource-items?${businesses.map((entry) => `councilBusinessId=${entry.id}`).join("&")}`,
      )
    ).json();
    // Documents filed in a council business are listed with the business, not with the workspace resources.
    const resource = (name: string) => {
      const found = [...resources, ...namedObjects(businessItems)].find((entry) => entry.name === name);
      expect(found, name).toBeTruthy();
      return { id: (found as { resourceId?: string }).resourceId ?? found!.id };
    };

    await openBusinessDocuments(page, business("Veille autour de l’oppidum").id);
    await settle(page);
    await siteCapture(page, "preparer-veille");

    await openBusinessDocuments(page, business("Réserves et bâtiments").id);
    await settle(page);
    await siteCapture(page, "preparer-grenier");

    await openBusinessDocuments(page, business("Correspondance avec le proconsul").id);
    await settle(page);
    await siteCapture(page, "sieger-courrier");

    await page.goto(`/app/maps/${resource("Repérage du plateau d’Alésia").id}`);
    await expect(page.getByTestId("geographic-resource-map")).toBeVisible();
    await page.getByTestId("geographic-mode-draw").click();
    await expect(page.getByTestId("geographic-composition-panel-elements")).toBeVisible();
    await settle(page, 4000);
    await siteCapture(page, "preparer-carte");

    for (const [name, file] of [
      ["Ouvrages romains observés", "preparer-ouvrages"],
      ["Chiffrage de la seconde ligne", "preparer-chiffrage"],
    ] as const) {
      await page.goto(`/app/workspace?resource=${resource(name).id}`);
      await expect(page.getByText("Démarrer", { exact: true })).toBeVisible({
        timeout: 180_000,
      });
      await settle(page, 1500);
      await siteCapture(page, file);
    }

    await page.goto(`/app/workspace?resource=${resource("Pourparlers avec Jules César").id}`);
    await settle(page);
    await siteCapture(page, "sieger-invitation");

    await page.goto("/app/calendar");
    await settle(page);
    await siteCapture(page, "sieger-calendrier");

    const meetings = await items<{
      id: string;
      scheduledAt: string;
      startedAt: string | null;
      closedAt: string | null;
    }>(page, "/api/council-meetings");
    const closed = meetings
      .filter((meeting) => meeting.closedAt)
      .sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt));
    await page.goto(`/app/meetings/${closed[0]!.id}`);
    await settle(page);
    await siteCapture(page, "sieger-deroule");
    await page.goto(`/app/meetings/${closed[1]!.id}`);
    await settle(page);
    await siteCapture(page, "sieger-scrutin-secret");

    const minutes = await items<{ id: string }>(page, "/api/minutes");
    await page.goto(`/app/minutes/${minutes.find((entry) => JSON.stringify(entry).includes(closed[0]!.id))!.id}`);
    await settle(page);
    await siteCapture(page, "sieger-proces-verbal");

    const decision = await named<{ id: string }>(page, "/api/council-decisions", "Affectation du grenier d’Alésia");
    await page.goto(`/app/council-decisions/${decision.id}`);
    await expect(page.getByTestId("decision-detail")).toBeVisible();
    await settle(page);
    await siteCapture(page, "sieger-deliberation");

    const delegation = await named<{ id: string }>(
      page,
      "/api/council-delegations",
      "Armée de secours des cités de Gaule",
    );
    await page.goto(`/app/council-delegations/${delegation.id}`);
    await settle(page);
    await siteCapture(page, "sieger-representations");

    const inProgress = meetings.find((meeting) => meeting.startedAt && !meeting.closedAt)!;
    await switchAccount(page, "administrateur");
    await page.goto(`/app/meetings/${inProgress.id}/live`);
    await page.getByTestId("live-attendance-adjust").click();
    await settle(page);
    await siteCapture(page, "sieger-appel");
  });
});

test.describe("téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("le menu Nouveau et la photo", async ({ docsPage: page }) => {
    await page.goto("/app/workspace");
    await page.getByTestId("workspace-create-menu").click();
    await expect(page.getByTestId("workspace-create-takePhoto")).toBeVisible();
    await settle(page);
    await siteCapture(page, "preparer-photo");
  });
});
