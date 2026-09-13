import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/application";

test("opens a business on double click without expanding its explorer branch", async ({ appPage: page }) => {
  const response = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Double click ${Date.now()}`, reportName: "Report", reportContent: "" },
  });
  expect(response.status()).toBe(201);
  const business = (await response.json()).properties;
  await page.goto("/app/workspace?path=seed");
  const row = page.getByTestId(`workspace-business-open-${business.id}`);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await row.press("ArrowLeft");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.evaluate((element) => {
    element.setAttribute("data-expansion-changes", "0");
    new MutationObserver((records) => {
      element.setAttribute(
        "data-expansion-changes",
        String(Number(element.getAttribute("data-expansion-changes")) + records.length),
      );
    }).observe(element, { attributes: true, attributeFilter: ["aria-expanded"] });
  });
  await row.dblclick();
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(row).toHaveAttribute("data-expansion-changes", "0");
});

test("keeps folder icons upright and navigates workspace rows with the keyboard", async ({ appPage: page }) => {
  const folderName = `Keyboard ${Date.now()}`;
  const path = `seed/${folderName}`;
  const folder = await page.request.post("/api/resources", {
    data: { kind: "folder", path: "seed", name: folderName },
  });
  expect(folder.status()).toBe(201);
  const ids: string[] = [];
  for (const name of ["First note", "Second note"]) {
    const response = await page.request.post("/api/resources", {
      data: { kind: "text", path, name, content: "Keyboard navigation" },
    });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).properties.id);
  }
  await page.goto("/app/workspace?path=seed");
  const toggle = page.getByTestId(`workspace-folder-toggle-${path}`);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await toggle.evaluate((element) => getComputedStyle(element.querySelector("svg")!).transform)).toBe("none");
  await toggle.press("ArrowRight");
  const first = page.getByTestId(`workspace-resource-open-${ids[0]}`);
  const second = page.getByTestId(`workspace-resource-open-${ids[1]}`);
  await expect(first).toBeFocused();
  await first.press("ArrowDown");
  await expect(second).toBeFocused();
  await second.press("ArrowUp");
  await expect(first).toBeFocused();
  await first.press("ArrowLeft");
  await expect(toggle).toBeFocused();
  await toggle.press("ArrowLeft");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(first).toBeHidden();
  await toggle.press("ArrowRight");
  await expect(first).toBeVisible();
  await toggle.press("Tab");
  await expect(first).toBeFocused();
  await first.press("Enter");
  await expect(page.getByTestId("resource-presentation-text-edit")).toBeVisible();
});

test("schedules newly prepared proposals and open questions without reloading their business", async ({
  appPage: page,
}) => {
  const meetingsResponse = await page.request.get("/api/council-meetings");
  const meetings = (await meetingsResponse.json()).entities.map(
    (entry: { properties: { id: string; startedAt: string | null } }) => entry.properties,
  );
  const meeting = meetings.find((entry: { startedAt: string | null }) => !entry.startedAt);
  expect(meeting).toBeTruthy();
  let representation = await (await page.request.get(`/api/council-meetings/${meeting.id}`)).json();
  const reopening = representation.actions.find((action: { name: string }) => action.name === "meeting.reopen-agenda");
  if (reopening) {
    expect((await page.request.post(reopening.href, { data: {} })).ok()).toBeTruthy();
    representation = await (await page.request.get(`/api/council-meetings/${meeting.id}`)).json();
  }
  expect(
    representation.actions.some((action: { name: string }) => action.name === "agenda-item.schedule-prepared"),
  ).toBe(true);
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Prepared subjects ${Date.now()}`, reportName: "Report", reportContent: "" },
  });
  expect(created.status()).toBe(201);
  const business = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  for (const kind of ["councilDecisionProposal", "openQuestion"] as const) {
    await page.getByTestId(`business-category-${kind}-open`).click({ button: "right" });
    await page.getByTestId(`workspace-context-create-${kind}`).click();
    await page.getByTestId("workspace-create-name").fill(`Prepared ${kind}`);
    const pending = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/prepared-subjects"),
    );
    await page.getByTestId("workspace-create-submit").click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const subject = (await response.json()).properties;
    await page.getByTestId(`business-subject-${subject.id}-open`).click({ button: "right" });
    await page.getByTestId(`business-subject-rename-${subject.id}`).click();
    await page.getByTestId(`business-subject-rename-${subject.id}-name`).fill(`Renamed ${kind}`);
    await page.getByTestId(`business-subject-rename-${subject.id}-submit`).click();
    await expect(page.getByTestId(`business-subject-rename-${subject.id}-dialog`)).toBeHidden();
    await expect(page.getByTestId(`business-subject-${subject.id}-open`)).toHaveText(`Renamed ${kind}`);

    await page.getByTestId(`business-subject-${subject.id}-toggle`).click();
    await expect(page.getByTestId(`business-inline-resource-${subject.textResourceId}`)).toBeVisible();
    await page.getByTestId(`business-subject-${subject.id}-open`).click({ button: "right" });
    const schedule = page.getByTestId(`business-subject-schedule-${subject.id}`);
    await expect(schedule).toBeEnabled();
    await schedule.click();
    await page.getByTestId("business-meeting-select").click();
    await page
      .getByTestId("business-meeting-select-search-result")
      .and(page.locator(`[data-reference-id="${meeting.id}"]`))
      .click();
    const scheduled = page.waitForResponse(
      (result) => result.request().method() === "POST" && result.url().endsWith("/agenda-items/from-prepared"),
    );
    await page.getByTestId(`business-schedule-subject-${subject.id}`).click();
    const scheduledResponse = await scheduled;
    expect(scheduledResponse.status()).toBe(201);
    const occurrence = (await scheduledResponse.json()).properties;
    expect(occurrence.subject).toMatchObject({ kind, id: subject.id });
    expect(occurrence.councilMeetingId).toBe(meeting.id);
    await expect(page.getByTestId("business-schedule-dialog")).toBeHidden();
    await expect(page.getByTestId(`business-subject-occurrence-${occurrence.id}`)).toBeVisible();
    await expect(page.getByTestId(`business-subject-occurrence-${occurrence.id}-toggle`)).toHaveCount(0);
    const candidates = await (
      await page.request.get(`/api/council-business/prepared-subjects?councilMeetingId=${meeting.id}`)
    ).json();
    expect(
      candidates.entities.some((entry: { properties: { id: string } }) => entry.properties.id === subject.id),
    ).toBe(false);
    if (kind === "openQuestion")
      await expect(page.getByTestId(`business-subject-decisions-${subject.id}`)).toHaveCount(0);
    await page.getByTestId(`business-subject-${subject.id}-open`).click({ button: "right" });
    await expect(page.getByTestId(`business-subject-schedule-unavailable-${subject.id}`)).toBeVisible();
    await expect(schedule).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("creates a documentary resource from a business and preserves its explicit association", async ({
  appPage: page,
}) => {
  await page.goto("/app/workspace?path=seed");
  await page.getByTestId("workspace-create-menu").click();
  await page.getByTestId("workspace-create-councilMatter").click();
  await page.getByTestId("workspace-create-name").fill(`Documentary creation ${Date.now()}`);
  const businessCreated = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/api/council-business"),
  );
  await page.getByTestId("workspace-create-submit").click();
  const businessResponse = await businessCreated;
  expect(businessResponse.status()).toBe(201);
  const business = (await businessResponse.json()).properties as { id: string };
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  const name = "Explicitly associated note";
  await page.getByTestId("business-create-documents").click();
  await page.getByTestId("workspace-create-text").click();
  await page.getByTestId("workspace-create-name").fill(name);
  const resourceCreated = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
  );
  await page.getByTestId("workspace-create-submit").click();
  const resourceResponse = await resourceCreated;
  expect(resourceResponse.request().postDataJSON()).toMatchObject({ councilBusinessId: business.id, kind: "text" });
  expect(resourceResponse.status()).toBe(201);
  const resource = (await resourceResponse.json()).properties as { id: string };
  await expect(page.getByTestId("resource-preview-close")).toBeVisible();
  await page.getByTestId("resource-preview-close").click();
  await page.reload();
  const attached = page.getByTestId(`business-attached-resource-${resource.id}`);
  await expect(attached).toBeVisible();
  await expect(attached).toContainText(name);
  await page.getByTestId(`business-attached-resource-${resource.id}-toggle`).click();
  await expect(page.getByTestId("resource-presentation-text-edit")).toBeVisible();
  await expect(page.getByTestId(`business-inline-resource-${resource.id}`)).toBeVisible();
  await page.getByTestId("business-category-documents-open").click({ button: "right" });
  await page.getByTestId("business-context-attach").click();
  await expect(page.getByTestId("resource-picker-panel")).toBeVisible();
  await page.getByTestId("resource-picker-search").fill("note");
  await expect(page.getByTestId("resource-picker-search")).toBeFocused();
  await page.getByTestId("resource-picker-search").press("Escape");
  await expect(page.getByTestId("resource-picker-panel")).toBeHidden();
});

