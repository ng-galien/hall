import { type APIResponse, type Browser, expect, type Page, test } from "@playwright/test";
import { clearTestDatabase, historySettled, resetAndSeedTestDatabase } from "../fixtures/application";

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
        mobilePhone: null,
        personalPhone: null,
        professionalPhone: null,
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
  await councillor.goto("/app/workspace?path=Commun");
  const councillorRow = councillor.getByTestId(`workspace-business-${business.id}`);
  await expect(councillorRow.locator('[data-slot="context-menu-trigger"]').first()).toBeVisible();
  await councillor.getByTestId(`workspace-business-title-${business.id}`).click({ button: "right" });
  await expect(councillor.getByRole("menu")).toBeVisible();
  await expect(councillor.getByTestId("workspace-tree-delete-business")).toHaveCount(0);
  await councillor.keyboard.press("Escape");
  expect((await councillor.request.delete(`/api/council-business/${business.id}`)).status()).toBe(403);
  await councillor.context().close();

  const clerk = await sessionPage(browser, origin, "clerk@example.test");
  await clerk.goto("/app/workspace?path=Commun");
  const clerkRow = clerk.getByTestId(`workspace-business-${business.id}`);
  await expect(clerkRow.locator('[data-slot="context-menu-trigger"]').first()).toBeVisible();
  await clerk.getByTestId(`workspace-business-title-${business.id}`).click({ button: "right" });
  await clerk.getByTestId("workspace-tree-delete-business").click();
  await clerk.getByTestId("business-delete-confirm").click();
  await expect(clerkRow).toHaveCount(0);
  expect((await clerk.request.get(`/api/council-business/${business.id}`)).status()).toBe(404);
  await clerk.context().close();
});

// @verifies-requirement HALL-FR-USR-060
test("administrator edits a role in Configuration and its existing session gains and loses reading", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await created(
    await admin.request.post("/api/auth/bootstrap", {
      data: { displayName: "Administrator", email: "admin@example.test", password },
    }),
  );
  await admin.goto("/app/settings?category=rights");
  await expect(admin.getByTestId("authorization-administrator-protection")).toBeVisible();
  await expect(admin.getByTestId("authorization-save-role")).toHaveCount(0);
  await admin.getByTestId("authorization-add-role").click();
  await admin.getByTestId("authorization-role-name").fill("Consultation");
  await admin.getByTestId("authorization-access-read").click();
  await admin.getByTestId("authorization-condition-read-always").click();
  await admin.getByTestId("authorization-save-role").click();
  await expect(admin.getByTestId("authorization-saved")).toBeVisible();
  const configuration = (await (await admin.request.get("/api/roles")).json()).properties;
  const role = configuration.roles.find((entry: { name: string }) => entry.name === "Consultation");
  expect(role.grants).toEqual([{ access: "read", condition: "always" }]);
  await created(
    await admin.request.post("/api/users", {
      data: { email: "reader@example.test", displayName: "Reader", password, roles: [role.id], contactId: null },
    }),
  );
  const reader = await sessionPage(browser, baseURL ?? "", "reader@example.test");
  expect((await reader.request.get("/api/contacts")).status()).toBe(200);
  await admin.reload();
  await admin.getByTestId("authorization-role-select").click();
  await admin.getByTestId(`authorization-role-${role.id}`).click();
  await expect(admin.getByTestId("authorization-role-name")).toHaveValue("Consultation");
  await admin.screenshot({ path: "/tmp/hall-authorization-settings.png", fullPage: true });
  await admin.getByTestId("authorization-access-read").click();
  await admin.getByTestId("authorization-condition-read-none").click();
  await admin.getByTestId("authorization-save-role").click();
  await expect(admin.getByTestId("authorization-saved")).toBeVisible();
  expect((await reader.request.get("/api/contacts")).status()).toBe(403);
  await reader.goto("/app/administration/commune");
  await expect(reader.getByTestId("navigation-administration-commune")).toBeVisible();
  await expect(reader.getByTestId("navigation-administration-rights")).toHaveCount(0);
  await expect(reader.getByTestId("navigation-contacts")).toHaveCount(0);
  await reader.context().close();
});

