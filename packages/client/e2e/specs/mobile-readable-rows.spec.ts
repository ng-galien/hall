import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/application";

const widths = [360, 390, 768, 852, 1440];
/** At and below this width Hall uses its phone layout, where each item opens on its own page. */
const phoneWidth = 760;

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.width > 40 &&
          element.scrollWidth <= element.clientWidth + 1 &&
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth + 1
        );
      }),
    )
    .toBe(true);
}

async function expectReachable(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return bounds.left >= 0 && bounds.right <= window.innerWidth + 1 && !!hit && element.contains(hit);
      }),
    )
    .toBe(true);
}

async function expectOpensRecord(row: Locator) {
  const name = row.locator(".council-member-name");
  await name.scrollIntoViewIfNeeded();
  await expect(name).toBeInViewport();
  await expect
    .poll(() =>
      name.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return !!hit?.closest(".collection-card-link");
      }),
    )
    .toBe(true);
}

// @verifies-requirement HALL-FR-LAY-010
test("member list preserves identities beside status and commissions at every responsive width", async ({
  appPage: page,
}) => {
  await page.goto("/app/council-members");
  await page.getByTestId("collection-layout-list").click();
  const rows = page.getByTestId(/^member-record-/);
  await expect(rows.first()).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const row of await rows.all()) {
      const name = row.locator(".council-member-name");
      await expectReadable(name);
      const nameBox = await name.boundingBox();
      const statusBox = await row.locator(".council-member-list-status").boundingBox();
      expect(nameBox && statusBox).toBeTruthy();
      expect(nameBox!.y + nameBox!.height <= statusBox!.y || nameBox!.x + nameBox!.width <= statusBox!.x).toBe(true);
    }
    await expectOpensRecord(rows.first());
  }
});

// @verifies-requirement HALL-FR-LAY-010
test("prepared and scheduled titles keep their actions reachable in meetings and business", async ({
  appPage: page,
}) => {
  test.setTimeout(60_000);
  const response = await page.request.post("/api/council-business", {
    data: { path: "", name: `Mobile rows ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(response.status()).toBe(201);
  const business = (await response.json()).properties;
  const title = "Voirie : pont du Gué-de-la-Brenne et sécurisation des déplacements des habitants";
  const prepared = await page.request.post(`/api/council-business/${business.id}/prepared-subjects`, {
    data: { kind: "openQuestion", name: title, content: "Présentation du sujet préparé." },
  });
  expect(prepared.status()).toBe(201);
  const subject = (await prepared.json()).properties;
  const meetings = await (await page.request.get("/api/council-meetings")).json();
  const meeting = meetings.entities
    .map((entry: { properties: { id: string; startedAt: string | null } }) => entry.properties)
    .find((entry: { startedAt: string | null }) => !entry.startedAt);
  expect(meeting).toBeTruthy();
  await page.goto(`/app/meetings/${meeting.id}`);
  const add = page.getByTestId(`agenda-candidate-add-${subject.id}`);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    // On a phone the title opens the page of the prepared subject instead of unfolding it.
    const candidate = page.getByTestId(
      width <= phoneWidth ? `agenda-candidate-open-${subject.id}` : `agenda-candidate-preview-${subject.id}`,
    );
    await expectReadable(candidate.locator("strong"));
    await expectReachable(candidate);
    await expectReachable(add);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const scheduledResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/agenda-items"),
  );
  await add.click();
  expect((await scheduledResponse).ok()).toBe(true);
  const agendaResponse = await page.request.get(`/api/council-business/agenda-items?councilBusinessId=${business.id}`);
  const agenda = (await agendaResponse.json()).entities.map(
    (entry: { properties: { id: string } }) => entry.properties,
  );
  expect(agenda).toHaveLength(1);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= phoneWidth) {
      const point = page.getByTestId(`agenda-item-open-${agenda[0].id}`);
      await expectReadable(point.locator("strong"));
      await expectReachable(point);
      continue;
    }
    const scheduled = page.getByTestId(`agenda-item-expand-${agenda[0].id}`);
    await expectReadable(scheduled.locator("strong"));
    await expectReachable(scheduled);
    await expectReachable(page.getByTestId(`agenda-item-open-business-${agenda[0].id}`));
  }
  await page.goto(`/app/workspace?councilBusiness=${business.id}`);
  const open = page.getByTestId(`business-subject-${subject.id}-open`);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(open).toContainText(title);
    await expectReadable(
      width <= phoneWidth ? open.locator(".phone-subject-copy > span").first() : open.locator("span"),
    );
    await expectReachable(open);
    if (width > phoneWidth) await expectReachable(page.getByTestId(`business-subject-unschedule-${subject.id}`));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open.click();
  await expect(page.getByTestId("resource-phone-view")).toContainText("Présentation du sujet préparé.");
  await page.getByTestId("phone-document-actions").click();
  await expect(page.getByTestId("phone-document-action-subject-unschedule")).toBeVisible();
});