async function createInCurrentFolder(page: import("@playwright/test").Page, kind: "folder" | "text", name: string) {
  await page.getByTestId("workspace-tree-root").click({ button: "right" });
  await page.getByTestId("workspace-tree-create").press("ArrowRight");
  await page.getByTestId(`workspace-tree-create-${kind}`).press("Enter");
  const input = page.getByTestId(
    kind === "folder" ? "workspace-tree-create-folder-input" : "workspace-tree-create-input",
  );
  await expect(input).toBeVisible();
  await input.fill(name);
  const creation = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
  );
  await input.press("Enter");
  const response = await creation;
  expect(response.status()).toBe(201);
  return (await response.json()) as { properties: { id: string; slug: string } };
}

async function dragWorkspaceItem(page: import("@playwright/test").Page, sourceTestId: string, targetTestId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const source = page.getByTestId(sourceTestId);
  const target = page.getByTestId(targetTestId);
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

test("persists the complete multi-sheet Univer workbook without concurrent saves", async ({ appPage: page }) => {
  test.setTimeout(45_000);
  const resourcesResponse = await page.request.get("/api/resources?path=seed");
  expect(resourcesResponse.ok()).toBeTruthy();
  const resources = (await resourcesResponse.json()) as {
    entities: Array<{ properties: { id: string; kind: string; name: string; path: string } }>;
  };
  const spreadsheet = resources.entities.find(
    ({ properties }) =>
      properties.kind === "spreadsheet" && properties.name === "Ressource tableur" && properties.path === "seed",
  )?.properties;
  expect(spreadsheet).toBeTruthy();
  const original = await page.request.get(`/api/resources/${spreadsheet!.id}`);
  expect(original.ok()).toBeTruthy();
  const source = (await original.json()).properties;
  const created = await page.request.post("/api/resources", {
    data: {
      kind: "spreadsheet",
      path: "seed",
      name: `Concurrent workbook ${crypto.randomUUID()}`,
      document: source.document,
    },
  });
  expect(created.status()).toBe(201);
  const resourceId = (await created.json()).properties.id;

  const putBodies: Array<{
    kind: "spreadsheet";
    expectedVersion: number;
    document: {
      workbook: {
        sheetOrder: string[];
        sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>;
      };
    };
  }> = [];
  let signalFirstSaveStarted: (() => void) | undefined;
  let releaseFirstSave: (() => void) | undefined;
  const firstSaveStarted = new Promise<void>((resolve) => {
    signalFirstSaveStarted = resolve;
  });
  const firstSaveReleased = new Promise<void>((resolve) => {
    releaseFirstSave = resolve;
  });
  await page.goto(`/app/workspace?path=seed&resource=${resourceId}`);
  const grid = page.getByTestId("spreadsheet-grid");
  await expect(grid).toBeVisible({ timeout: 15_000 });
  await expect(grid).toHaveAttribute("aria-readonly", "false");
  await page.waitForTimeout(1_500);
  await page.route("**/api/resources/*/content", async (route) => {
    if (route.request().method() !== "PUT" || route.request().postDataJSON().kind !== "spreadsheet") {
      await route.continue();
      return;
    }
    putBodies.push(route.request().postDataJSON());
    if (putBodies.length === 1) {
      signalFirstSaveStarted?.();
      await firstSaveReleased;
    }
    const response = await route.fetch();
    await route.fulfill({ response });
  });

  const editActiveCell = async (value: string) => {
    await page.keyboard.press("F2");
    await page.waitForTimeout(50);
    await page.keyboard.insertText(value);
    await page.keyboard.press("Enter");
  };

  await grid.click({ position: { x: 100, y: 265 } });
  await editActiveCell("Première sauvegarde");
  await firstSaveStarted;
  const firstNextAddress = await grid
    .locator("input")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value).find((value) => /^A\d+$/.test(value)),
    );
  const firstRow = Number(firstNextAddress?.slice(1)) - 2;
  expect(putBodies[0]!.document.workbook.sheets.budget?.cellData[String(firstRow)]?.["0"]?.v).toBe(
    "Première sauvegarde",
  );

  await editActiveCell("Dernière sauvegarde");
  const secondNextAddress = await grid
    .locator("input")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value).find((value) => /^A\d+$/.test(value)),
    );
  const secondRow = Number(secondNextAddress?.slice(1)) - 2;
  await page.waitForTimeout(1_200);
  expect(putBodies).toHaveLength(1);
  await page.getByTestId("workspace-breadcrumb-close").click();
  await expect(page.getByTestId("spreadsheet-grid")).toBeVisible();

  releaseFirstSave?.();
  await expect.poll(() => putBodies.length).toBe(2);
  await expect(page.getByTestId("spreadsheet-grid")).toHaveCount(0);

  const finalWorkbook = putBodies[1]!.document.workbook;
  expect(finalWorkbook.sheetOrder).toEqual(["budget", "hypotheses"]);
  expect(finalWorkbook.sheets.budget?.cellData[String(firstRow)]?.["0"]?.v).toBe("Première sauvegarde");
  expect(finalWorkbook.sheets.budget?.cellData[String(secondRow)]?.["0"]?.v).toBe("Dernière sauvegarde");
  expect(finalWorkbook.sheets.hypotheses?.cellData["1"]?.["0"]?.v).toBe("Taux de TVA");

  await page.goto(`/app/workspace?path=seed&resource=${resourceId}`);
  await expect(page.getByTestId("spreadsheet-grid")).toBeVisible({ timeout: 15_000 });
  const detailsResponse = await page.request.get(`/api/resources/${resourceId}`);
  expect(detailsResponse.ok()).toBeTruthy();
  const details = (await detailsResponse.json()) as {
    properties: { document: { workbook: typeof finalWorkbook } };
  };
  expect(details.properties.document.workbook).toMatchObject(finalWorkbook);
});

