import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

/* Représentations extérieures: bodies where the municipality is represented by dated primary and alternate contacts. */

async function properties<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return ((await response.json()).entities as Array<{ properties: T }>).map((entry) => entry.properties);
}

async function pickContact(page: Page, contactId: string) {
  await page
    .getByTestId("delegation-contact-search-result")
    .and(page.locator(`[data-reference-id="${contactId}"]`))
    .click();
}

// @verifies-requirement HALL-FR-DIR-140
test("the secretariat records a representation with dated primary and alternate representatives, then archives it", async ({
  appPage: page,
}) => {
  test.setTimeout(90_000);
  const contacts = await properties<{ id: string }>(page, "/api/contacts");
  const members = await properties<{ id: string; contactId: string }>(page, "/api/council-members");
  const elected = members[0]!;
  const outsider = contacts.find((contact) => !members.some((member) => member.contactId === contact.id))!;
  const name = `Syndicat des eaux ${Date.now()}`;

  await page.goto("/app/");
  await page.getByTestId("navigation-council-delegations").click();
  await expect(page).toHaveURL(/\/app\/council-delegations$/);
  await page.getByTestId("delegation-create-open").click();
  await page.getByTestId("delegation-create-name").fill(name);
  await page.getByTestId("delegation-create-description").fill("Distribution de l’eau potable");
  await page.getByTestId("delegation-create-submit").click();
  await expect(page).toHaveURL(/\/app\/council-delegations\/[^/]+$/);
  const delegationId = page.url().split("/").at(-1)!;

  await page.getByTestId("delegation-add-members").click();
  await page.getByTestId("delegation-membership-start").fill("2026-04-01");
  await pickContact(page, elected.contactId);
  await page.getByTestId("delegation-add-role-primary").click();
  await expect(
    page.getByTestId("delegation-role-zone-primary").getByTestId(`delegation-membership-${elected.contactId}`),
  ).toBeVisible();
  await page.getByTestId("delegation-add-members").click();
  await page.getByTestId("delegation-membership-start").fill("2026-05-15");
  await pickContact(page, outsider.id);
  await page.getByTestId("delegation-add-role-alternate").click();
  await expect(
    page.getByTestId("delegation-role-zone-alternate").getByTestId(`delegation-membership-${outsider.id}`),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("delegation-name")).toHaveValue(name);
  await expect(page.getByTestId("delegation-role-zone-primary")).toContainText("1 avril 2026");
  await expect(page.getByTestId("delegation-role-zone-alternate")).toContainText("15 mai 2026");
  const memberships = await properties<{ contactId: string; role: string; startedOn: string; endedOn: string | null }>(
    page,
    `/api/council-delegations/${delegationId}/memberships`,
  );
  expect(
    memberships.map(({ contactId, role, startedOn, endedOn }) => ({ contactId, role, startedOn, endedOn })),
  ).toEqual(
    expect.arrayContaining([
      { contactId: elected.contactId, role: "primary", startedOn: "2026-04-01", endedOn: null },
      { contactId: outsider.id, role: "alternate", startedOn: "2026-05-15", endedOn: null },
    ]),
  );

  await page.goto(`/app/council-members/${elected.id}`);
  await expect(page.getByTestId("member-delegations").getByTestId(`member-delegation-${delegationId}`)).toContainText(
    name,
  );
  await page.getByTestId(`member-delegation-${delegationId}`).click();
  await expect(page).toHaveURL(new RegExp(`/council-delegations/${delegationId}$`));

  await page.getByTestId(`delegation-membership-${outsider.id}`).click();
  await page.getByTestId("delegation-end-membership").click();
  await page.getByTestId("delegation-end-membership-date").fill("2026-09-30");
  await page.getByTestId("delegation-end-membership-confirm").click();
  await expect(page.getByTestId(`delegation-membership-${outsider.id}`)).toHaveCount(0);
  await expect(page.locator(".admin-membership-history")).toContainText("30 septembre 2026");

  await page.getByTestId("delegation-archive").click();
  await expect(page).toHaveURL(/\/app\/council-delegations$/);
  await expect(page.getByTestId(`delegation-row-${delegationId}`)).toContainText("Archived");
  await page.goto(`/app/council-members/${elected.id}`);
  await expect(page.getByTestId(`member-delegation-${delegationId}`)).toHaveCount(0);
});

// @verifies-requirement HALL-FR-DIR-140
test("an account without the representation actions reads them without any way to change them", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/council-delegations", {
    data: { name: `Parc naturel ${Date.now()}`, description: "Charte du parc" },
  });
  expect(created.status()).toBe(201);
  const delegation = (await created.json()).properties as { id: string; name: string };
  const [contact] = await properties<{ id: string }>(page, "/api/contacts");
  expect(
    (
      await page.request.post(`/api/council-delegations/${delegation.id}/memberships`, {
        data: { contactId: contact!.id, role: "primary", startedOn: "2026-02-01" },
      })
    ).status(),
  ).toBe(201);
  await page.route("**/api/council-delegations**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const strip = (entity: { actions?: unknown[]; entities?: unknown[] }) => {
      entity.actions = [];
      for (const child of entity.entities ?? []) strip(child as typeof entity);
    };
    strip(body);
    await route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.goto("/app/council-delegations");
  await expect(page.getByTestId(`delegation-row-${delegation.id}`)).toContainText(delegation.name);
  await expect(page.getByTestId("delegation-create-open")).toHaveCount(0);
  await page.getByTestId(`delegation-row-${delegation.id}`).click();
  await expect(page.getByTestId("delegation-name")).toHaveAttribute("readonly", "");
  await expect(page.getByTestId(`delegation-membership-${contact!.id}`)).toBeVisible();
  await expect(page.getByTestId("delegation-add-members")).toHaveCount(0);
  await expect(page.getByTestId("delegation-archive")).toHaveCount(0);
  await page.getByTestId(`delegation-membership-${contact!.id}`).click();
  await expect(page.getByTestId("delegation-end-membership")).toHaveCount(0);
});
