import { expect, openMenuEntry, test } from "../fixtures/application";

test("creates a linked user, assigns cumulative roles and disables the account", async ({ appPage: page }) => {
  const contactsResponse = await page.request.get("/api/contacts");
  const contacts = (await contactsResponse.json()).entities.map(
    (entry: { properties: { id: string } }) => entry.properties,
  );
  const membersResponse = await page.request.get("/api/council-members");
  const memberContactIds = (await membersResponse.json()).entities.map(
    (entry: { properties: { contactId: string } }) => entry.properties.contactId,
  );
  const usersResponse = await page.request.get("/api/users");
  const existing = (await usersResponse.json()).entities.map(
    (entry: { properties: { contactId: string | null } }) => entry.properties,
  );
  const contact = contacts.find(
    (candidate: { id: string }) =>
      !memberContactIds.includes(candidate.id) &&
      !existing.some((user: { contactId: string | null }) => user.contactId === candidate.id),
  );
  expect(contact).toBeTruthy();
  await openMenuEntry(page, "users");
  await page.getByTestId("users-add").click();
  await page.getByTestId("user-access-hand-delivered").check();
  await page.getByTestId("user-display-name").fill("Responsable des approvisionnements");
  await page.getByTestId("user-email").fill(`approvisionnements-${Date.now()}@alesia.example`);
  await page.getByTestId("user-password").fill("Hall-test-2026!");
  await page.getByTestId("user-contact-select").click();
  await page
    .getByTestId("user-contact-select-search-result")
    .and(page.locator(`[data-reference-id="${contact.id}"]`))
    .click();
  await expect(page.getByTestId("user-create-submit")).toBeDisabled();
  await page.getByTestId("user-role-clerk").check();
  await page.getByTestId("user-create-submit").click();
  await expect(page.getByTestId("user-detail")).toBeVisible();
  const detailUrl = page.url();
  await page.reload();
  await expect(page.getByTestId("user-contact-link")).toHaveAttribute("href", `/app/contacts/${contact.id}`);
  await page.getByTestId("user-edit-roles").click();
  await page.getByTestId("user-role-contributor").check();
  await page.getByTestId("user-roles-submit").click();
  await expect(page.getByTestId("user-roles-submit")).toHaveCount(0);
  await page.reload();
  const assigned = await page.request.get(`/api/users/${new URL(detailUrl).pathname.split("/").at(-1)}`);
  expect(assigned.ok()).toBe(true);
  const assignedRoles = (await assigned.json()).properties.roles as string[];
  expect([...assignedRoles].sort()).toEqual(["clerk", "contributor"]);
  const roleCatalog = await page.request.get("/api/roles");
  expect(roleCatalog.ok()).toBe(true);
  const roleNames = new Map<string, string>(
    (await roleCatalog.json()).entities.map(({ properties }: { properties: { id: string; name: string } }) => [
      properties.id,
      properties.name,
    ]),
  );
  await expect(page.getByTestId("user-roles")).toHaveText(assignedRoles.map((role) => roleNames.get(role)).join(" · "));
  await openMenuEntry(page, "users");
  await page.getByTestId("collection-search").fill("Responsable des approvisionnements");
  await expect(page.getByTestId("users-collection").locator('[data-slot="list-row"]')).toHaveCount(1);
  await page.goto(detailUrl);
  await page.getByTestId("user-disable").click();
  await page.getByTestId("user-disable-confirm").click();
  await expect(page.getByTestId("user-status")).toHaveText("Disabled");
  await expect(page.getByTestId("user-disable")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("user-status")).toHaveText("Disabled");
});

