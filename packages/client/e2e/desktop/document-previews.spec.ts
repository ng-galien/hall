import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Locator, type Page, test } from "@playwright/test";

interface Entry {
  id: string;
  reference?: string;
  title?: string;
  name?: string;
  kind?: string;
  path?: string;
  folderPath?: string;
  binary?: { mediaType: string };
  subject?: { kind: string };
  documentType?: string;
  documentId?: string | null;
  meetingNumber?: number;
  number?: number;
  closedAt?: string | null;
  startedAt?: string | null;
  chairMemberId?: string | null;
  secretaryMemberId?: string | null;
  frozenAt?: string | null;
  mediaType?: string;
}

async function collection(page: Page, path: string): Promise<Entry[]> {
  return page.evaluate(async (url) => {
    const response = await fetch(`/api/${url}`);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const body = await response.json();
    return body.entities.map((entry: { properties: Entry }) => entry.properties);
  }, path);
}

async function pdfDigest(page: Page, frame: Locator) {
  const url = await frame.getAttribute("src");
  expect(url).toBeTruthy();
  const result = await page.evaluate(async (href) => {
    const response = await fetch(href!);
    return {
      status: response.status,
      type: response.headers.get("content-type"),
      bytes: [...new Uint8Array(await response.arrayBuffer())],
    };
  }, url);
  expect(result.status).toBe(200);
  expect(result.type).toContain("application/pdf");
  const bytes = Buffer.from(result.bytes);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  return createHash("sha256").update(bytes).digest("hex");
}

async function aligned(page: Page, dialog: Locator, name: string, rich = false) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  const frame = await dialog.boundingBox();
  expect(frame).not.toBeNull();
  const header = dialog.locator(rich ? ".resource-preview-shell-header" : ".document-viewer-header");
  const title = dialog.locator(rich ? "#resource-preview-title" : "header h2");
  await expect(title).not.toBeEmpty();
  const layout = await header.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      display: style.display,
      padding: style.padding,
    };
  });
  expect(Math.abs(layout.x - frame!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.y - frame!.y)).toBeLessThanOrEqual(2);
  expect(layout.width).toBeGreaterThan(frame!.width - 4);
  expect(layout.height).toBeGreaterThan(55);
  if (!rich) {
    expect(layout.display).toBe("flex");
    expect(layout.padding).not.toBe("0px");
  }
  const content = await dialog.locator(":scope > .document-viewer-content").boundingBox();
  expect(content!.y).toBeCloseTo(layout.y + layout.height, 0);
  expect(content!.height).toBeGreaterThan(300);
  const close = dialog
    .locator(rich ? '[data-testid="resource-preview-close"]' : ".document-viewer-actions button")
    .last();
  await expect(close).toBeInViewport();
  const closeBox = await close.boundingBox();
  expect(closeBox!.y).toBeGreaterThanOrEqual(layout.y);
  expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(layout.y + layout.height + 1);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  return { title: await title.innerText(), frame, header: layout };
}