test("imports a CSV file as an editable spreadsheet resource", async ({ appPage: page }) => {
  await page.goto("/app/workspace?path=seed");
  await page.getByTestId("workspace-tree-root").click({ button: "right" });
  await page.getByTestId("workspace-tree-create").press("ArrowRight");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("workspace-tree-import-file").press("Enter");
  const fileChooser = await fileChooserPromise;
  const importResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/resources/spreadsheets/import"),
  );
  await fileChooser.setFiles({
    name: "suivi-budgetaire.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Poste;Quantité;Montant\nMobilier;2;150\nTotal;;;=SUM(C2:C2)\n", "utf8"),
  });

  const importResponse = await importResponsePromise;
  expect(importResponse.status()).toBe(201);
  const importedRepresentation = (await importResponse.json()) as {
    properties: { id: string; kind: string; name: string; path: string };
  };
  expect(importedRepresentation.properties).toMatchObject({
    kind: "spreadsheet",
    name: "suivi-budgetaire",
    path: "seed",
  });
  await expect(page.getByTestId("spreadsheet-grid")).toBeVisible();

  const detailsResponse = await page.request.get(`/api/resources/${importedRepresentation.properties.id}`);
  expect(detailsResponse.ok()).toBeTruthy();
  const details = (await detailsResponse.json()) as {
    properties: {
      document: {
        workbook: {
          sheetOrder: string[];
          sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown; f?: string }>> }>;
        };
      };
    };
  };
  const workbook = details.properties.document.workbook;
  const importedSheet = workbook.sheets[workbook.sheetOrder[0]];
  expect(importedSheet.cellData[1][0].v).toBe("Mobilier");
  expect(importedSheet.cellData[1][2].v).toBe(150);
  expect(importedSheet.cellData[2][3].f).toBe("=SUM(C2:C2)");
});

