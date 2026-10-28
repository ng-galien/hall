import type { APIResponse } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface Entity<T> {
  properties: T;
  actions?: { name: string }[];
}

async function entities<T>(response: APIResponse): Promise<Entity<T>[]> {
  expect(response.ok(), response.url()).toBeTruthy();
  return ((await response.json()) as { entities?: Entity<T>[] }).entities ?? [];
}

// @verifies-requirement HALL-FR-WSP-450
test("offers business deletion only when Hall accepts it, never for its folder", async ({ appPage: page }) => {
  const businesses = await entities<{ id: string; folderResourceId: string }>(
    await page.request.get("/api/council-business"),
  );
  const agendaItems = await entities<{ councilBusinessId: string | null; startedAt: string | null }>(
    await page.request.get(
      `/api/council-business/agenda-items?${businesses.map(({ properties }) => `councilBusinessId=${properties.id}`).join("&")}`,
    ),
  );
  const examined = businesses.find(({ properties }) =>
    agendaItems.some((item) => item.properties.councilBusinessId === properties.id && item.properties.startedAt),
  )!;
  expect(examined, "an Alésia business examined in a meeting").toBeTruthy();
  expect(examined.actions?.map(({ name }) => name)).not.toContain("council-business.delete");
  const folder = (await (await page.request.get(`/api/resources/${examined.properties.folderResourceId}`)).json()) as {
    actions?: { name: string }[];
  };
  expect(folder.actions?.map(({ name }) => name)).not.toContain("resource.delete");
  const folderDeletion = await page.request.delete(`/api/resources/${examined.properties.folderResourceId}`);
  expect(folderDeletion.status()).toBe(409);
  expect(((await folderDeletion.json()) as { code?: string }).code).toBe("council_business_folder_not_deletable");

  await page.goto("/app/workspace");
  const examinedRow = page.getByTestId(`workspace-business-${examined.properties.id}`);
  await examinedRow.click({ button: "right" });
  await expect(page.getByTestId("workspace-tree-rename")).toBeVisible();
  await expect(page.getByTestId("workspace-tree-delete-business")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByTestId("workspace-create-menu").click();
  await page.getByTestId("workspace-create-councilMatter").click();
  await page.getByTestId("workspace-create-name").fill("Affaire sans suite");
  await page.getByTestId("workspace-create-submit").click();
  await expect(page).toHaveURL(/councilBusiness=/);
  const createdId = new URL(page.url()).searchParams.get("councilBusiness")!;
  await page.goto("/app/workspace");
  const createdRow = page.getByTestId(`workspace-business-${createdId}`);
  await createdRow.click({ button: "right" });
  await page.getByTestId("workspace-tree-delete-business").click();
  await page.getByTestId("business-delete-confirm").click();
  await expect(createdRow).toHaveCount(0);
  expect((await page.request.get(`/api/council-business/${createdId}`)).status()).toBe(404);
});
