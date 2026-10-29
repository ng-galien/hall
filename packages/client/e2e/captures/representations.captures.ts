import type { Page } from "@playwright/test";
import { capture, expect, switchAccount, test, waitForPageEntrance } from "./fixtures";

/** The external representations of Alésia: the list and one representation, recorded by the secretariat. */
test.use({ seedScenario: "default" });

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return ((await response.json()).entities as Array<{ properties: T }>).map((entity) => entity.properties);
}

// @verifies-requirement HALL-FR-DIR-140
test("représentations extérieures : la liste, une représentation et sa lecture sans droit de modifier", async ({
  docsPage: page,
}) => {
  const members = await items<{ id: string; contactId: string }>(page, "/api/council-members");
  const contacts = await items<{ id: string }>(page, "/api/contacts");
  const outsider = contacts.find((contact) => !members.some((member) => member.contactId === contact.id))!;
  const representations = [
    {
      name: "Syndicat intercommunal des eaux de l’Auxois",
      description: "Production et distribution de l’eau potable.",
    },
    { name: "Parc naturel régional du Morvan", description: "Comité syndical du parc." },
  ];
  let first = "";
  for (const [index, representation] of representations.entries()) {
    const created = await page.request.post("/api/council-delegations", { data: representation });
    expect(created.status()).toBe(201);
    const id = (await created.json()).properties.id as string;
    if (!first) first = id;
    for (const [contactId, role, startedOn] of [
      [members[index]!.contactId, "primary", "2026-04-01"],
      [index === 0 ? outsider.id : members[index + 2]!.contactId, "alternate", "2026-04-01"],
    ] as const) {
      const added = await page.request.post(`/api/council-delegations/${id}/memberships`, {
        data: { contactId, role, startedOn },
      });
      expect(added.status()).toBe(201);
    }
  }

  await page.goto("/app/council-delegations");
  await expect(page.getByTestId(`delegation-row-${first}`)).toBeVisible();
  await waitForPageEntrance(page);
  await capture(page, "ecrans/representations-exterieures");

  await page.getByTestId(`delegation-row-${first}`).click();
  await expect(
    page.getByTestId("delegation-role-zone-alternate").getByTestId(`delegation-membership-${outsider.id}`),
  ).toBeVisible();
  await expect(page.getByTestId("delegation-add-members")).toBeVisible();
  await waitForPageEntrance(page);
  await capture(page, "ecrans/representation-exterieure");

  // A councillor account has no preparation right: it reads the representation without changing it.
  await switchAccount(page, "conduite");
  await page.goto(`/app/council-delegations/${first}`);
  await expect(page.getByTestId(`delegation-membership-${outsider.id}`)).toBeVisible();
  await expect(page.getByTestId("delegation-name")).toHaveAttribute("readonly", "");
  await expect(page.getByTestId("delegation-add-members")).toHaveCount(0);
  await expect(page.getByTestId("delegation-archive")).toHaveCount(0);
  await page.goto("/app/council-delegations");
  await expect(page.getByTestId(`delegation-row-${first}`)).toBeVisible();
  await expect(page.getByTestId("delegation-create-open")).toHaveCount(0);
});