test.describe("workspace explorer", () => {
  test("creates, autosaves, renames, moves, searches and deletes a text resource", async ({ appPage: page }) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const folderName = `validation-${suffix}`;
    const initialName = `note-${suffix}`;
    const renamedName = `note-renommee-${suffix}`;
    const content = `Contenu autosauvegarde ${suffix}`;

    await page.goto("/app/workspace?path=seed");
    await createInCurrentFolder(page, "folder", folderName);
    const created = (await createInCurrentFolder(page, "text", initialName)).properties;

    await page.getByTestId(`workspace-resource-open-${created.id}`).click();
    const editor = page.getByTestId("markdown-editor-compact").getByTestId("editor-writing-area");
    await editor.fill(content);
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/resources/${created.id}`);
        const body = (await response.json()) as { properties: { content?: string } };
        return body.properties.content;
      })
      .toBe(content);

    await page.getByTestId("workspace-workbench-rename").click();
    await page.getByTestId("workspace-workbench-title-input").fill(renamedName);
    await page.getByTestId("workspace-workbench-title-input").press("Enter");
    await expect(page.getByTestId("resource-workbench")).toContainText(renamedName);
    await page.getByTestId("workspace-breadcrumb-close").click();

    const relocation = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith(`/${created.slug}/location`),
    );
    await dragWorkspaceItem(page, `workspace-resource-${created.id}`, `workspace-folder-seed/${folderName}`);
    expect((await relocation).ok()).toBeTruthy();

    const movedResponse = await page.request.get(`/api/resources/${created.id}`);
    expect(movedResponse.ok()).toBeTruthy();
    await expect(movedResponse.json()).resolves.toMatchObject({
      properties: { path: `seed/${folderName}`, name: renamedName, content },
    });

    const renamedFolder = `${folderName}-renomme`;
    await page.getByTestId(`workspace-folder-name-seed/${folderName}`).click({ button: "right" });
    await page.getByTestId("workspace-tree-rename").click();
    await page.getByTestId("workspace-tree-rename-input").fill(renamedFolder);
    await page.getByTestId("workspace-tree-rename-input").press("Enter");
    await expect(page.getByTestId(`workspace-folder-name-seed/${renamedFolder}`)).toBeVisible();
    // Renaming the containing folder must retain its loaded children in the current tree.
    await expect(page.getByTestId(`workspace-resource-open-${created.id}`)).toBeVisible();
    await page.getByTestId(`workspace-resource-open-${created.id}`).click();
    const lastEdit = `${content}, avant fermeture`;
    await page.getByTestId("markdown-editor-compact").getByTestId("editor-writing-area").fill(lastEdit);
    // Close before the debounce expires: the pending content must be flushed first.
    await page.getByTestId("workspace-breadcrumb-close").click();
    await expect(page.getByTestId("resource-workbench")).toHaveCount(0);
    const savedOnClose = await page.request.get(`/api/resources/${created.id}`);
    await expect(savedOnClose.json()).resolves.toMatchObject({
      properties: { path: `seed/${renamedFolder}`, content: lastEdit },
    });

    await page.getByTestId("workspace-search-input").fill(renamedName);
    const hit = page.getByTestId("workspace-search-result").filter({ hasText: renamedName });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.getByTestId("resource-workbench")).toContainText(renamedName);

    const deletion = page.waitForResponse(
      (response) => response.request().method() === "DELETE" && response.url().endsWith(`/${created.slug}`),
    );
    await page.getByTestId("resource-delete").click();
    expect((await deletion).ok()).toBeTruthy();
    await expect.poll(async () => (await page.request.get(`/api/resources/${created.id}`)).status()).toBe(404);
  });

  test("shows council work in the complete folder tree without inventing lifecycle state", async ({ appPage: page }) => {
    const name = `Recent council work ${Date.now()}`;
    const response = await page.request.post("/api/council-business", {
      data: { path: "seed", name, reportName: "Report", reportContent: "Work in preparation" },
    });
    expect(response.status()).toBe(201);
    const { properties: business } = (await response.json()) as { properties: { id: string } };
    await page.goto("/app/workspace");
    const row = page.getByTestId(`workspace-business-open-${business.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(name);
    const agenda = await page.request.get(`/api/council-business/agenda-items?councilBusinessId=${business.id}`);
    expect(agenda.ok()).toBeTruthy();
    expect((await agenda.json()).entities).toEqual([]);
    await expect(page.getByTestId("workspace-folder-toggle-seed")).toBeVisible();

    const meetings = await page.request.get("/api/council-meetings");
    const meeting = (await meetings.json()).entities
      .map(
        (entry: { properties: { id: string; closedAt: string | null; startedAt: string | null } }) => entry.properties,
      )
      .find((entry: { closedAt: string | null; startedAt: string | null }) => !entry.closedAt && !entry.startedAt);
    expect(meeting).toBeTruthy();
    for (const [index, kind] of ["council-decision-proposals", "open-questions"].entries()) {
      const scheduled = await page.request.post(`/api/council-business/${business.id}/agenda-items/${kind}`, {
        data: { councilMeetingId: meeting.id, position: 80 + index },
      });
      expect(scheduled.status()).toBe(201);
    }
    const scheduledAgenda = await page.request.get(
      `/api/council-business/agenda-items?councilBusinessId=${business.id}`,
    );
    const items = (await scheduledAgenda.json()).entities.map(
      (entry: { properties: { id: string; position: number; agendaNumber: number } }) => entry.properties,
    );
    await page.reload();
    await expect(row).toBeVisible();
    for (const item of items) {
      expect(item.agendaNumber).toBeGreaterThan(0);
      expect(item.agendaNumber).toBeLessThan(item.position);
    }
    await row.dblclick();
    await expect(page.getByTestId("council-business-workbench")).toContainText(name);
  });

  test("presents one filtered tree and previews documents directly", async ({ appPage: page }) => {
    await page.goto("/app/workspace?path=finances");
    const document = page
      .locator('[data-testid^="workspace-resource-open-"]')
      .filter({ hasText: "Compte administratif 2025" });

    await expect(page.getByTestId("workspace-view-all")).toHaveAttribute("aria-pressed", "true");
    await expect(document).toBeVisible();
    const business = page.locator('[data-testid^="workspace-business-open-"]').first();
    await expect(business).toBeVisible();
    await expect(business.locator('[data-testid^="workspace-business-lifecycle-"]')).toBeVisible();
    await expect(business).not.toContainText("pièce");
    await expect(document.locator('[data-testid^="workspace-resource-metadata-"]')).toContainText("PDF");
    await expect(document.locator('[data-testid^="workspace-resource-metadata-"]')).toContainText(
      /\d{2}\/\d{2}\/\d{4}/,
    );
    await expect(page.locator(".workspace-explorer-count")).toHaveCount(0);
    await expect(page.locator(".workspace-tree-count")).toHaveCount(0);

    await page.getByTestId("workspace-view-resources").click();
    await expect(page.locator('[data-testid^="workspace-business-open-"]')).toHaveCount(0);
    await expect(document).toBeVisible();

    await page.getByTestId("workspace-view-all").click();
    await page.getByTestId("workspace-tree-filter").fill("Compte administratif 2025");
    await expect(document).toBeVisible();
    await expect(page.locator('[data-testid^="workspace-resource-open-"]')).toHaveCount(1);

    await document.click();
    await expect(page.getByTestId("resource-workbench")).toBeVisible();
    await expect(page.getByTestId("resource-workbench-object")).toBeVisible();
    await page.getByTestId("workspace-breadcrumb-close").click();
    await expect(page.getByTestId("resource-workbench")).toHaveCount(0);
  });
});

