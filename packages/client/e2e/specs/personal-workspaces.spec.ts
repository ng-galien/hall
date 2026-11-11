import { defaultDocumentTemplates } from "@hall/domain";
import { type APIRequestContext, type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { clearTestDatabase } from "../fixtures/application";
import { establishRevision, generateCurrentNotice } from "../fixtures/meetingPreparation";

const password = "Hall-personal-2026!";
const aliceFolder = "Espaces personnels/Alice Martin";
const workspaceAt = (path: string) => `/app/workspace?path=${encodeURIComponent(path)}`;

async function resourceProperties(page: Page, id: string) {
  const response = await page.request.get(`/api/resources/${id}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).properties as { slug: string; path: string; name: string; content?: string };
}

async function folderNames(page: Page, path: string) {
  const body = await (await page.request.get(`/api/resources?path=${encodeURIComponent(path)}`)).json();
  return (body.entities as Array<{ properties: { name: string } }>).map((entity) => entity.properties.name).sort();
}

async function importThroughMenu(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  route: string,
): Promise<string> {
  const response = page.waitForResponse(
    (candidate) => candidate.request().method() === "POST" && candidate.url().includes(route),
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("workspace-create-menu").click();
  await page.getByTestId("workspace-create-file").click();
  await (await chooser).setFiles(file);
  const created = await response;
  expect(created.status()).toBe(201);
  return ((await created.json()) as { properties: { id: string } }).properties.id;
}

async function createInCurrentFolder(page: Page, kind: "folder" | "text", name: string) {
  await expect(page.getByTestId("workspace-tree-root")).toHaveAttribute("data-state", "closed");
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
  expect((await creation).status()).toBe(201);
}

/** The dragged row is held as an element: a completed move may take it out of the tree before the drag ends. */
async function dragWorkspaceItem(page: Page, sourceTestId: string, targetTestId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const source = page.getByTestId(sourceTestId);
  const target = page.getByTestId(targetTestId);
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const dragged = await source.elementHandle();
  await dragged?.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await dragged?.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function dropSpreadsheet(page: Page, editor: Locator, name: string, content: string) {
  const area = editor.getByTestId("editor-writing-area");
  const transfer = await page.evaluateHandle(
    ({ name, content }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([content], name, { type: "text/csv" }));
      return dataTransfer;
    },
    { name, content },
  );
  await area.dispatchEvent("dragenter", { dataTransfer: transfer });
  const box = await area.boundingBox();
  await area.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: Math.round((box?.x ?? 0) + 30),
    clientY: Math.round((box?.y ?? 0) + 20),
  });
}

async function created<T>(response: Awaited<ReturnType<APIRequestContext["post"]>>): Promise<T> {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties as T;
}

async function sessionPage(browser: Browser, baseURL: string, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => localStorage.setItem("mairie.locale", "en"));
  const login = await context.request.post("/api/auth/login", { data: { email, password } });
  expect(login.status()).toBe(200);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

// Each journey bootstraps the first administrator of an empty Hall.
test.beforeEach(() => clearTestDatabase());

// @verifies-requirement HALL-FR-DIR-150
// @verifies-requirement HALL-FR-DIR-160
// @verifies-requirement HALL-FR-WSP-380
// @verifies-requirement HALL-FR-WSP-390
// @verifies-requirement HALL-FR-WSP-400
// @verifies-requirement HALL-FR-WSP-410
// @verifies-requirement HALL-FR-WSP-420
// @verifies-requirement HALL-FR-DOC-550
test("gives council members read access and a personal folder that only they and the clerk write in", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const origin = baseURL ?? "";
  admin.setDefaultTimeout(20_000);
  await admin.addInitScript(() => localStorage.setItem("mairie.locale", "en"));
  expect(
    (
      await admin.request.post("/api/auth/bootstrap", {
        data: { displayName: "Administrator", email: "admin@example.test", password },
      })
    ).status(),
  ).toBe(201);
  expect((await admin.request.put("/api/council-terms", { data: { expectedMemberCount: 5 } })).ok()).toBeTruthy();
  const member = async (firstName: string, lastName: string, role: "mayor" | "councillor") => {
    const contact = await created<{ id: string }>(
      await admin.request.post("/api/contacts", {
        data: { firstName, lastName, organizationName: null, jobTitle: null, email: null, phone: null, notes: "" },
      }),
    );
    const mandate = await created<{ id: string }>(
      await admin.request.post("/api/council-members", {
        data: { contactId: contact.id, role, termStartedOn: "2026-03-22" },
      }),
    );
    return { contactId: contact.id, memberId: mandate.id };
  };
  const account = async (email: string, roles: string[], contactId: string | null) =>
    created<{ id: string }>(
      await admin.request.post("/api/users", { data: { email, displayName: email, password, roles, contactId } }),
    );
  const mayor = await member("Marie", "Maire", "mayor");
  const alice = await member("Alice", "Martin", "councillor");
  const bruno = await member("Bruno", "Durand", "councillor");
  await created(await admin.request.post("/api/resources", { data: { kind: "folder", path: "", name: "Commun" } }));
  const commonText = await created<{ id: string }>(
    await admin.request.post("/api/resources", {
      data: { kind: "text", path: "Commun", name: "Note commune", content: "Texte commun" },
    }),
  );
  await account("bruno@example.test", ["councillor"], bruno.contactId);
  await account("clerk@example.test", ["clerk"], null);
  await account("contributor@example.test", ["contributor"], null);

  await test.step("an administrator creates a council member account linked to an elected member", async () => {
    await admin.goto("/app/users");
    await admin.getByTestId("users-add").click();
    await admin.getByTestId("user-display-name").fill("Alice Martin");
    await admin.getByTestId("user-email").fill("alice@example.test");
    await admin.getByTestId("user-password").fill(password);
    await admin.getByTestId("user-role-councillor").check();
    await expect(admin.getByTestId("user-councillor-contact-hint")).toBeVisible();
    await admin.getByTestId("user-create-submit").click();
    await expect(admin.getByTestId("user-create-form")).toContainText(
      "This role requires the contact of a council member with an active mandate.",
    );
    await admin.getByTestId("user-contact-select").click();
    await admin
      .getByTestId("user-contact-select-search-result")
      .and(admin.locator(`[data-reference-id="${alice.contactId}"]`))
      .click();
    await admin.getByTestId("user-create-submit").click();
    await expect(admin.getByTestId("user-detail")).toBeVisible();
    await admin.goto(workspaceAt("Espaces personnels"));
    await expect(admin.getByTestId(`workspace-folder-${aliceFolder}`)).toBeVisible();
  });

  const alicePage = await sessionPage(browser, origin, "alice@example.test");

  await test.step("a council member reads a common document with reading actions only", async () => {
    await alicePage.goto(`/app/workspace?resource=${commonText.id}`);
    await expect(alicePage.getByTestId("workspace-workbench-title")).toHaveText("Note commune");
    await expect(alicePage.getByTestId("resource-changes-trigger")).toBeVisible();
    await expect(alicePage.getByTestId("resource-delete")).toHaveCount(0);
    await expect(alicePage.getByTestId("workspace-workbench-rename")).toHaveCount(0);
    await alicePage.goto(workspaceAt("Commun"));
    await expect(
      alicePage.getByTestId("workspace-folder-open-Commun").or(alicePage.getByText("Note commune")),
    ).toBeVisible();
    await expect(alicePage.getByTestId("workspace-create-menu")).toHaveCount(0);
  });

  let draftId = "";
  await test.step("a council member creates, imports, edits, renames, moves and deletes in their personal folder", async () => {
    await alicePage.getByTestId("workspace-personal-open").click();
    await expect(alicePage).toHaveURL(
      new RegExp(`path=${encodeURIComponent(aliceFolder).replace(/%20/g, "(%20|\\+)")}`),
    );
    await alicePage.getByTestId("workspace-create-menu").click();
    await expect(alicePage.getByTestId("workspace-create-text")).toBeVisible();
    await expect(alicePage.getByTestId("workspace-create-councilMatter")).toHaveCount(0);
    await alicePage.getByTestId("workspace-create-text").click();
    await alicePage.getByTestId("workspace-create-name").fill("Brouillon");
    const creation = alicePage.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
    );
    await alicePage.getByTestId("workspace-create-submit").click();
    draftId = ((await (await creation).json()) as { properties: { id: string } }).properties.id;
    await expect(alicePage.getByTestId("workspace-workbench-title")).toHaveText("Brouillon");
    await alicePage.getByTestId("markdown-editor-compact").getByTestId("editor-writing-area").fill("Proposition");
    await expect.poll(async () => (await resourceProperties(alicePage, draftId)).content).toBe("Proposition");
    await alicePage.getByTestId("workspace-workbench-rename").click();
    await alicePage.getByTestId("workspace-workbench-title-input").fill("Brouillon v2");
    await alicePage.getByTestId("workspace-workbench-title-input").press("Enter");
    await expect(alicePage.getByTestId("workspace-workbench-title")).toHaveText("Brouillon v2");
    await alicePage.getByTestId("resource-changes-trigger").click();
    await expect(
      alicePage.getByTestId("resource-changes-panel").getByTestId("resource-changes-item").first(),
    ).toContainText("Alice Martin");
    await alicePage.keyboard.press("Escape");
    await alicePage.goto(workspaceAt(aliceFolder));
    await expect(alicePage.getByTestId("workspace-tree-root")).toHaveAttribute("data-state", "closed");
    await alicePage.getByTestId("workspace-tree-root").click({ button: "right" });
    await expect(alicePage.getByTestId("workspace-tree-create")).toBeVisible();
    await expect(alicePage.getByTestId("workspace-tree-import-bundle")).toHaveCount(0);
    await alicePage.keyboard.press("Escape");
    await createInCurrentFolder(alicePage, "folder", "Projets");
    const moved = alicePage.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/location"),
    );
    await dragWorkspaceItem(alicePage, `workspace-resource-${draftId}`, `workspace-folder-${aliceFolder}/Projets`);
    expect((await moved).ok()).toBeTruthy();
    expect(await resourceProperties(alicePage, draftId)).toMatchObject({
      path: `${aliceFolder}/Projets`,
      name: "Brouillon v2",
      content: "Proposition",
    });
    await alicePage.goto(workspaceAt(aliceFolder));
    await importThroughMenu(
      alicePage,
      {
        name: "Note.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
      },
      "/api/resources/documents",
    );
    await alicePage.goto(workspaceAt(aliceFolder));
    const budget = await importThroughMenu(
      alicePage,
      { name: "Budget.csv", mimeType: "text/csv", buffer: Buffer.from("Poste;Montant\nVoirie;1200\n") },
      "/api/resources/spreadsheets/import",
    );
    await alicePage.goto(`/app/workspace?resource=${budget}`);
    const deletion = alicePage.waitForResponse((response) => response.request().method() === "DELETE");
    await alicePage.getByTestId("resource-delete").click();
    await alicePage.getByTestId("resource-delete-confirm").click();
    expect((await deletion).ok()).toBeTruthy();
    expect(await folderNames(alicePage, aliceFolder)).toEqual(["Note.pdf", "Projets"]);
    expect(await folderNames(alicePage, `${aliceFolder}/Projets`)).toEqual(["Brouillon v2"]);
  });

  await test.step("the personal folder itself offers renaming, moving and deletion to the administrator only", async () => {
    await alicePage.goto(workspaceAt("Espaces personnels"));
    await alicePage.getByTestId(`workspace-folder-${aliceFolder}`).click({ button: "right" });
    await expect(alicePage.getByTestId("workspace-tree-rename")).toHaveCount(0);
    await alicePage.keyboard.press("Escape");
    await admin.goto(workspaceAt("Espaces personnels"));
    await admin.getByTestId(`workspace-folder-${aliceFolder}`).click({ button: "right" });
    await expect(admin.getByTestId("workspace-tree-rename")).toBeVisible();
    await admin.keyboard.press("Escape");
  });

  await test.step("a colleague finds a document of a personal folder by search and reads it", async () => {
    const brunoPage = await sessionPage(browser, origin, "bruno@example.test");
    await brunoPage.goto("/app/workspace");
    await expect(brunoPage.getByTestId("workspace-tree-root")).toBeVisible();
    await expect(brunoPage.getByTestId(`workspace-resource-title-${draftId}`)).toHaveCount(0);
    await brunoPage.getByTestId("workspace-search-input").fill("Brouillon v2");
    const hit = brunoPage.getByTestId("workspace-search-result").filter({ hasText: "Brouillon v2" });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(brunoPage.getByTestId("workspace-workbench-title")).toHaveText("Brouillon v2");
    await expect(brunoPage.getByTestId("resource-delete")).toHaveCount(0);
    await expect(brunoPage.getByTestId("workspace-workbench-rename")).toHaveCount(0);
    await brunoPage.goto(workspaceAt(aliceFolder));
    await expect(brunoPage.getByTestId("workspace-create-menu")).toHaveCount(0);
    await brunoPage.context().close();
  });

  await test.step("a contributor creates, converts, edits, renames and moves in a common folder without deleting, and only reads a personal folder", async () => {
    const contributorPage = await sessionPage(browser, origin, "contributor@example.test");
    await contributorPage.goto(workspaceAt("Commun"));
    await contributorPage.getByTestId("workspace-create-menu").click();
    await expect(contributorPage.getByTestId("workspace-create-councilMatter")).toBeVisible();
    await expect(contributorPage.getByTestId("workspace-create-file")).toBeVisible();
    await contributorPage.getByTestId("workspace-create-text").click();
    await contributorPage.getByTestId("workspace-create-name").fill("Contribution");
    const creation = contributorPage.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
    );
    await contributorPage.getByTestId("workspace-create-submit").click();
    const contribution = ((await (await creation).json()) as { properties: { id: string } }).properties.id;
    const editor = contributorPage.getByTestId("markdown-editor-compact");
    await editor.getByTestId("editor-writing-area").fill("Montants");
    await dropSpreadsheet(contributorPage, editor, "subventions.csv", "Commune;Montant\nAlésia;1200\n");
    await contributorPage.getByTestId("editor-spreadsheet-drop-table").click();
    await expect(editor.locator("table").first()).toContainText("Alésia");
    await expect
      .poll(async () => (await resourceProperties(contributorPage, contribution)).content)
      .toContain("Alésia");
    await contributorPage.getByTestId("workspace-workbench-rename").click();
    await contributorPage.getByTestId("workspace-workbench-title-input").fill("Contribution v2");
    await contributorPage.getByTestId("workspace-workbench-title-input").press("Enter");
    await expect(contributorPage.getByTestId("workspace-workbench-title")).toHaveText("Contribution v2");
    await contributorPage.goto(workspaceAt("Commun"));
    await createInCurrentFolder(contributorPage, "folder", "Archives");
    const moved = contributorPage.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/location"),
    );
    await dragWorkspaceItem(contributorPage, `workspace-resource-${contribution}`, "workspace-folder-Commun/Archives");
    expect((await moved).ok()).toBeTruthy();
    expect(await resourceProperties(contributorPage, contribution)).toMatchObject({
      path: "Commun/Archives",
      name: "Contribution v2",
    });
    await contributorPage.goto(`/app/workspace?resource=${contribution}`);
    await expect(contributorPage.getByTestId("workspace-workbench-title")).toHaveText("Contribution v2");
    await expect(contributorPage.getByTestId("resource-delete")).toHaveCount(0);
    await contributorPage.goto(workspaceAt(aliceFolder));
    await expect(contributorPage.getByTestId("workspace-tree-root")).toBeVisible();
    await expect(contributorPage.getByTestId("workspace-create-menu")).toHaveCount(0);
    await contributorPage.getByTestId("workspace-tree-root").click({ button: "right" });
    await expect(contributorPage.getByTestId("workspace-tree-create")).toHaveCount(0);
    await expect(contributorPage.getByTestId("workspace-tree-import-bundle")).toHaveCount(0);
    await contributorPage.context().close();
  });

  await test.step("the clerk creates in a common folder, edits and deletes in a personal folder, and takes a document over", async () => {
    const clerkPage = await sessionPage(browser, origin, "clerk@example.test");
    await clerkPage.goto(workspaceAt("Commun"));
    await clerkPage.getByTestId("workspace-create-menu").click();
    await expect(clerkPage.getByTestId("workspace-create-councilMatter")).toBeVisible();
    await clerkPage.getByTestId("workspace-create-text").click();
    await clerkPage.getByTestId("workspace-create-name").fill("Note du secrétariat");
    await clerkPage.getByTestId("workspace-create-submit").click();
    await expect(clerkPage.getByTestId("workspace-workbench-title")).toHaveText("Note du secrétariat");
    await clerkPage.goto(workspaceAt(aliceFolder));
    await clerkPage.getByTestId("workspace-create-menu").click();
    await expect(clerkPage.getByTestId("workspace-create-text")).toBeVisible();
    await expect(clerkPage.getByTestId("workspace-create-councilMatter")).toHaveCount(0);
    await clerkPage.getByTestId("workspace-create-text").click();
    await clerkPage.getByTestId("workspace-create-name").fill("Ajout du secrétariat");
    const creation = clerkPage.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
    );
    await clerkPage.getByTestId("workspace-create-submit").click();
    const addition = ((await (await creation).json()) as { properties: { id: string } }).properties.id;
    await clerkPage.getByTestId("markdown-editor-compact").getByTestId("editor-writing-area").fill("Complément");
    await expect.poll(async () => (await resourceProperties(clerkPage, addition)).content).toBe("Complément");
    await clerkPage.getByTestId("resource-changes-trigger").click();
    await expect(clerkPage.getByTestId("resource-changes-panel")).toContainText("clerk@example.test");
    await clerkPage.keyboard.press("Escape");
    const deletion = clerkPage.waitForResponse((response) => response.request().method() === "DELETE");
    await clerkPage.getByTestId("resource-delete").click();
    await clerkPage.getByTestId("resource-delete-confirm").click();
    expect((await deletion).ok()).toBeTruthy();
    const before = await resourceProperties(clerkPage, draftId);
    expect(
      (
        await clerkPage.request.patch(`/api/resources/${draftId}/location`, {
          data: { path: "Commun", name: "Brouillon v2" },
        })
      ).status(),
    ).toBe(200);
    await clerkPage.context().close();
    await alicePage.goto(`/app/workspace?resource=${before.slug}`);
    await expect(alicePage.getByTestId("workspace-workbench-title")).toHaveText("Brouillon v2");
    await expect(alicePage.getByTestId("resource-delete")).toHaveCount(0);
    await expect(alicePage.getByTestId("workspace-workbench-rename")).toHaveCount(0);
    expect(await resourceProperties(alicePage, draftId)).toMatchObject({
      slug: before.slug,
      path: "Commun",
      content: "Proposition",
    });
  });

  await test.step("a personal document is presented as to be taken over, and the server refuses its association", async () => {
    const business = await created<{ id: string }>(
      await admin.request.post("/api/council-business", {
        data: { path: "Commun", name: "Affaire suivie", reportName: "Rapport", reportContent: "" },
      }),
    );
    await admin.goto(`/app/workspace?councilBusiness=${business.id}`);
    await admin.getByTestId("attachment-picker-open").click();
    await admin.getByTestId("attachment-picker-search-input").fill("Note.pdf");
    const personalRow = admin.getByTestId("attachment-picker-search-result").filter({ hasText: "Note.pdf" }).first();
    await expect(personalRow).toBeVisible();
    await expect(personalRow).toContainText("to be taken over by the clerk first");
    const association = admin.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith(`/${business.id}/resources`),
    );
    await personalRow.click();
    expect((await association).status()).toBe(409);
    await expect(admin.getByText("first moves it into a common folder").first()).toBeVisible();
    const resources = await (await admin.request.get(`/api/council-business/${business.id}/resources`)).json();
    expect(JSON.stringify(resources)).not.toContain("Note.pdf");
  });

  await test.step("a council member follows a meeting in progress and reads a vote result without conduct controls", async () => {
    const noticeTemplate = defaultDocumentTemplates.find((entry) => entry.documentType === "meeting-notice");
    expect(noticeTemplate).toBeDefined();
    await created(
      await admin.request.post("/api/templates", {
        data: { ...noticeTemplate, name: "Convocation" },
      }),
    );
    const meeting = await created<{ id: string }>(await admin.request.post("/api/council-meetings", { data: {} }));
    const scheduled = await created<{ slug: string }>(
      await admin.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
        data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "Salle du conseil" },
      }),
    );
    const business = await created<{ id: string }>(
      await admin.request.post("/api/council-business", {
        data: { path: "Commun", name: "Point voté", reportName: "Rapport", reportContent: "" },
      }),
    );
    const item = await created<{ id: string }>(
      await admin.request.post(`/api/council-meetings/${scheduled.slug}/agenda-items`, {
        data: { kind: "councilDecisionProposal", councilBusinessId: business.id, position: 1 },
      }),
    );
    await admin.goto(`/app/meetings/${scheduled.slug}`);
    await establishRevision(admin);
    const notice = admin.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/notices"),
    );
    await generateCurrentNotice(admin);
    const noticeResponse = await notice;
    expect(noticeResponse.ok(), await noticeResponse.text()).toBeTruthy();
    await admin.goto(`/app/meetings/${scheduled.slug}/live`);
    await admin.getByTestId("live-attendance-all-present").click();
    await admin.getByTestId(`live-member-actions-${mayor.memberId}`).click();
    await admin.getByTestId(`live-designate-chair-${mayor.memberId}`).click();
    await admin.getByTestId(`live-member-actions-${bruno.memberId}`).click();
    await admin.getByTestId(`live-designate-secretary-${bruno.memberId}`).click();
    await admin.getByTestId("live-meeting-start").click();
    await admin.getByTestId(`live-agenda-item-${item.id}`).click();
    await admin.getByTestId("live-agenda-start").click();
    await admin.getByTestId("live-ballot-open").click();
    await admin.getByTestId("live-ballot-all-for").click();
    await admin.getByTestId("live-ballot-preview-open").click();
    await admin.getByTestId("live-ballot-preview-confirm").click();
    await expect(admin.getByTestId("live-ballot-result")).toContainText("Adopted");

    await alicePage.goto(`/app/meetings/${scheduled.slug}/live`);
    await alicePage.getByTestId("live-opening").click();
    await expect(alicePage.getByTestId("live-opening-summary")).toBeVisible();
    await alicePage.getByTestId(`live-agenda-item-${item.id}`).click();
    await expect(alicePage.getByTestId("live-item-title")).toContainText("Point voté");
    await expect(alicePage.getByTestId("live-ballot-result")).toContainText("Adopted");
    await expect(alicePage.getByTestId("live-attendance-all-present")).toHaveCount(0);
    await expect(alicePage.getByTestId("live-meeting-start")).toHaveCount(0);
    await expect(alicePage.getByTestId("live-agenda-start")).toHaveCount(0);
    await expect(alicePage.getByTestId("live-ballot-open")).toHaveCount(0);
    await expect(alicePage.getByTestId("live-ballot-preview-open")).toHaveCount(0);
  });

  await test.step("the end of a mandate disables the account and keeps the folder for the clerk", async () => {
    expect(
      (
        await admin.request.put(`/api/council-members/${alice.memberId}`, {
          data: { role: "councillor", rank: null, termStartedOn: "2026-03-22", termEndedOn: "2026-10-25" },
        })
      ).ok(),
    ).toBeTruthy();
    await admin.goto("/app/users");
    await admin.getByTestId("collection-search").fill("alice@example.test");
    await expect(admin.getByTestId("users-collection")).toContainText("Disabled");
    expect((await alicePage.request.get("/api/resources?path=")).status()).toBe(401);
    const clerkPage = await sessionPage(browser, origin, "clerk@example.test");
    expect(
      (
        await clerkPage.request.post("/api/resources", {
          data: { kind: "text", path: aliceFolder, name: "Suite", content: "" },
        })
      ).status(),
    ).toBe(201);
    await clerkPage.context().close();
  });
  await alicePage.context().close();
});

// @verifies-requirement HALL-FR-LAY-040
test("the home page lists the latest council documents without the personal folders, for every account", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
  admin.setDefaultTimeout(20_000);
  await admin.addInitScript(() => localStorage.setItem("mairie.locale", "en"));
  expect(
    (
      await admin.request.post("/api/auth/bootstrap", {
        data: { displayName: "Administrator", email: "admin@example.test", password },
      })
    ).status(),
  ).toBe(201);
  expect((await admin.request.put("/api/council-terms", { data: { expectedMemberCount: 5 } })).ok()).toBeTruthy();
  const contact = await created<{ id: string }>(
    await admin.request.post("/api/contacts", {
      data: {
        firstName: "Alice",
        lastName: "Martin",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      },
    }),
  );
  await created(
    await admin.request.post("/api/council-members", {
      data: { contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" },
    }),
  );
  await created(
    await admin.request.post("/api/users", {
      data: {
        email: "alice@example.test",
        displayName: "Alice Martin",
        password,
        roles: ["councillor"],
        contactId: contact.id,
      },
    }),
  );
  await created(await admin.request.post("/api/resources", { data: { kind: "folder", path: "", name: "Commun" } }));
  const common = await created<{ id: string }>(
    await admin.request.post("/api/resources", {
      data: { kind: "text", path: "Commun", name: "Note commune", content: "Texte commun" },
    }),
  );
  const alicePage = await sessionPage(browser, origin, "alice@example.test");
  // The personal note is the latest document of Hall.
  const personal = await created<{ id: string }>(
    await alicePage.request.post("/api/resources", {
      data: { kind: "text", path: aliceFolder, name: "Note personnelle", content: "Texte personnel" },
    }),
  );

  for (const [account, page] of [
    ["administrator without a personal folder", admin],
    ["council member with a personal folder", alicePage],
  ] as const) {
    await test.step(`the ${account} sees the common note and not the personal note`, async () => {
      await page.goto("/app/");
      const recent = page.getByTestId("home-recent");
      await expect(recent.getByTestId(`home-recent-document-${common.id}`)).toBeVisible();
      await expect(recent.getByTestId(`home-recent-document-${personal.id}`)).toHaveCount(0);
    });
  }
  await expect(alicePage.getByTestId(`home-personal-document-${personal.id}`)).toBeVisible();
  await alicePage.context().close();
});

// @verifies-requirement HALL-FR-LAY-010
// @verifies-requirement HALL-FR-WSP-380
test("on a phone the personal folder is the only active destination and an empty folder says it is empty", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  admin.setDefaultTimeout(20_000);
  expect(
    (
      await admin.request.post("/api/auth/bootstrap", {
        data: { displayName: "Administrator", email: "admin@example.test", password },
      })
    ).status(),
  ).toBe(201);
  expect((await admin.request.put("/api/council-terms", { data: { expectedMemberCount: 5 } })).ok()).toBeTruthy();
  const contact = await created<{ id: string }>(
    await admin.request.post("/api/contacts", {
      data: {
        firstName: "Alice",
        lastName: "Martin",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      },
    }),
  );
  await created(
    await admin.request.post("/api/council-members", {
      data: { contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" },
    }),
  );
  await created(
    await admin.request.post("/api/users", {
      data: {
        email: "alice@example.test",
        displayName: "Alice Martin",
        password,
        roles: ["councillor"],
        contactId: contact.id,
      },
    }),
  );

  const context = await browser.newContext({
    baseURL: baseURL ?? "",
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  expect(
    (await context.request.post("/api/auth/login", { data: { email: "alice@example.test", password } })).status(),
  ).toBe(200);
  const phone = await context.newPage();
  phone.setDefaultTimeout(20_000);
  const destination = (id: string) => phone.getByTestId(`phone-navigation-${id}`);
  /** Destinations marked active or still drawing a tinted pill behind their icon. */
  const activeDestinations = () =>
    phone
      .getByTestId("phone-navigation")
      .locator(".app-phone-bar-item")
      .evaluateAll((items) =>
        items
          .filter((item) => {
            const icon = item.querySelector('[aria-hidden="true"]');
            const tinted = icon !== null && getComputedStyle(icon).backgroundColor !== "rgba(0, 0, 0, 0)";
            return item.getAttribute("data-active") === "true" || tinted;
          })
          .map((item) => item.getAttribute("data-destination") ?? item.getAttribute("data-testid")),
      );

  await test.step("the personal destination alone is active in the personal folder, which says it is empty", async () => {
    await phone.goto("/app/");
    await destination("personal").tap();
    await expect(destination("personal")).toHaveAttribute("aria-current", "page");
    expect(await activeDestinations()).toEqual(["personal"]);
    await expect(phone.getByTestId("phone-header-title")).toHaveText("Mon espace");
    await expect(phone.getByTestId("workspace-explorer-empty")).toHaveText("Ce dossier est vide.");
  });

  await test.step("the documents destination alone is active elsewhere in the explorer", async () => {
    await destination("documents").tap();
    await expect(destination("documents")).toHaveAttribute("aria-current", "page");
    expect(await activeDestinations()).toEqual(["documents"]);
    await phone.getByTestId("workspace-folder-name-Espaces personnels").tap();
    await expect(phone.getByTestId(`workspace-folder-name-${aliceFolder}`)).toBeVisible();
    expect(await activeDestinations()).toEqual(["documents"]);
    await phone.getByTestId(`workspace-folder-name-${aliceFolder}`).tap();
    await expect(phone.getByTestId("workspace-explorer-empty")).toBeVisible();
    expect(await activeDestinations()).toEqual(["personal"]);
  });

  await test.step("on a wide screen a filter without result keeps its own message", async () => {
    await phone.setViewportSize({ width: 1280, height: 800 });
    await phone.getByTestId("workspace-tree-filter").fill("absent");
    await expect(phone.getByTestId("workspace-explorer-empty")).toHaveText("Aucun élément ne correspond à cette vue.");
  });
  await context.close();
});
