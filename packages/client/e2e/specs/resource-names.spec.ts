import type { Locator, Page } from "@playwright/test";
import { expect, runItemCommand, test } from "../fixtures/application";

/* Names written with « / » are kept with « ∕ », and a refused name or content is announced by one error only. */

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
});

async function upload(page: Page, path: string, name: string) {
  const response = await page.request.post("/api/resources/documents", {
    multipart: { path, file: { name, mimeType: "image/jpeg", buffer: jpeg } },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).properties as { id: string; name: string };
}

async function resourceName(page: Page, id: string) {
  return ((await (await page.request.get(`/api/resources/${id}`)).json()).properties as { name: string }).name;
}

/** The visible alerts of the screen: a refusal is announced by exactly one of them. */
function alerts(page: Page) {
  return page.locator('[role="alert"]:visible');
}

async function expectOneAlert(page: Page, text: string) {
  await expect(alerts(page)).toHaveCount(1);
  await expect(alerts(page)).toHaveText(text);
}

/** Opens the name field of the opened item when it is not already open, then writes and sends the name. */
async function renameOpened(page: Page, name: string) {
  const input = page.getByTestId("workspace-workbench-title-input");
  if (!(await input.isVisible())) await runItemCommand(page, "workspace-workbench-rename");
  await input.fill(name);
  await input.press("Enter");
}

async function expectAlertUnder(page: Page, field: Locator) {
  const fieldBox = await field.boundingBox();
  const alertBox = await alerts(page).boundingBox();
  if (!fieldBox || !alertBox) throw new Error("The name field and its alert must be rendered");
  expect(alertBox.y, "the alert stands under the name field").toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);
  expect(alertBox.y - (fieldBox.y + fieldBox.height), "the alert stands next to the name field").toBeLessThan(160);
}

async function createInFolder(page: Page, kind: "folder" | "text", name: string) {
  await page.getByTestId("workspace-tree-root").click({ button: "right" });
  await page.getByTestId("workspace-tree-create").press("ArrowRight");
  await page.getByTestId(`workspace-tree-create-${kind}`).press("Enter");
  const input = page.getByTestId(
    kind === "folder" ? "workspace-tree-create-folder-input" : "workspace-tree-create-input",
  );
  await expect(input).toBeVisible();
  await input.fill(name);
  await input.press("Enter");
}