test("composes an agenda from workspace business with an explicit voting purpose", async ({ appPage: page }) => {
  test.setTimeout(90_000);
  const meetingResponse = await page.request.get("/api/council-meetings");
  const meetingBody = await meetingResponse.json();
  const meeting = meetingBody.entities
    .map((entry: { properties: { id: string; slug: string; startedAt: string | null } }) => entry.properties)
    .find((entry: { startedAt: string | null }) => !entry.startedAt);
  expect(meeting).toBeTruthy();

  for (const kind of ["councilDecisionProposal", "openQuestion"] as const) {
    const name = `Agenda composition ${kind} ${Date.now()}`;
    await page.goto("/app/workspace?path=seed");
    await page.getByTestId("workspace-tree-root").click({ button: "right" });
    await page.getByTestId("workspace-tree-create").press("ArrowRight");
    await page.getByTestId("workspace-tree-create-business").press("Enter");
    const input = page.getByTestId("workspace-tree-create-input");
    await expect(input).toBeVisible();
    await input.fill(name);
    const creation = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/api/council-business"),
    );
    await input.press("Enter");
    const response = await creation;
    expect(response.status()).toBe(201);
    const business = (await response.json()).properties;
    await expect(input).toBeHidden();
    await page.getByTestId(`workspace-business-open-${business.id}`).dblclick();
    await page.getByTestId(kind === "openQuestion" ? "business-subject-question" : "business-subject-proposal").check();
    await page.getByTestId("business-meeting-select").click();
    await page
      .getByTestId("business-meeting-select-search-result")
      .and(page.locator(`[data-reference-id="${meeting.id}"]`))
      .click();
    await page.getByTestId("business-schedule").click();
    await expect(page.getByTestId("business-scheduled-kind")).toBeVisible();
    await expect(page.getByTestId("business-scheduled-kind")).toContainText(
      kind === "openQuestion" ? "Without a vote" : "Subject to a vote",
    );
    await expect(page.getByTestId("business-edit-hint")).toContainText("Editable");
    await expect(page.getByTestId("business-report-editor")).toBeVisible();
    await expect(page.getByTestId("business-report-save")).toHaveCount(0);
    await expect(page.getByTestId("business-proposal-save")).toHaveCount(0);
    const agendaResponse = await page.request.get(
      `/api/council-business/agenda-items?councilBusinessId=${business.id}`,
    );
    const agenda = (await agendaResponse.json()).entities.map((entry: { properties: unknown }) => entry.properties);
    expect(agenda).toHaveLength(1);
    expect(agenda[0].subject.kind).toBe(kind);
    expect(agenda[0].councilMeetingId).toBe(meeting.id);
    if (kind === "councilDecisionProposal") {
      expect(agenda[0].subject.textResourceId).not.toBe(business.reportResourceId);
      await page
        .getByTestId("business-proposal-editor")
        .getByTestId("editor-writing-area")
        .fill("The council approves the proposed project.");
      await expect
        .poll(async () => {
          const resource = await page.request.get(`/api/resources/${agenda[0].subject.textResourceId}`);
          return (await resource.json()).properties.content;
        })
        .toContain("The council approves");
      await page.reload();
      await expect(page.getByTestId("business-proposal-editor")).toContainText("The council approves");
      await page.route(`**/api/resources/${agenda[0].subject.textResourceId}`, async (route) => {
        const resourceResponse = await route.fetch();
        const representation = await resourceResponse.json();
        representation.actions = representation.actions.filter(
          (action: { name: string }) => !["resource.update-content", "resource.update-metadata"].includes(action.name),
        );
        await route.fulfill({
          response: resourceResponse,
          contentType: resourceResponse.headers()["content-type"],
          json: representation,
        });
      });
      await page.reload();
      await expect(page.getByTestId("business-proposal-readonly")).toContainText("The council approves");
      await expect(page.getByTestId("business-proposal-editor").getByTestId("editor-writing-area")).toHaveCount(0);
      await expect(page.getByTestId("business-proposal-save")).toHaveCount(0);
      await page.unroute(`**/api/resources/${agenda[0].subject.textResourceId}`);
    } else {
      await expect(page.getByTestId("business-proposal-editor")).toBeHidden();
    }
    await page.getByTestId("business-meeting-link").click();
    await expect(page.getByTestId(`agenda-item-expand-${agenda[0].id}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-item-position-${agenda[0].id}`)).toHaveText(String(agenda[0].agendaNumber));
    await page.goto("/app/workspace");
    await expect(page.getByTestId(`workspace-business-open-${business.id}`)).toBeVisible();
  }
});