// @verifies-requirement HALL-FR-DOC-480
// @verifies-requirement HALL-FR-MIN-220
// @verifies-requirement HALL-FR-MIN-250
// @verifies-requirement HALL-FR-DOC-580
test("document previews share a contextual frame in both themes without changing frozen PDFs", async () => {
  test.setTimeout(20 * 60_000);
  const executable = process.env.HALL_E2E_DESKTOP_EXECUTABLE;
  if (!executable) throw new Error("Set HALL_E2E_DESKTOP_EXECUTABLE to the candidate executable");
  const profile = await mkdtemp(join(tmpdir(), "hall-document-previews-"));
  const app = await electron.launch({
    executablePath: executable,
    args: [],
    timeout: 480_000,
    env: { ...process.env, HALL_USER_DATA_PATH: profile, HALL_DESKTOP_EDITION: "demonstration" },
  });
  const observations: unknown[] = [];
  try {
    await expect
      .poll(() => app.windows().some((window) => window.url().startsWith("hall-launch:")), { timeout: 30_000 })
      .toBe(true);
    const launch = app.windows().find((window) => window.url().startsWith("hall-launch:"))!;
    await expect(launch.getByTestId("launch-open")).toBeEnabled({ timeout: 480_000 });
    await launch.getByTestId("launch-open").click();
    await expect
      .poll(() => app.windows().some((window) => window.url().includes("/app/")), { timeout: 30_000 })
      .toBe(true);
    const page = app.windows().find((window) => window.url().includes("/app/"))!;
    await expect(page.getByTestId("dashboard-next-meeting")).toBeVisible({ timeout: 480_000 });
    const origin = new URL(page.url()).origin;
    const go = (path: string) => page.goto(`${origin}/app/${path}`);
    await page.getByTestId("navigation-settings").click();
    await page.getByTestId("settings-tab-preferences").click();
    await page.getByTestId("settings-language").click();
    await page.getByTestId("settings-language-fr").click();
    const frozen = (await collection(page, "minutes")).find((entry) => entry.documentId)!;
    expect(frozen).toBeTruthy();
    const decisions = await collection(page, "council-decisions");
    let meetings = await collection(page, "council-meetings");
    const templates = await collection(page, "templates");
    const resources = await collection(page, "resources");
    const access = await collection(page, `resources?path=${encodeURIComponent("Accès")}`);
    const support = await collection(page, `resources?path=${encodeURIComponent("Soutien")}`);
    const businesses = await collection(page, "council-business/workspace-items");
    await writeFile(
      test.info().outputPath("demo-collections.json"),
      JSON.stringify({ frozen, decisions, meetings, templates, resources, businesses }, null, 2),
    );
    const active = meetings.find((entry) => entry.startedAt && !entry.closedAt)!;
    expect(active).toBeTruthy();
    const closure = await page.evaluate(async (meeting) => {
      const command = async (method: string, path: string, input: unknown) => {
        const response = await fetch(`/api/${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
        return payload.properties;
      };
      const path = `council-meetings/${meeting.id}`;
      const agenda = (await (await fetch(`/api/${path}/agenda-items`)).json()).entities;
      for (const entry of agenda) {
        const item = entry.properties;
        if (!item.completedAt && !item.adjournedAt) {
          const finishedAt = new Date().toISOString();
          if (item.startedAt)
            await command("POST", `${path}/agenda-items/${item.id}/complete`, { completedAt: finishedAt });
          else await command("POST", `${path}/agenda-items/${item.id}/adjourn`, { adjournedAt: finishedAt });
        }
      }
      return command("POST", `${path}/close`, { closedAt: new Date().toISOString() });
    }, active);
    const draftMinutesId: string = closure.minutes.id;
    for (const tone of ["light", "dark"] as const) {
      await go("settings?category=preferences");
      await page.getByTestId("settings-theme").click();
      await page.getByTestId(`settings-theme-${tone}`).click();
      await go(`minutes/${draftMinutesId}`);
      const before = await page.evaluate(
        async (id) => (await (await fetch(`/api/minutes/${id}`)).json()).properties,
        draftMinutesId,
      );
      await page.getByTestId("minutes-preview").click();
      const dialog = page.getByTestId("minutes-document-dialog");
      await expect(dialog).toHaveAttribute("data-document-kind", "draft");
      await expect(dialog.locator("header h2")).toContainText("Aperçu du procès-verbal");
      await pdfDigest(page, page.getByTestId("minutes-document-frame"));
      observations.push(await aligned(page, dialog, `minutes-draft-${tone}`));
      await page.getByTestId("minutes-document-close").press("Escape");
      await expect(page.getByTestId("minutes-preview")).toBeFocused();
      const after = await page.evaluate(
        async (id) => (await (await fetch(`/api/minutes/${id}`)).json()).properties,
        draftMinutesId,
      );
      expect(after).toEqual(before);
      expect(after.documentId).toBeNull();
    }
    await page.getByTestId("minutes-generate").click();
    await expect(page.getByTestId("minutes-document-dialog")).toHaveAttribute("data-document-kind", "generated");
    await page.getByTestId("minutes-document-close").click();
    await page.evaluate(
      async ({ nextMeeting, active }) => {
        const response = await fetch(`/api/council-meetings/${nextMeeting.id}/prepare`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduledAt: new Date(Date.now() + 15 * 86_400_000).toISOString(),
            location: "Salle temporaire de recette",
            chairMemberId: active.chairMemberId,
            secretaryMemberId: active.secretaryMemberId,
          }),
        });
        if (!response.ok) throw new Error(`Prepare next meeting: ${response.status} ${await response.text()}`);
      },
      { nextMeeting: closure.nextMeeting, active },
    );
    meetings = await collection(page, "council-meetings");
    let frozenHash = "";
    let frozenDecisionHash = "";
    for (const tone of ["light", "dark"] as const) {
      await go("settings?category=preferences");
      await page.getByTestId("settings-theme").click();
      await page.getByTestId(`settings-theme-${tone}`).click();
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(tone === "dark" ? "dark" : null);
      await page.reload();
      await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(tone === "dark" ? "dark" : null);
      await page.screenshot({ path: test.info().outputPath(`appearance-${tone}.png`) });
      await go(`minutes/${frozen.id}`);
      await page.getByTestId("minutes-view-document").click();
      const pv = page.getByTestId("minutes-document-dialog");
      await expect(pv).toHaveAttribute("data-document-kind", "generated");
      await expect(pv.locator("header h2")).toContainText(`Procès-verbal · Conseil municipal ${frozen.meetingNumber}`);
      const hash = await pdfDigest(page, page.getByTestId("minutes-document-frame"));
      if (frozenHash) expect(hash).toBe(frozenHash);
      frozenHash = hash;
      observations.push(await aligned(page, pv, `minutes-${tone}`));
      await page.getByTestId("minutes-document-close").press("Escape");
      await expect(pv).toHaveCount(0);
      await expect(page.getByTestId("minutes-view-document")).toBeFocused();
      const decision = decisions.find((entry) => /grenier/i.test(entry.title ?? "")) ?? decisions[0]!;
      await go(`council-decisions/${decision.id}`);
      await page.getByTestId("decision-view").click();
      const decisionDialog = page.getByTestId("decision-document-dialog");
      await expect(decisionDialog.locator("header h2")).toContainText(decision.title!);
      await pdfDigest(page, page.getByTestId("decision-document-frame"));
      observations.push(await aligned(page, decisionDialog, `decision-${tone}`));
      if (tone === "dark")
        expect(await pdfDigest(page, page.getByTestId("decision-document-frame"))).toBe(frozenDecisionHash);
      await page.getByTestId("decision-document-close").click();
      if (tone === "light") {
        await page.getByTestId("decision-freeze").click();
        await page.getByTestId("decision-freeze-confirm").click();
        await expect(page.getByTestId("decision-freeze-dialog")).toHaveCount(0);
        await page.getByTestId("decision-view").click();
        frozenDecisionHash = await pdfDigest(page, page.getByTestId("decision-document-frame"));
        observations.push(await aligned(page, decisionDialog, "decision-frozen-light"));
        await page.getByTestId("decision-document-close").click();
      }
      for (const template of [
        templates.find((entry) => entry.documentType === "minutes")!,
        templates.find((entry) => entry.kind === "message")!,
      ]) {
        await go(`templates/${template.id}`);
        await page.getByTestId("template-preview").click();
        const dialog = page.getByTestId("template-preview-dialog");
        await expect(dialog.locator("header h2")).toContainText(template.name!);
        await expect(page.frameLocator('[data-testid="template-preview-frame"]').locator("body")).toContainText(
          "Alésia",
        );
        observations.push(await aligned(page, dialog, `template-${template.kind}-${tone}`));
        await page.getByTestId("template-preview-close").click();
      }
      const text = resources.find((entry) => entry.kind === "text")!;
      await go(`workspace?path=${encodeURIComponent(text.path ?? "")}&resource=${text.id}`);
      await page.getByTestId("resource-pdf-preview").click();
      const without = page.getByTestId("resource-pdf-preview-without-documents");
      if (await without.isVisible()) await without.click();
      const textPdf = page.getByTestId("resource-pdf-preview-dialog");
      await expect(textPdf.locator("header h2")).toContainText(text.name!);
      await pdfDigest(page, page.getByTestId("resource-pdf-preview-native-viewer"));
      observations.push(await aligned(page, textPdf, `text-pdf-${tone}`));
      await page.getByTestId("resource-pdf-preview-close").click();
      for (const kind of ["text", "document", "geographic", "spreadsheet", "remote"]) {
        const resource = resources.find((entry) => entry.kind === kind)!;
        expect(resource, `Demo resource ${kind}`).toBeTruthy();
        await go(`workspace?path=${encodeURIComponent(resource.path ?? "")}&resource=${resource.id}`);
        await page.getByTestId("resource-open-extended").click();
        const viewer = page.getByTestId("resource-preview");
        await expect(viewer.locator("#resource-preview-title")).toContainText(resource.name!);
        observations.push(await aligned(page, viewer, `resource-${kind}-${tone}`, true));
        if (kind === "text" && tone === "light") {
          const editor = viewer.getByTestId("editor-writing-area");
          await expect(editor).toBeEditable();
          await editor.fill("Texte temporaire de recette : fermeture et sauvegarde conservées.");
        }
        await page.getByTestId("resource-preview-close").click();
        if (kind === "text" && tone === "light") {
          await expect
            .poll(() =>
              page.evaluate(
                async (id) => (await (await fetch(`/api/resources/${id}`)).json()).properties.content,
                resource.id,
              ),
            )
            .toContain("fermeture et sauvegarde conservées");
        }
        await expect(viewer).toHaveCount(0);
      }
      for (const [name, resource] of [
        ["image", access.find((entry) => entry.binary?.mediaType.startsWith("image/"))],
        ["office", support.find((entry) => entry.binary?.mediaType.includes("wordprocessingml"))],
      ] as const) {
        expect(resource, `Demo resource ${name}`).toBeTruthy();
        await go(`workspace?path=${encodeURIComponent(resource!.path ?? "")}&resource=${resource!.id}`);
        await page.getByTestId("resource-open-extended").click();
        const viewer = page.getByTestId("resource-preview");
        await expect(viewer.locator("#resource-preview-title")).toContainText(resource!.name!);
        observations.push(await aligned(page, viewer, `resource-${name}-${tone}`, true));
        if (name === "image")
          await expect(viewer.getByTestId("resource-preview-object")).toHaveAttribute("type", "image/png");
        else await expect(viewer.getByTestId("resource-preview-download")).toBeVisible();
        await page.getByTestId("resource-preview-close").click();
      }
      const business = businesses[0]!;
      await go(`workspace?path=${encodeURIComponent(business.folderPath ?? "")}&councilBusiness=${business.id}`);
      await page.getByTestId("business-report-pdf-preview").click();
      const withoutDocuments = page.getByTestId("business-report-pdf-preview-without-documents");
      if (await withoutDocuments.isVisible()) await withoutDocuments.click();
      const businessPdf = page.getByTestId("business-report-pdf-preview-dialog");
      await expect(businessPdf.locator("header h2")).toContainText(business.title!);
      await pdfDigest(page, page.getByTestId("business-report-pdf-preview-native-viewer"));
      observations.push(await aligned(page, businessPdf, `business-report-${tone}`));
      await page.getByTestId("business-report-pdf-preview-close").click();
      const prepared = meetings.find((entry) => !entry.closedAt)!;
      const noticesLoaded = page.waitForResponse(
        (response) => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith("/notices"),
      );
      await go(`meetings/${prepared.reference ?? prepared.id}`);
      await noticesLoaded;
      const noticeButtons = page.getByTestId("meeting-notice-open");
      if (!(await noticeButtons.count())) {
        const freezeAgenda = page.getByTestId("meeting-freeze-agenda");
        if (await freezeAgenda.isVisible()) await freezeAgenda.click();
        await page.getByTestId("meeting-generate-notice").click();
      } else await noticeButtons.first().click();
      await pdfDigest(page, page.getByTestId("document-object-frame"));
      observations.push(await aligned(page, page.getByTestId("document-object-viewer"), `notice-${tone}`));
      await page.getByTestId("document-object-viewer-close").click();
      await go(`meetings/${prepared.reference ?? prepared.id}`);
      const agenda = await collection(page, `council-meetings/${prepared.id}/agenda-items`);
      const approval = agenda.find((entry) => entry.subject?.kind === "minutesApproval")!;
      expect(approval).toBeTruthy();
      await page.getByTestId(`agenda-item-expand-${approval.id}`).click();
      await page.getByTestId(`agenda-minutes-${approval.id}`).click();
      await pdfDigest(page, page.getByTestId("document-object-frame"));
      observations.push(await aligned(page, page.getByTestId("document-object-viewer"), `approval-minutes-${tone}`));
      await page.getByTestId("document-object-viewer-close").click();
      const closed = meetings.find((entry) => entry.closedAt)!;
      await go(`meetings/${closed.reference ?? closed.id}`);
      await page.getByTestId("meeting-deliberation-list-open").click();
      await pdfDigest(page, page.getByTestId("document-object-frame"));
      observations.push(await aligned(page, page.getByTestId("document-object-viewer"), `deliberation-list-${tone}`));
      await page.getByTestId("document-object-viewer-close").click();
      const desktopSize = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      await page.setViewportSize({ width: 390, height: 844 });
      await go(`minutes/${frozen.id}`);
      await page.getByTestId("minutes-view-document").click();
      observations.push(await aligned(page, page.getByTestId("minutes-document-dialog"), `minutes-mobile-${tone}`));
      await page.getByTestId("minutes-document-close").click();
      await page.setViewportSize(desktopSize);
    }
    await go("settings?category=preferences");
    await page.getByTestId("settings-theme").click();
    await page.getByTestId("settings-theme-auto").click();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect
        .poll(() => page.locator("html").getAttribute("data-theme"))
        .toBe(colorScheme === "dark" ? "dark" : null);
    }
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(
      test.info().outputPath("preview-observations.json"),
      JSON.stringify({ frozenHash, frozenDecisionHash, observations }, null, 2),
    );
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
