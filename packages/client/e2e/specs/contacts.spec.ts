import { expect, openMenuEntry, test } from "../fixtures/application";

test("creates a contact, edits it and reuses it for a council mandate", async ({ appPage: page }) => {
  test.setTimeout(60_000);
  await page.goto("/app/contacts");
  await page.getByTestId("contacts-add").click();
  await page.getByTestId("contact-first-name").fill("Ariane");
  await page.getByTestId("contact-last-name").fill("Leroux");
  const createResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/contacts") && response.request().method() === "POST",
  );
  await page.getByTestId("contact-create-submit").click();
  expect((await createResponse).status()).toBe(201);

  const contactsResponse = await page.request.get("/api/contacts");
  expect(contactsResponse.ok()).toBe(true);
  const contactsRepresentation = (await contactsResponse.json()) as {
    entities: Array<{ properties: { id: string; firstName: string; lastName: string } }>;
  };
  const contact = contactsRepresentation.entities
    .map(({ properties }) => properties)
    .find(({ firstName, lastName }) => firstName === "Ariane" && lastName === "Leroux");
  expect(contact).toBeTruthy();

  await page.getByTestId(`contact-open-${contact?.id}`).click();
  const updateResponse = page.waitForResponse(
    (response) => response.url().endsWith(`/api/contacts/${contact?.id}`) && response.request().method() === "PUT",
  );
  await page.getByTestId("contact-jobTitle").fill("Directrice de cabinet");
  await updateResponse;
  await page.reload();
  await expect(page.getByTestId("contact-jobTitle")).toHaveValue("Directrice de cabinet");

  await openMenuEntry(page, "administration-council");
  await expect(page.getByTestId("settings-expected-member-count")).toHaveValue("15");
  const settingsResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/council-terms") && response.request().method() === "PUT",
  );
  await page.getByTestId("settings-expected-member-count").fill("16");
  await page.getByTestId("settings-council-term-save").click();
  await settingsResponse;
  await expect(page.getByTestId("settings-council-term-saved")).toBeVisible();

  await openMenuEntry(page, "council-members");
  await page.getByTestId("member-add").click();
  await page.getByTestId("member-contact-select").click();
  await page
    .getByTestId("member-contact-select-search-result")
    .and(page.locator(`[data-reference-id="${contact?.id}"]`))
    .click();
  await page.getByTestId("member-term-start").fill("2026-03-22");
  await page.getByTestId("member-create-submit").click();
  await expect(page.getByTestId("member-create-form")).toHaveCount(0);

  const membersResponse = await page.request.get("/api/council-members");
  expect(membersResponse.ok()).toBe(true);
  const membersRepresentation = (await membersResponse.json()) as {
    entities: Array<{ properties: { id: string; contactId: string } }>;
  };
  const member = membersRepresentation.entities
    .map(({ properties }) => properties)
    .find((candidate) => candidate.contactId === contact?.id);
  expect(member).toBeTruthy();

  await page.getByTestId("navigation-contacts").click();
  await page.getByTestId(`contact-open-${contact?.id}`).click();
  const renameResponse = page.waitForResponse(
    (response) => response.url().endsWith(`/api/contacts/${contact?.id}`) && response.request().method() === "PUT",
  );
  await page.getByTestId("contact-firstName").fill("Arielle");
  await openMenuEntry(page, "council-members");
  await renameResponse;
  await expect(page.getByTestId(`member-open-${member?.id}`)).toBeVisible();
  await page.getByTestId(`member-open-${member?.id}`).click();
  await expect(page.getByTestId("member-contact-link")).toContainText("Arielle Leroux");

  await page.getByTestId("member-contact-link").click();
  await page.getByTestId("contact-firstName").fill("");
  await page.getByTestId("navigation-council").click();
  await expect(page).toHaveURL(new RegExp(`/app/contacts/${contact?.id}$`));
  await expect(page.getByTestId("contact-identity-error")).toBeVisible();

  await page.getByTestId("contact-firstName").fill("Arianna");
  const backNavigationSave = page.waitForResponse(
    (response) => response.url().endsWith(`/api/contacts/${contact?.id}`) && response.request().method() === "PUT",
  );
  await page.goBack();
  await backNavigationSave;
  await expect(page).toHaveURL(new RegExp(`/app/council-members/${member?.id}$`));
  await expect(page.getByTestId("member-contact-link")).toContainText("Arianna Leroux");
});