test("renders TXT literally and converted Markdown with bounded embedded images", async ({
  appPage: page,
}, testInfo) => {
  const literal = "# Un titre littéral\n\n  deux espaces\n- une ligne\n<b>aucun HTML</b>";
  const upload = await page.request.post("/api/resources/documents", {
    multipart: { path: "seed", file: { name: "lecture.txt", mimeType: "text/plain", buffer: Buffer.from(literal) } },
  });
  expect(upload.status()).toBe(201);
  const resource = (await upload.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  const preview = page.getByTestId("resource-workbench-object");
  await expect(preview.locator("pre")).toHaveText(literal, { useInnerText: false });
  expect(await preview.locator("pre").textContent()).toBe(literal);
  await expect(preview.locator("h1,b")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("literal-text.png"), fullPage: true });
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH3sAAAAASUVORK5CYII=";
  const markdown = `# Rapport\n\n- Premier\n- Second\n\n<table><tr><th>Objet</th><th>Montant</th></tr><tr><td>Travaux</td><td>12</td></tr></table>\n\n![plan](${png})\n\n![externe](https://example.invalid/image.png)\n\n<img src="data:image/svg+xml;base64,PHN2Zy8+"/><span style="background:url(https://example.invalid/style.png)">Fin</span>`;
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.invalid")) external.push(request.url());
  });
  await page.route(`**/api/resources/${resource.id}`, async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    for (const link of value.links ?? []) if (link.rel.includes("preview")) link.type = "text/markdown; charset=utf-8";
    await route.fulfill({ response, contentType: "application/vnd.siren+json", body: JSON.stringify(value) });
  });
  await page.route("**/api/resources/*/preview", (route) =>
    route.fulfill({ contentType: "text/markdown; charset=utf-8", body: markdown }),
  );
  await page.reload();
  await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Rapport");
  await expect(preview.locator("li")).toHaveCount(2);
  await expect(preview.locator("table")).toContainText("Travaux");
  await expect(preview.locator("img")).toHaveCount(1);
  await expect(preview.locator("img")).toHaveAttribute("src", png);
  expect(external).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("converted-markdown.png"), fullPage: true });
});

test("previews a real DOCX as Markdown without an office service", async ({ appPage: page }, testInfo) => {
  const buffer = await readFile(
    new URL("../../../server/src/__tests__/fixtures/document-preview.docx", import.meta.url),
  );
  const upload = await page.request.post("/api/resources/documents", {
    multipart: {
      path: "seed",
      file: {
        name: "deliberation.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer,
      },
    },
  });
  expect(upload.status()).toBe(201);
  const resource = (await upload.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  const preview = page.getByTestId("resource-workbench-object");
  await expect(preview.getByRole("heading").first()).toHaveText("Délibération du conseil");
  await expect(preview).toContainText("13 juillet 2026");
  await expect(preview.locator("li")).toHaveCount(2);
  await expect(preview.locator("table")).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("real-docx.png"), fullPage: true });
});

