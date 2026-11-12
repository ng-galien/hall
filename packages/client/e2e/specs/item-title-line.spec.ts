import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

test.use({ seedScenario: "default" });

type CatalogEntry = { id: string; kind: string; path: string; name: string; mediaType?: string | null };

async function openedItems(page: Page) {
  const catalog = (await (await page.request.get("/api/resources/catalog")).json()) as {
    properties?: { entries?: CatalogEntry[] };
    entities?: Array<{ properties: CatalogEntry }>;
  };
  const entries = catalog.entities?.map((entity) => entity.properties) ?? catalog.properties?.entries ?? [];
  const find = (predicate: (entry: CatalogEntry) => boolean, label: string) => {
    const entry = entries.find(predicate);
    if (!entry) throw new Error(`The demonstration holds no ${label}`);
    return `/app/workspace?${new URLSearchParams({ path: entry.path, resource: entry.id })}`;
  };
  const businesses = (await (await page.request.get("/api/council-business")).json()) as {
    entities?: Array<{ properties: { id: string; folderPath: string } }>;
  };
  const business = businesses.entities?.[0]?.properties;
  if (!business) throw new Error("The demonstration holds no affaire");
  return {
    map: find((entry) => entry.kind === "geographic", "map"),
    text: find((entry) => entry.kind === "text", "text"),
    pdf: find(
      (entry) => entry.kind === "document" && (entry.mediaType ?? "application/pdf") === "application/pdf",
      "PDF",
    ),
    spreadsheet: find((entry) => entry.kind === "spreadsheet", "spreadsheet"),
    business: `/app/workspace?${new URLSearchParams({ path: business.folderPath, councilBusiness: business.id })}`,
  };
}

/** The first line of the screen header says where one is: one line of at most 44 pixels, no command of the item. */
async function expectPlaceLine(page: Page, label: string) {
  const line = page.getByTestId("screen-header").locator(".screen-header-line");
  const box = await line.boundingBox();
  expect(box!.height, `${label}: first line height`).toBeLessThanOrEqual(44.5);
  const commands = await line.locator("button, a.hall-button").evaluateAll((elements) =>
    elements
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .filter((element) => !element.closest(".screen-header-leading, .workspace-breadcrumb"))
      .map((element) => element.getAttribute("data-testid") ?? element.textContent),
  );
  expect(commands, `${label}: commands in the first line`).toEqual([]);
  const crumbs = await line
    .locator(".workspace-crumb")
    .evaluateAll((elements) =>
      elements
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => Math.round(element.getBoundingClientRect().top)),
    );
  expect(new Set(crumbs).size, `${label}: the trail holds on one line`).toBeLessThanOrEqual(1);
}

// @verifies-requirement HALL-FR-LAY-100
test("an opened item keeps its place in the first line and its commands on the line of its title", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(240_000);
  const items = await openedItems(page);
  for (const [width, folded] of [
    [1030, true],
    [1030, false],
    [1280, false],
    [768, false],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/app/workspace");
    const sidebar = page.locator(".app-sidebar").first();
    if (
      width > 1000 &&
      (folded
        ? (await sidebar.getAttribute("data-compact")) !== "true"
        : (await sidebar.getAttribute("data-compact")) === "true")
    )
      await page.getByTestId("navigation-toggle").first().click();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const [kind, url] of Object.entries(items)) {
        const label = `${kind} at ${width} px, menu ${folded ? "folded" : "unfolded"}, ${colorScheme}`;
        await page.goto(url);
        const commands = page.getByTestId("screen-title-commands");
        await expect(commands.getByTestId("item-commands-more")).toBeVisible();
        await expectPlaceLine(page, label);
        await expect(page.getByTestId("workspace-search-panel")).toHaveCount(0);
        await expect(page.getByTestId("workspace-breadcrumb-folder-menu")).toHaveCount(0);
        await expect(page.locator(".workspace-crumb-sep svg")).toHaveCount(0);
        await expect(page.getByTestId("item-save-state").or(page.locator(".workbench-eyebrow")).first()).toBeVisible();
        const title = await page.getByTestId("screen-header-title").boundingBox();
        const more = await commands.getByTestId("item-commands-more").boundingBox();
        expect(more!.y, `${label}: the commands start on the first line of the title`).toBeLessThan(title!.y + 40);
        if (colorScheme === "light" || kind === "map")
          await page.screenshot({
            path: testInfo.outputPath(`${kind}-${width}-${folded ? "rail" : "menu"}-${colorScheme}.png`),
          });
      }
      await page.goto("/app/workspace");
      await expectPlaceLine(page, `folder at ${width} px, ${colorScheme}`);
      await expect(page.getByTestId("workspace-search-panel")).toBeVisible();
    }
  }
});
