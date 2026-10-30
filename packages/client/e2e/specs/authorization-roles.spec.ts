import { type APIResponse, type Browser, expect, type Page, test } from "@playwright/test";
import { clearTestDatabase } from "../fixtures/application";

const password = "Hall-roles-2026!";

async function created<T>(response: APIResponse): Promise<T> {
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { properties: T }).properties;
}

async function sessionPage(browser: Browser, baseURL: string, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => localStorage.setItem("mairie.locale", "en"));
  expect((await context.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(200);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

// Each journey bootstraps the first administrator of an empty Hall.
test.beforeEach(() => clearTestDatabase());

// @verifies-requirement HALL-FR-USR-040
// @verifies-requirement HALL-FR-USR-050
test("a councillor cannot delete an affair and a secretariat account deletes it", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "";
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
  for (const [email, roles, contactId] of [
    ["alice@example.test", ["councillor"], contact.id],
    ["clerk@example.test", ["clerk"], null],
  ] as const)
    await created(
      await admin.request.post("/api/users", { data: { email, displayName: email, password, roles, contactId } }),
    );
  await created(await admin.request.post("/api/resources", { data: { kind: "folder", path: "", name: "Commun" } }));
  const business = await created<{ id: string }>(
    await admin.request.post("/api/council-business", {
      data: { path: "Commun", name: "Affaire à supprimer", reportName: "Rapport", reportContent: "" },
    }),
  );

  const councillor = await sessionPage(browser, origin, "alice@example.test");
  await councillor.goto("/app/workspace");
  const councillorRow = councillor.getByTestId(`workspace-business-${business.id}`);
  await councillorRow.click({ button: "right" });
  await expect(councillor.getByRole("menu")).toBeVisible();
  await expect(councillor.getByTestId("workspace-tree-delete-business")).toHaveCount(0);
  await councillor.keyboard.press("Escape");
  expect((await councillor.request.delete(`/api/council-business/${business.id}`)).status()).toBe(403);
  await councillor.context().close();

  const clerk = await sessionPage(browser, origin, "clerk@example.test");
  await clerk.goto("/app/workspace");
  const clerkRow = clerk.getByTestId(`workspace-business-${business.id}`);
  await clerkRow.click({ button: "right" });
  await clerk.getByTestId("workspace-tree-delete-business").click();
  await clerk.getByTestId("business-delete-confirm").click();
  await expect(clerkRow).toHaveCount(0);
  expect((await clerk.request.get(`/api/council-business/${business.id}`)).status()).toBe(404);
  await clerk.context().close();
});