// @verifies-requirement HALL-FR-USR-110
test("only an administrator gives or withdraws the administrator role", async ({ page: admin, browser, baseURL }) => {
  test.setTimeout(120_000);
  await created(
    await admin.request.post("/api/auth/bootstrap", {
      data: { displayName: "Administrator", email: "admin@example.test", password },
    }),
  );
  const roleResponse = await admin.request.post("/api/roles", {
    data: {
      name: "Gestion des comptes",
      revision: 0,
      grants: [
        { access: "read", condition: "always" },
        { access: "user.list", condition: "always" },
        { access: "user.manage", condition: "always" },
      ],
    },
  });
  expect(roleResponse.status(), await roleResponse.text()).toBe(201);
  const roleBody = await roleResponse.json();
  const managerRole = { id: (roleBody.id ?? roleBody.properties.id) as string };
  const account = (email: string, roles: string[]) =>
    admin.request
      .post("/api/users", { data: { email, displayName: email, password, roles, contactId: null } })
      .then((response) => created<{ id: string }>(response));
  await account("manager@example.test", [managerRole.id]);
  const otherAdministrator = await account("second-admin@example.test", ["administrator"]);
  const contributor = await account("contributor@example.test", ["contributor"]);

  const manager = await sessionPage(browser, baseURL ?? "", "manager@example.test");
  await manager.goto("/app/users");
  await manager.getByTestId("users-add").click();
  await expect(manager.getByTestId("user-role-clerk")).toBeVisible();
  await expect(manager.getByTestId("user-role-administrator")).toHaveCount(0);
  await manager.getByTestId("user-create-cancel").click();
  await expect(manager.getByTestId("user-create-cancel")).toHaveCount(0);
  await historySettled(manager);

  await manager.goto(`/app/users/${otherAdministrator.id}`);
  await manager.getByTestId("user-edit-roles").click();
  await expect(manager.getByTestId("user-role-clerk")).toBeVisible();
  await expect(manager.getByTestId("user-role-administrator")).toHaveCount(0);
  await manager.getByTestId("user-role-clerk").check();
  await manager.getByTestId("user-roles-submit").click();
  await expect(manager.getByTestId("user-roles-submit")).toHaveCount(0);
  const kept = (await (await admin.request.get(`/api/users/${otherAdministrator.id}`)).json()).properties.roles;
  expect([...kept].sort()).toEqual(["administrator", "clerk"]);

  const refused = await manager.request.put(`/api/users/${contributor.id}/roles`, {
    data: { roles: ["contributor", "administrator"] },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe("administrator_role_requires_administrator");
  await manager.context().close();

  await admin.addInitScript(() => localStorage.setItem("mairie.locale", "en"));
  await admin.goto("/app/users");
  await admin.getByTestId("users-add").click();
  await expect(admin.getByTestId("user-role-administrator")).toBeVisible();
  await admin.getByTestId("user-create-cancel").click();
  await expect(admin.getByTestId("user-create-cancel")).toHaveCount(0);
  await historySettled(admin);
  await admin.goto(`/app/users/${contributor.id}`);
  await admin.getByTestId("user-edit-roles").click();
  await admin.getByTestId("user-role-administrator").check();
  await admin.getByTestId("user-roles-submit").click();
  await expect(admin.getByTestId("user-roles-submit")).toHaveCount(0);
  const given = (await (await admin.request.get(`/api/users/${contributor.id}`)).json()).properties.roles;
  expect([...given].sort()).toEqual(["administrator", "contributor"]);
});

const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Hall-demo-2026!";

async function entityProperties<T>(response: APIResponse): Promise<T[]> {
  expect(response.ok(), await response.text()).toBeTruthy();
  return (
    ((await response.json()) as { entities?: { properties: T }[] }).entities?.map((entity) => entity.properties) ?? []
  );
}

// @verifies-requirement HALL-FR-MIN-300
test("the secretary in office at the closure drafts the minutes and another councillor only reads them", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  resetAndSeedTestDatabase("minutes");
  const origin = baseURL ?? "";
  expect(
    (
      await admin.request.post("/api/auth/login", {
        data: { email: "vercingetorix@alesia.example", password: demoPassword },
      })
    ).status(),
  ).toBe(200);
  const summaries = await entityProperties<{ id: string; generatedAt: string | null }>(
    await admin.request.get("/api/minutes"),
  );
  const draft = summaries.find((entry) => !entry.generatedAt);
  expect(draft, "The minutes scenario keeps a minutes draft").toBeTruthy();
  const minutes = (
    (await (await admin.request.get(`/api/minutes/${draft!.id}`)).json()) as {
      properties: {
        version: number;
        facts: {
          meeting: { chair: { id: string } | null; secretary: { id: string } | null };
          agenda: { id: string }[];
        };
      };
    }
  ).properties;
  const secretaryMemberId = minutes.facts.meeting.secretary?.id;
  expect(secretaryMemberId).toBeTruthy();
  const members = await entityProperties<{ id: string; contactId: string; active?: boolean }>(
    await admin.request.get("/api/council-members"),
  );
  const secretaryContact = members.find((member) => member.id === secretaryMemberId)!.contactId;
  const otherContact = members.find(
    (member) => member.id !== secretaryMemberId && member.id !== minutes.facts.meeting.chair?.id,
  )!.contactId;
  const users = await entityProperties<{ email: string; contactId: string | null; roles: string[] }>(
    await admin.request.get("/api/users"),
  );
  async function councillorAccount(contactId: string, email: string) {
    const existing = users.find((user) => user.contactId === contactId);
    if (existing) {
      expect(existing.roles).toEqual(["councillor"]);
      return existing.email;
    }
    await created(
      await admin.request.post("/api/users", {
        data: { email, displayName: email, password: demoPassword, roles: ["councillor"], contactId },
      }),
    );
    return email;
  }
  const secretaryEmail = await councillorAccount(secretaryContact, "secretaire@alesia.example");
  const otherEmail = await councillorAccount(otherContact, "conseiller@alesia.example");
  const point = minutes.facts.agenda[0]!;

  const sessionWith = async (email: string) => {
    const context = await browser.newContext({ baseURL: origin });
    await context.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
    expect((await context.request.post("/api/auth/login", { data: { email, password: demoPassword } })).status()).toBe(
      200,
    );
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    return page;
  };

  const secretary = await sessionWith(secretaryEmail);
  await secretary.goto(`/app/minutes/${draft!.id}`);
  const writingArea = secretary.getByTestId(`minutes-section-${point.id}`).getByTestId("editor-writing-area");
  await expect(writingArea).toBeEditable();
  const written = "Rédaction du secrétaire de séance après la clôture.";
  await writingArea.fill(written);
  await expect
    .poll(
      async () =>
        (
          (await (await admin.request.get(`/api/minutes/${draft!.id}`)).json()) as {
            properties: { sections: { agendaItemId: string; content: string }[] };
          }
        ).properties.sections.find((section) => section.agendaItemId === point.id)?.content,
    )
    .toContain(written);
  await expect(secretary.getByTestId("minutes-generate")).toBeVisible();
  await secretary.screenshot({ path: test.info().outputPath("minutes-secretary.png") });
  await secretary.context().close();

  const other = await sessionWith(otherEmail);
  await other.goto(`/app/minutes/${draft!.id}`);
  await expect(other.getByTestId(`minutes-editorial-text-${point.id}`)).toContainText(written);
  await expect(other.getByTestId(`minutes-section-${point.id}`)).toHaveCount(0);
  await expect(other.getByTestId("minutes-generate")).toHaveCount(0);
  const current = (
    (await (await other.request.get(`/api/minutes/${draft!.id}`)).json()) as { properties: { version: number } }
  ).properties;
  const refused = await other.request.patch(`/api/minutes/${draft!.id}/draft`, {
    data: { expectedVersion: current.version, agendaItemId: point.id, content: "Refusé" },
  });
  expect(refused.status()).toBe(403);
  await other.screenshot({ path: test.info().outputPath("minutes-other-councillor.png") });
  await other.context().close();

  await admin.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  await admin.goto("/app/settings?category=rights");
  await admin.getByTestId("authorization-role-select").click();
  await admin.getByTestId("authorization-role-councillor").click();
  await admin.getByTestId("authorization-access-minutes.draft").click();
  await expect(admin.getByTestId("authorization-condition-minutes.draft-minutesSecretary")).toHaveText(
    "Procès-verbal de la séance dont il est secrétaire",
  );
  await expect(admin.getByTestId("authorization-access-minutes.draft")).toContainText(
    "Procès-verbal de la séance dont il est secrétaire",
  );
});
