import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

async function createContact(page: Page, data: Record<string, unknown>): Promise<string> {
  const response = await page.request.post("/api/contacts", {
    data: { lastName: "Roux", organizationName: null, jobTitle: null, email: null, notes: "", ...data },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { properties: { id: string } }).properties.id;
}

function contactUpdate(page: Page, contactId: string) {
  return page.waitForResponse(
    (response) => response.url().endsWith(`/api/contacts/${contactId}`) && response.request().method() === "PUT",
  );
}

// @verifies-requirement HALL-FR-DIR-170
// @verifies-requirement HALL-FR-DIR-180
test("a contact sheet keeps three telephone numbers, refuses a wrong one and writes to its address in Hall", async ({
  appPage: page,
}) => {
  test.setTimeout(60_000);
  const contactId = await createContact(page, { firstName: "Céline", email: "celine.roux@example.test" });
  await page.goto(`/app/contacts/${contactId}`);

  const headings = page.locator(".admin-record h2");
  await expect(headings).toHaveText(["Identity", "Contact details", "Notes"]);

  let saved = contactUpdate(page, contactId);
  await page.getByTestId("contact-mobilePhone").fill("07.86.29.55.76");
  expect((await saved).status()).toBe(200);
  saved = contactUpdate(page, contactId);
  await page.getByTestId("contact-professionalPhone").fill("+33 3 84 87 42 31");
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("contact-mobilePhone")).toHaveValue("07 86 29 55 76");
  await expect(page.getByTestId("contact-professionalPhone")).toHaveValue("03 84 87 42 31");
  await expect(page.getByTestId("contact-personalPhone")).toHaveValue("");

  let refusedRequests = 0;
  const countRequest = (request: { url(): string; method(): string }) => {
    if (request.url().endsWith(`/api/contacts/${contactId}`) && request.method() === "PUT") refusedRequests += 1;
  };
  page.on("request", countRequest);
  await page.getByTestId("contact-personalPhone").fill("03 84 87");
  await expect(
    page.getByText("Enter ten digits starting with 0, or an international number starting with +."),
  ).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(refusedRequests).toBe(0);
  page.off("request", countRequest);
  saved = contactUpdate(page, contactId);
  await page.getByTestId("contact-personalPhone").fill("+41 22 123 45 67");
  expect((await saved).status()).toBe(200);

  await page.getByTestId("navigation-contacts").click();
  await expect(page.getByTestId(`contact-phone-${contactId}`)).toHaveText("07 86 29 55 76");
  await expect(page.getByText("No email")).toHaveCount(0);
  await expect(page.getByText("No phone number")).toHaveCount(0);

  await page.getByTestId(`contact-open-${contactId}`).click();
  await page.getByTestId("contact-email-write").click();
  await expect(page).toHaveURL(/\/app\/mail\/[0-9a-f-]{36}$/);
  const mailId = page.url().split("/").at(-1);
  const mail = (await (await page.request.get(`/api/mail/${mailId}`)).json()) as {
    properties: { recipients: Array<{ kind: string; address: string; contactId: string | null }> };
  };
  expect(mail.properties.recipients).toEqual([
    expect.objectContaining({ kind: "to", address: "celine.roux@example.test", contactId }),
  ]);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  // @verifies-requirement HALL-FR-DIR-180
  test("each number of a contact sheet calls it", async ({ appPage: page }) => {
    const contactId = await createContact(page, {
      firstName: "Denis",
      mobilePhone: "07 86 29 55 76",
      personalPhone: "+41 22 123 45 67",
    });
    await page.goto(`/app/contacts/${contactId}`);
    await expect(page.getByTestId("contact-mobilePhone-call")).toHaveAttribute("href", "tel:+33786295576");
    await expect(page.getByTestId("contact-personalPhone-call")).toHaveAttribute("href", "tel:+41221234567");
    await expect(page.getByTestId("contact-professionalPhone-call")).toHaveCount(0);
  });
});

// @verifies-requirement HALL-FR-DIR-180
test("the council member list shows one number per member, the mobile first", async ({ appPage: page }) => {
  await page.goto("/app/council-members");
  const rows = page.locator('[data-testid^="member-record-"]');
  await expect(rows.filter({ hasText: "Vercingétorix" })).toContainText("06 39 98 00 01");
  await expect(rows.filter({ hasText: "Vercingétorix" })).not.toContainText("03 53 01 00 01");
  await expect(rows.filter({ hasText: "Commius" })).toContainText("03 53 01 00 03");
  await expect(rows.filter({ hasText: "Luctérios" })).not.toContainText("03 53 01 00 04");
  await expect(page.getByText("No phone number")).toHaveCount(0);
  await expect(page.getByText("No email")).toHaveCount(0);
});
