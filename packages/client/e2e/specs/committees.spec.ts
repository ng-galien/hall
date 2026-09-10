import { expect, test } from "../fixtures/application";

test("adds elected and non elected contacts to a committee and preserves a rank conflict", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(60_000);
  const contacts = (await (await page.request.get("/api/contacts")).json()).entities.map(
    (entry: { properties: { id: string } }) => entry.properties,
  );
  const members = (await (await page.request.get("/api/council-members")).json()).entities.map(
    (entry: { properties: { id: string; contactId: string; rank: number | null } }) => entry.properties,
  );
  const nonElected = contacts.find(
    (contact: { id: string }) => !members.some((member: { contactId: string }) => member.contactId === contact.id),
  );
  expect(nonElected).toBeTruthy();
  const created = await page.request.post("/api/council-committees", {
    data: { name: `Commission annuaire ${Date.now()}`, description: "Organisation des approvisionnements" },
  });
  expect(created.status()).toBe(201);
  const committee = (await created.json()).properties;
  await page.goto(`/app/council-committees/${committee.id}`);
  await page.getByTestId("committee-add-members").click();
  await page.getByTestId(`committee-contact-option-${nonElected.id}`).click();
  await page.getByTestId(`committee-contact-option-${members[0].contactId}`).click();
  await page.getByTestId("committee-membership-start").fill("2026-09-10");
  await page.getByTestId("committee-add-role-member").click();
  await expect(page.getByTestId(`committee-membership-${nonElected.id}`)).toBeVisible();
  await expect(page.getByTestId(`committee-membership-${members[0].contactId}`)).toBeVisible();
  await page.reload();
  await page.getByTestId(`committee-membership-${nonElected.id}`).click();
  await expect(page.getByTestId("committee-contact-link")).toHaveAttribute("href", `/app/contacts/${nonElected.id}`);
  await page.screenshot({ path: testInfo.outputPath("committee-contact.png"), fullPage: true });
  await page.getByTestId("committee-contact-link").click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${nonElected.id}$`));
  await page.goto(`/app/council-members/${members[0].id}`);
  const save = page.waitForResponse(
    (response) => response.url().endsWith(`/council-members/${members[0].id}`) && response.request().method() === "PUT",
  );
  await page.getByTestId("member-rank").fill("99");
  expect((await save).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("member-rank")).toHaveValue("99");
  await page.screenshot({ path: testInfo.outputPath("member-rank.png"), fullPage: true });
  await page.goto("/app/council-members");
  await expect(page.getByTestId(/^member-record-/)).toHaveCount(members.length);
  const actualOrder = await page
    .getByTestId(/^member-record-/)
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-testid")?.replace("member-record-", "")),
    );
  const currentMembers = (await (await page.request.get("/api/council-members")).json()).entities.map(
    (entry: { properties: { id: string; rank: number | null } }) => entry.properties,
  );
  const rankedIds = currentMembers
    .filter((member: { rank: number | null }) => member.rank !== null)
    .sort((left: { rank: number }, right: { rank: number }) => left.rank - right.rank)
    .map((member: { id: string }) => member.id);
  expect(actualOrder.slice(0, rankedIds.length)).toEqual(rankedIds);
  await page.goto(`/app/council-members/${members[1].id}`);
  const conflict = page.waitForResponse(
    (response) => response.url().endsWith(`/council-members/${members[1].id}`) && response.request().method() === "PUT",
  );
  await page.getByTestId("member-rank").fill("99");
  expect((await conflict).status()).toBe(409);
  await expect(page.getByTestId("member-rank")).toHaveValue("99");
  await expect(page.getByRole("alert")).toBeVisible();
});