test("preserves a rejected administrator role change and duplicate account form", async ({ appPage: page }) => {
  const response = await page.request.get("/api/users");
  const users = (await response.json()).entities.map(
    (entry: { properties: { id: string; email: string; contactId: string | null; roles: string[] } }) =>
      entry.properties,
  );
  const admin = users.find((user: { roles: string[] }) => user.roles.includes("administrator"));
  await page.goto(`/app/users/${admin.id}`);
  await expect(page.getByTestId("user-disable")).toHaveCount(0);
  await page.getByTestId("user-edit-roles").click();
  await page.getByTestId("user-role-administrator").uncheck();
  await page.getByTestId("user-role-contributor").check();
  const rejection = page.waitForResponse(
    (result) => result.url().endsWith(`/users/${admin.id}/roles`) && result.request().method() === "PUT",
  );
  await page.getByTestId("user-roles-submit").click();
  expect((await rejection).status()).toBe(409);
  await expect(page.getByTestId("user-role-contributor")).toBeChecked();
  await expect(page.getByTestId("user-role-administrator")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await openMenuEntry(page, "users");
  await page.getByTestId("users-add").click();
  await page.getByTestId("user-access-hand-delivered").check();
  await page.getByTestId("user-display-name").fill("Doublon à corriger");
  await page.getByTestId("user-email").fill(admin.email);
  await page.getByTestId("user-password").fill("Hall-test-2026!");
  await page.getByTestId("user-role-contributor").check();
  const conflict = page.waitForResponse(
    (result) => result.url().endsWith("/api/users") && result.request().method() === "POST",
  );
  await page.getByTestId("user-create-submit").click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByTestId("user-display-name")).toHaveValue("Doublon à corriger");
  await expect(page.getByTestId("user-create-form").getByRole("alert")).toBeVisible();
  const contactResponse = await page.request.post("/api/contacts", {
    data: {
      firstName: "Contact",
      lastName: "Unicité",
      organizationName: null,
      jobTitle: null,
      email: null,
      mobilePhone: null,
      personalPhone: null,
      professionalPhone: null,
      notes: "",
    },
  });
  expect(contactResponse.status()).toBe(201);
  const contactId = (await contactResponse.json()).properties.id;
  const linkedResponse = await page.request.post("/api/users", {
    data: {
      displayName: "Compte déjà lié",
      email: `linked-contact-${Date.now()}@alesia.example`,
      password: "Hall-test-2026!",
      roles: ["contributor"],
      contactId,
    },
  });
  expect(linkedResponse.status()).toBe(201);
  await page.reload();
  await page.getByTestId("users-add").click();
  await page.getByTestId("user-access-hand-delivered").check();
  await page.getByTestId("user-display-name").fill("Doublon à corriger");
  await page.getByTestId("user-password").fill("Hall-test-2026!");
  await page.getByTestId("user-role-contributor").check();
  await page.getByTestId("user-email").fill(`duplicate-contact-${Date.now()}@alesia.example`);
  await page.getByTestId("user-contact-select").click();
  await page
    .getByTestId("user-contact-select-search-result")
    .and(page.locator(`[data-reference-id="${contactId}"]`))
    .click();
  const contactConflict = page.waitForResponse(
    (result) => result.url().endsWith("/api/users") && result.request().method() === "POST",
  );
  await page.getByTestId("user-create-submit").click();
  expect((await contactConflict).status()).toBe(409);
  await expect(page.getByTestId("user-create-form").getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("user-display-name")).toHaveValue("Doublon à corriger");
});

test("follows the absence of the users link and actions without deriving roles", async ({ appPage: page }) => {
  const response = await page.request.get("/api/users");
  const user = (await response.json()).entities[0].properties;
  await page.route(`**/api/users/${user.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.actions = [];
    await route.fulfill({ response, contentType: "application/vnd.siren+json", body: JSON.stringify(body) });
  });
  await page.route("**/api", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.links = body.links.filter((link: { rel: string[] }) => !link.rel.includes("users"));
    await route.fulfill({ response, contentType: "application/vnd.siren+json", body: JSON.stringify(body) });
  });
  await page.route("**/api/users", (route) =>
    route.fulfill({ status: 403, contentType: "application/problem+json", json: { code: "permission_denied" } }),
  );
  await page.reload();
  await expect(page.getByTestId("navigation-contacts")).toBeVisible();
  await expect(page.getByTestId("navigation-users")).toHaveCount(0);
  await page.goto("/app/users");
  await expect(page.getByRole("alert")).toBeVisible();
  // A refused list shows the refusal alone: no empty list and no search field.
  await expect(page.getByTestId("users-empty")).toHaveCount(0);
  await expect(page.getByTestId("collection-search")).toHaveCount(0);
  await expect(page.getByTestId("users-add")).toHaveCount(0);
  await expect(page.getByTestId("users-collection")).toHaveCount(0);
  await page.goto(`/app/users/${user.id}`);
  await expect(page.getByTestId("user-detail")).toBeVisible();
  await expect(page.getByTestId("user-edit-roles")).toHaveCount(0);
  await expect(page.getByTestId("user-disable")).toHaveCount(0);
});
