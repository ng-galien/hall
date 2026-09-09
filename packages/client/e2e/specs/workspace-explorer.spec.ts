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
      element.setAttribute("data-expansion-changes", String(Number(element.getAttribute("data-expansion-changes")) + records.length));
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
  const folder = await page.request.post("/api/resources", { data: { kind: "folder", path: "seed", name: folderName } });
  expect(folder.status()).toBe(201);
  const ids: string[] = [];
  for (const name of ["First note", "Second note"]) {
    const response = await page.request.post("/api/resources", { data: { kind: "text", path, name, content: "Keyboard navigation" } });
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

test("schedules newly prepared proposals and open questions without reloading their business", async ({ appPage: page }) => {
  const meetingsResponse = await page.request.get("/api/council-meetings");
  const meetings = (await meetingsResponse.json()).entities.map((entry: { properties: { id: string; startedAt: string | null } }) => entry.properties);
  const meeting = meetings.find((entry: { startedAt: string | null }) => !entry.startedAt);
  expect(meeting).toBeTruthy();
  let representation = await (await page.request.get(`/api/council-meetings/${meeting.id}`)).json();
  const reopening = representation.actions.find((action: { name: string }) => action.name === "meeting.reopen-agenda");
  if (reopening) {
    expect((await page.request.post(reopening.href, { data: {} })).ok()).toBeTruthy();
    representation = await (await page.request.get(`/api/council-meetings/${meeting.id}`)).json();
  }
  expect(representation.actions.some((action: { name: string }) => action.name === "agenda-item.schedule-prepared")).toBe(true);
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
    const pending = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/prepared-subjects"));
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
    await page.getByTestId(`business-meeting-option-${meeting.id}`).click();
    const scheduled = page.waitForResponse((result) => result.request().method() === "POST" && result.url().endsWith("/agenda-items/from-prepared"));
    await page.getByTestId(`business-schedule-subject-${subject.id}`).click();
    const scheduledResponse = await scheduled;
    expect(scheduledResponse.status()).toBe(201);
    const occurrence = (await scheduledResponse.json()).properties;
    expect(occurrence.subject).toMatchObject({ kind, id: subject.id });
    expect(occurrence.councilMeetingId).toBe(meeting.id);
    await expect(page.getByTestId("business-schedule-dialog")).toBeHidden();
    await expect(page.getByTestId(`business-subject-occurrence-${occurrence.id}`)).toBeVisible();
    await expect(page.getByTestId(`business-subject-occurrence-${occurrence.id}-toggle`)).toHaveCount(0);
    const candidates = await (await page.request.get(`/api/council-business/prepared-subjects?councilMeetingId=${meeting.id}`)).json();
    expect(candidates.entities.some((entry: { properties: { id: string } }) => entry.properties.id === subject.id)).toBe(false);
    if (kind === "openQuestion") await expect(page.getByTestId(`business-subject-decisions-${subject.id}`)).toHaveCount(0);
  }
});

test("creates a documentary resource from a business and preserves its explicit association", async ({ appPage: page }) => {
  await page.goto("/app/workspace?path=seed");
  await page.getByTestId("workspace-create-menu").click();
  await page.getByTestId("workspace-create-councilMatter").click();
  await page.getByTestId("workspace-create-name").fill(`Documentary creation ${Date.now()}`);
  const businessCreated = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/council-business"));
  await page.getByTestId("workspace-create-submit").click();
  const businessResponse = await businessCreated;
  expect(businessResponse.status()).toBe(201);
  const business = (await businessResponse.json()).properties as { id: string };
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  const name = "Explicitly associated note";
  await page.getByTestId("business-create-documents").click();
  await page.getByTestId("workspace-create-text").click();
  await page.getByTestId("workspace-create-name").fill(name);
  const resourceCreated = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"));
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
    const hit = page.getByTestId("search-hit").filter({ hasText: renamedName });
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

  test("shows recently edited council work without inventing lifecycle state", async ({ appPage: page }) => {
    const name = `Recent council work ${Date.now()}`;
    const response = await page.request.post("/api/council-business", {
      data: { path: "seed", name, reportName: "Report", reportContent: "Work in preparation" },
    });
    expect(response.status()).toBe(201);
    const { properties: business } = (await response.json()) as { properties: { id: string } };
    await page.goto("/app/workspace");
    const row = page.getByTestId(`workspace-home-business-${business.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(name);
    const agenda = await page.request.get(`/api/council-business/agenda-items?councilBusinessId=${business.id}`);
    expect(agenda.ok()).toBeTruthy();
    expect((await agenda.json()).entities).toEqual([]);
    await expect(page.getByTestId("workspace-home-unscheduled")).toContainText(name);
    await expect(page.getByTestId("workspace-home-folder-seed")).toHaveCount(0);

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
    const group = page.getByTestId(`workspace-home-meeting-${meeting.id}`);
    await expect(group.getByTestId(`workspace-home-business-${business.id}`)).toHaveCount(1);
    for (const item of items) {
      await expect(group.getByTestId(`workspace-home-subject-${item.id}`)).toBeVisible();
      expect(item.agendaNumber).toBeGreaterThan(0);
      expect(item.agendaNumber).toBeLessThan(item.position);
    }
    await expect(group).toContainText("Draft decision");
    await expect(group).toContainText("Open question");
    await expect(page.getByTestId(`workspace-home-meeting-link-${meeting.id}`)).toBeVisible();
    await group.getByTestId(`workspace-home-business-${business.id}`).click();
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
    await page.goto("/app/workspace");
    await page.getByTestId(`workspace-home-business-${business.id}`).click();
    await page.getByTestId(kind === "openQuestion" ? "business-subject-question" : "business-subject-proposal").check();
    await page.getByTestId("business-meeting-select").click();
    await page.getByTestId(`business-meeting-option-${meeting.id}`).click();
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
    await expect(page.getByTestId(`workspace-home-business-${business.id}`)).toBeVisible();
  }
});