test.describe("names of documents, folders and businesses", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // @verifies-requirement HALL-FR-DOC-590
  test("a document renamed with « / » shows « ∕ », is found by « 17/11 », and each refused name gives one alert under the field", async ({
    appPage: page,
  }) => {
    const marker = crypto.randomUUID().slice(0, 8);
    const folder = `Noms ${marker}`;
    const photo = await upload(page, folder, "Rapoutier dessous.jpg");
    await upload(page, folder, "Déjà pris.jpg");

    await page.goto(`/app/workspace?path=${encodeURIComponent(folder)}&resource=${photo.id}`);
    await expect(page.getByTestId("screen-header-title")).toHaveText("Rapoutier dessous.jpg");
    await renameOpened(page, "Rapoutier dessous 17/11/2026.jpg");
    const recorded = "Rapoutier dessous 17∕11∕2026.jpg";
    await expect(page.getByTestId("screen-header-title")).toHaveText(recorded);
    await expect.poll(() => resourceName(page, photo.id)).toBe(recorded);
    await expect(alerts(page)).toHaveCount(0);

    const input = page.getByTestId("workspace-workbench-title-input");
    for (const [name, reason] of [
      ["..", "Les noms « . » et « .. » sont réservés."],
      ["", "Le nom est obligatoire."],
      ["Déjà pris.jpg", "Un élément du même type porte déjà ce nom dans ce dossier."],
    ] as const) {
      await renameOpened(page, name);
      await expectOneAlert(page, reason);
      if (await input.isVisible()) await expectAlertUnder(page, input);
      await page.screenshot({ path: test.info().outputPath(`rename-refused-${name || "empty"}.png`) });
      expect(await resourceName(page, photo.id)).toBe(recorded);
      if (await input.isVisible()) await input.press("Escape");
    }

    await page.goto(`/app/workspace?path=${encodeURIComponent(folder)}`);
    await page.getByTestId("workspace-search-input").fill("17/11");
    await expect(page.getByTestId("workspace-search-result").filter({ hasText: recorded })).toBeVisible();
  });

  // @verifies-requirement HALL-FR-DOC-590
  test("a folder and a business named with « / » show « ∕ », and a refused folder, creation or business name gives one alert", async ({
    appPage: page,
  }) => {
    const marker = crypto.randomUUID().slice(0, 8);
    const folder = `Dossiers ${marker}`;
    const existing = await page.request.post("/api/resources", {
      data: { kind: "folder", path: folder, name: "Pris" },
    });
    expect(existing.status()).toBe(201);
    const text = await page.request.post("/api/resources", {
      data: { kind: "text", path: folder, name: "Note prise", content: "" },
    });
    expect(text.status()).toBe(201);

    await page.goto(`/app/workspace?path=${encodeURIComponent(folder)}`);
    await createInFolder(page, "folder", "Relevés 17/11");
    await expect(page.getByTestId(`workspace-folder-name-${folder}/Relevés 17∕11`)).toHaveText("Relevés 17∕11");
    await expect(alerts(page)).toHaveCount(0);

    // A folder created with a taken name: one alert.
    await createInFolder(page, "folder", "Pris");
    await expectOneAlert(page, "Un dossier porte déjà ce nom à cet emplacement.");
    await page.keyboard.press("Escape");
    await expect(alerts(page)).toHaveCount(0);

    // An item created in place with a taken name: one alert.
    await createInFolder(page, "text", "Note prise");
    await expect(alerts(page)).toHaveCount(1);
    await expect(alerts(page)).toContainText("porte déjà ce nom");
    await page.keyboard.press("Escape");
    await expect(alerts(page)).toHaveCount(0);

    // A folder of the tree renamed with a taken name: one alert.
    await page.getByTestId(`workspace-folder-name-${folder}/Relevés 17∕11`).click({ button: "right" });
    await page.getByTestId("workspace-tree-rename").click();
    await page.getByTestId("workspace-tree-rename-input").fill("Pris");
    await page.getByTestId("workspace-tree-rename-input").press("Enter");
    await expectOneAlert(page, "Un dossier porte déjà ce nom à cet emplacement.");
    await page.screenshot({ path: test.info().outputPath("folder-rename-refused.png") });

    // A business named with « / », then renamed from its page: « ∕ » shown, a reserved name refused once.
    const business = await page.request.post("/api/council-business", {
      data: { path: folder, name: "Coupe 17/11", reportName: "Rapport", reportContent: "" },
    });
    expect(business.status(), await business.text()).toBe(201);
    const created = (await business.json()).properties as { id: string; title: string };
    expect(created.title).toBe("Coupe 17∕11");
    await page.goto(`/app/workspace?path=${encodeURIComponent(folder)}&councilBusiness=${created.id}`);
    await expect(page.getByTestId("council-business-workbench")).toBeVisible();
    await renameOpened(page, "Coupe de bois / route communale");
    await expect(page.getByTestId("screen-header-title")).toHaveText("Coupe de bois ∕ route communale");
    await expect(alerts(page)).toHaveCount(0);
    await renameOpened(page, ".");
    await expectOneAlert(page, "Les noms « . » et « .. » sont réservés.");
    const input = page.getByTestId("workspace-workbench-title-input");
    if (await input.isVisible()) await expectAlertUnder(page, input);
    await page.screenshot({ path: test.info().outputPath("business-rename-refused.png") });
  });

  // @verifies-requirement HALL-FR-DOC-590
  test("a refused content leaves unsaved changes and one alert, without a second error", async ({ appPage: page }) => {
    const created = await page.request.post("/api/resources", {
      data: {
        kind: "text",
        path: `Contenus ${crypto.randomUUID().slice(0, 8)}`,
        name: "Note refusée",
        content: "Texte.",
      },
    });
    expect(created.status()).toBe(201);
    const text = (await created.json()).properties as { id: string; path: string };
    await page.route(`**/api/resources/${text.id}/content`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({ type: "about:blank", title: "Conflict", status: 409, code: "conflict" }),
      });
    });
    await page.goto(`/app/workspace?path=${encodeURIComponent(text.path)}&resource=${text.id}`);
    await page.getByTestId("markdown-editor-compact").getByTestId("editor-writing-area").fill("Texte refusé.");
    await expect(alerts(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(alerts(page)).toHaveText("La modification est incompatible avec les informations existantes.");
    const states = [page.getByTestId("item-save-state"), page.getByTestId("resource-autosave-toggle")];
    expect(
      (await states[0]!.count()) + (await states[1]!.count()),
      "the save state is shown on the title line",
    ).toBeGreaterThan(0);
    if (await states[0]!.count()) await expect(states[0]!).toHaveAttribute("data-save", "dirty");
    if (await states[1]!.count()) await expect(states[1]!).toHaveAttribute("data-save-status", "dirty");
    await page.screenshot({ path: test.info().outputPath("content-refused.png") });
  });
});
