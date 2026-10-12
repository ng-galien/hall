import { expect, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-BUS-070
test("links several commissions from an affair and navigates both directions", async ({ appPage: page }) => {
  const businessesResponse = await page.request.get("/api/council-business/workspace-items");
  expect(businessesResponse.ok()).toBeTruthy();
  const business = (await businessesResponse.json()).entities[0].properties as {
    id: string;
    title: string;
    folderPath: string;
  };
  expect(business).toBeTruthy();

  const unique = Date.now();
  const committees = [];
  for (const name of [`Commission lien écoles ${unique}`, `Commission lien jeunesse ${unique}`]) {
    const response = await page.request.post("/api/council-committees", { data: { name, description: "" } });
    expect(response.status()).toBe(201);
    committees.push((await response.json()).properties as { id: string; name: string });
  }

  const businessUrl = `/app/workspace?${new URLSearchParams({ path: business.folderPath, councilBusiness: business.id })}`;
  await page.goto(businessUrl);
  const search = page.getByTestId("business-committee-search-input");
  await expect(search).toBeVisible();
  // A click opens the whole list of available commissions, like a combo box; typing narrows it.
  await search.click();
  await expect(page.getByTestId("business-committee-result").filter({ hasText: committees[0].name })).toBeVisible();
  await search.press("Escape");
  await expect(page.getByTestId("business-committee-results")).toHaveCount(0);
  await search.press("ArrowDown");
  await expect(page.getByTestId("business-committee-results")).toBeVisible();
  await search.fill("Commission lien");
  await expect(page.getByTestId("business-committee-result")).toHaveCount(2);
  await page.getByTestId("business-committee-result").filter({ hasText: committees[0].name }).click();
  await expect(page.getByTestId("business-committee-badge")).toHaveCount(1);

  await search.fill("jeunesse");
  await search.press("Enter");
  await expect(page.getByTestId("business-committee-badge")).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId("business-committee-badge")).toHaveCount(2);

  const firstBadge = page.getByTestId("business-committee-badge").filter({ hasText: committees[0].name });
  const committeeLink = firstBadge.getByTestId("business-committee-link");
  await expect(committeeLink).toHaveAttribute("href", `/app/council-committees/${committees[0].id}`);
  await committeeLink.click();
  await expect(page.getByTestId("committee-business-link")).toContainText(business.title);
  await page.getByTestId("committee-business-link").click();
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  await expect(page.getByTestId("business-committee-badge")).toHaveCount(2);

  await page
    .getByTestId("business-committee-badge")
    .filter({ hasText: committees[0].name })
    .getByTestId("business-committee-remove")
    .click();
  await expect(page.getByTestId("business-committee-badge")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("business-committee-badge")).toHaveCount(1);
  await page.goto(`/app/council-committees/${committees[0].id}`);
  await expect(page.getByTestId("committee-business-link")).toHaveCount(0);
});