test("shows one dismissible deletion refusal and preserves the linked document", async ({ appPage: page }) => {
  const upload = await page.request.post("/api/resources/documents", {
    multipart: {
      path: "seed",
      file: {
        name: `protected-${crypto.randomUUID()}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from("Document à conserver"),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const document = (await upload.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${document.id}`);
  await expect(page.getByTestId("resource-delete")).toBeVisible();
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Protection ${crypto.randomUUID()}`, reportName: "Rapport", reportContent: "" },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties;
  const associated = await page.request.post(`/api/council-business/${business.id}/resources`, {
    data: { resourceId: document.id },
  });
  expect(associated.ok()).toBeTruthy();
  const second = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Second protection ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(second.ok()).toBeTruthy();
  const secondBusiness = (await second.json()).properties;
  expect(
    (
      await page.request.post(`/api/council-business/${secondBusiness.id}/resources`, {
        data: { resourceId: document.id },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByTestId("resource-delete").click();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByTestId("resource-workbench").getByRole("alert")).toBeVisible();
  await mkdir("/tmp/hall-document-delete", { recursive: true });
  await page.getByTestId("request-error-dismiss").scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: "/tmp/hall-document-delete/refusal.png" });
  await page.getByTestId("request-error-dismiss").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await page.request.get(`/api/resources/${document.id}`)).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId("resource-workbench")).toBeVisible();
  await expect(page.getByTestId("resource-delete")).toHaveCount(0);
});

test("deletes a geographic document from its editable business", async ({ appPage: page }) => {
  const created = await page.request.post("/api/council-business", {
    data: {
      path: "seed",
      name: `Delete location ${crypto.randomUUID()}`,
      reportName: "Report",
      reportContent: "Keep report",
    },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties;
  const added = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Location ${crypto.randomUUID()}`, path: "seed", councilBusinessId: business.id },
  });
  expect(added.ok()).toBeTruthy();
  const resource = (await added.json()).properties;
  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  const row = page.getByTestId(`business-attached-resource-${resource.id}`);
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  await page.getByTestId(`business-document-delete-${resource.id}`).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/resources/${resource.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/council-business/${business.id}`)).ok()).toBeTruthy();
});

test("finds attached documents in the business report reference search", async ({ appPage: page }) => {
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `References ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties;
  const name = `Attached reference ${crypto.randomUUID()}`;
  const added = await page.request.post("/api/resources", {
    data: { kind: "geographic", name, path: "seed", councilBusinessId: business.id },
  });
  expect(added.ok()).toBeTruthy();
  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  await page.getByTestId("business-report-editor").getByTestId("editor-insert-reference").click();
  const search = page.getByTestId("reference-search-dialog");
  await search.getByTestId("reference-search-input").fill(name);
  await expect(search.getByTestId("reference-search-result")).toHaveCount(1);
  await expect(search.getByTestId("reference-search-result")).toContainText(name);
});

test("prioritizes business documents and inserts maps and text from the compact editor", async ({ appPage: page }) => {
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Insertion ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties;
  const attached: { id: string; name: string }[] = [];
  for (const kind of ["geographic", "text"] as const) {
    const response = await page.request.post("/api/resources", {
      data: {
        kind,
        name: `ZZ attached ${kind} ${crypto.randomUUID()}`,
        path: "seed",
        councilBusinessId: business.id,
        ...(kind === "text" ? { content: "Attached text" } : {}),
      },
    });
    expect(response.ok()).toBeTruthy();
    attached.push((await response.json()).properties);
  }
  const outsideResponse = await page.request.post("/api/resources", {
    data: { kind: "text", name: `AA outside ${crypto.randomUUID()}`, path: "seed", content: "Outside text" },
  });
  expect(outsideResponse.ok()).toBeTruthy();
  const outside = (await outsideResponse.json()).properties;
  const additional: { id: string; name: string; presentation: string }[] = [];
  for (const entry of [
    { kind: "remote", target: { kind: "url", url: "https://example.org" }, presentation: "link" },
    {
      kind: "event",
      document: {
        content: "Réunion de préparation",
        location: "Mairie",
        participants: [],
        schedule: { kind: "timed", start: "2026-09-11T10:00:00Z", end: "2026-09-11T11:00:00Z" },
      },
      presentation: "event",
    },
  ]) {
    const { presentation, ...data } = entry;
    const response = await page.request.post("/api/resources", {
      data: { ...data, name: `ZZZ ${entry.kind} ${crypto.randomUUID()}`, path: "seed", councilBusinessId: business.id },
    });
    expect(response.ok()).toBeTruthy();
    additional.push({ ...(await response.json()).properties, presentation });
  }
  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  const editor = page.getByTestId("business-report-editor");
  await editor.getByTestId("editor-insert-reference").click();
  const dialog = page.getByTestId("reference-search-dialog");
  await expect(dialog.getByTestId("reference-search-result").first()).toHaveAttribute(
    "data-reference-id",
    attached[0].id,
  );
  await expect(dialog.getByTestId("reference-search-result").nth(1)).toHaveAttribute(
    "data-reference-id",
    attached[1].id,
  );
  await dialog.getByTestId("reference-search-input").fill(outside.name);
  await expect(dialog.getByTestId("reference-search-result")).toHaveCount(1);
  await dialog.getByTestId("dialog-close").click();
  await editor.getByTestId("editor-writing-area").fill("@");
  await expect(page.getByTestId("editor-mention-result").first()).toHaveAttribute("data-reference-id", attached[0].id);
  await page.getByTestId("editor-mention-result").first().click();
  await expect(dialog).toHaveCount(0);
  await expect(editor.getByTestId("resource-embed-presentation-map")).toBeVisible();
  await editor.getByTestId("editor-writing-area").press("ArrowRight");
  await editor.getByTestId("editor-writing-area").press("End");
  await editor.getByTestId("editor-insert-reference").click();
  await dialog.getByTestId("reference-search-input").fill(attached[1].name);
  await dialog.getByTestId("reference-search-result").click();
  await expect(editor.getByTestId("resource-embed-presentation-map")).toBeVisible();
  await expect(editor.getByTestId("editor-writing-area")).toContainText("Attached text");
  for (const resource of additional) {
    await editor.getByTestId("editor-writing-area").press("ArrowRight");
    await editor.getByTestId("editor-writing-area").press("End");
    await editor.getByTestId("editor-insert-reference").click();
    await dialog.getByTestId("reference-search-input").fill(resource.name);
    await dialog.getByTestId("reference-search-result").click();
    await expect(editor.getByTestId(`resource-embed-presentation-${resource.presentation}`)).toBeVisible();
  }
  await editor.getByTestId("editor-open-enriched").click();
  const enriched = page.getByTestId("markdown-editor-enriched");
  await expect(enriched.getByTestId("resource-embed-presentation-map")).toBeVisible();
  await expect(enriched.getByTestId("resource-embed-presentation-text")).toContainText("Attached text");
  await expect(enriched.getByTestId("resource-embed-presentation-event")).toBeVisible();
});

// @verifies-requirement HALL-FR-WSP-240
test("HALL-FR-WSP-240 sidebar opens the council business instead of its folder", async ({ appPage: page }) => {
  const response = await page.request.get("/api/council-business/workspace-items");
  expect(response.ok()).toBeTruthy();
  const businesses = (await response.json()).entities.map(
    (entry: { properties: { id: string; folderPath: string; folderResourceId: string } }) => entry.properties,
  );
  const business =
    businesses.find((entry: { folderPath: string }) => entry.folderPath === "acces") ??
    businesses.find((entry: { folderPath: string }) => entry.folderPath);
  expect(business).toBeTruthy();
  const folderResponse = await page.request.get(`/api/resources/${business.folderResourceId}`);
  expect(folderResponse.ok()).toBeTruthy();
  const folder = (await folderResponse.json()).properties;
  await page.goto(`/app/workspace?${new URLSearchParams({ path: business.folderPath })}`);
  const link = page.getByTestId("workspace-sidebar-link").and(page.locator(`[data-path="${folder.fullPath}"]`));
  await expect(link).toHaveAttribute("data-kind", "councilBusiness");
  await expect(link.locator("svg")).toHaveCount(1);
  await expect(link.locator(".workspace-glyph")).toHaveCount(0);
  await link.click();
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`councilBusiness=${business.id}`));
  await expect(link).toHaveAttribute("aria-current", "page");
  const parent = page.getByTestId("workspace-sidebar-link").and(page.locator(`[data-path="${business.folderPath}"]`));
  await expect(parent).toHaveAttribute("data-kind", "folder");
  await expect(parent.locator("svg")).toHaveCount(1);
  await parent.click();
  await expect(page.getByTestId("council-business-workbench")).toBeHidden();
  expect(new URL(page.url()).searchParams.get("path")).toBe(business.folderPath);
  expect(new URL(page.url()).searchParams.has("councilBusiness")).toBe(false);
  await page.screenshot({ path: "/tmp/hall-sidebar-business.png" });
  await link.focus();
  await link.press("Enter");
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
});

// @verifies-requirement HALL-FR-WSP-250
// @verifies-requirement HALL-FR-WSP-260
test("HALL-FR-WSP-250 HALL-FR-WSP-260 demo folder is at root and document folders have readable names", async ({ appPage: page }) => {
  const response = await page.request.get("/api/resources/catalog");
  expect(response.ok()).toBeTruthy();
  const catalog = (await response.json()).entities.map((entry: { properties: { fullPath: string } }) => entry.properties);
  expect(catalog.find((entry: { fullPath: string }) => entry.fullPath === "acces")).toMatchObject({ path: "", kind: "folder" });
  const businessesResponse = await page.request.get("/api/council-business/workspace-items");
  expect(businessesResponse.ok()).toBeTruthy();
  const business = (await businessesResponse.json()).entities.map((entry: { properties: { id: string; folderPath: string } }) => entry.properties)
    .find((entry: { folderPath: string }) => entry.folderPath === "acces");
  expect(business).toBeTruthy();
  await page.goto(`/app/workspace?${new URLSearchParams({ path: business.folderPath, councilBusiness: business.id })}`);
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  // This linked document lives at the workspace root, one level above the business filing path.
  const parentFolder = page.getByTestId("business-document-folder-..");
  await expect(parentFolder).toBeVisible();
  await expect(parentFolder.getByTestId("business-document-folder-..-toggle")).toHaveAttribute("aria-label", "Workspace");
  await page.screenshot({ path: "/tmp/hall-workspace-root.png" });
});

// @verifies-requirement HALL-FR-WSP-270
test("HALL-FR-WSP-270 opens root documents from the shared explorer and returns to the root", async ({ appPage: page }) => {
  const response = await page.request.get("/api/resources/catalog");
  expect(response.ok()).toBeTruthy();
  const catalog = (await response.json()).entities.map(
    (entry: { properties: { id: string; path: string; fullPath: string; kind: string } }) => entry.properties,
  );
  const document = catalog.find((entry: { path: string; kind: string }) => entry.path === "" && entry.kind === "document");
  const folder = catalog.find(
    (entry: { fullPath: string; kind: string }) => entry.kind === "folder" && !entry.fullPath.includes("/"),
  );
  expect(document).toBeTruthy();
  expect(folder).toBeTruthy();
  await page.goto("/app/workspace");
  await expect(page.getByTestId("workspace-navigation-business-icon")).toBeVisible();
  await expect(page.getByTestId("workspace-root-business-icon")).toBeVisible();
  await expect(page.getByTestId("workspace-tree-root")).toContainText("Workspace");
  await expect(page.locator(".whome")).toHaveCount(0);
  await expect(page.getByTestId(`workspace-folder-toggle-${folder.fullPath}`)).toBeVisible();
  await page.getByTestId("workspace-view-resources").click();
  const row = page.getByTestId(`workspace-resource-open-${document.id}`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId("resource-workbench")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("resource")).toBe(document.id);
  await page.getByTestId("workspace-breadcrumb-close").click();
  await expect(page.getByTestId("resource-workbench")).toBeHidden();
  await expect(row).toBeVisible();
  expect(new URL(page.url()).searchParams.get("path") ?? "").toBe("");
  await page.screenshot({ path: "/tmp/hall-root-documents.png" });
});

// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC-030 web workbench previews a configured URL and edits it explicitly", async ({ appPage: page }) => {
  const initialUrl = "https://hall-preview.example/initial";
  const nextUrl = "https://hall-preview.example/updated";
  await page.route("https://hall-preview.example/**", (route) => route.fulfill({
    contentType: "text/html", body: '<main data-testid="external-site-content">Site web</main>',
  }));
  const created = await page.request.post("/api/resources", {
    data: { kind: "remote", name: `Web preview ${Date.now()}`, path: "", target: { kind: "url", url: initialUrl } },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  try {
    await page.goto(`/app/workspace?resource=${resource.id}`);
    const workbench = page.getByTestId("resource-workbench");
    await expect(workbench.getByTestId("remote-resource-frame")).toHaveAttribute("src", initialUrl);
    await expect(workbench.getByTestId("remote-resource-frame").contentFrame().getByTestId("external-site-content")).toBeVisible();
    await expect(workbench.getByTestId("resource-presentation-remote-edit")).toHaveCount(0);
    await workbench.getByTestId("remote-resource-edit").click();
    await expect(workbench.getByTestId("remote-resource-url-input")).toHaveValue(initialUrl);
    await workbench.getByTestId("remote-resource-url-input").fill(nextUrl);
    await workbench.getByTestId("remote-resource-save").click();
    await expect(workbench.getByTestId("resource-presentation-remote-edit")).toHaveCount(0);
    await expect(workbench.getByTestId("remote-resource-frame")).toHaveAttribute("src", nextUrl);
    await expect(workbench.getByTestId("remote-resource-open")).toHaveAttribute("href", nextUrl);
    await page.reload();
    await expect(workbench.getByTestId("remote-resource-frame")).toHaveAttribute("src", nextUrl);
    await expect(workbench.getByTestId("resource-presentation-remote-edit")).toHaveCount(0);
    await workbench.getByTestId("resource-open-extended").click();
    const preview = page.getByTestId("resource-preview");
    await expect(preview.getByTestId("remote-resource-frame")).toHaveAttribute("src", nextUrl);
    await expect(preview.getByTestId("resource-presentation-remote-edit")).toHaveCount(0);
    await preview.getByTestId("resource-preview-close").click();
    await expect(workbench.getByTestId("remote-resource-frame")).toHaveAttribute("src", nextUrl);
    await page.screenshot({ path: "/tmp/hall-web-workbench.png" });
  } finally {
    await page.goto("/app/workspace");
    const removed = await page.request.delete(`/api/resources/${resource.id}`);
    expect(removed.ok()).toBeTruthy();
  }
});
