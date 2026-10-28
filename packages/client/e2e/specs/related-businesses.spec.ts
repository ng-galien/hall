import type { APIResponse } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface Entity<T> {
  properties: T;
}

async function items<T>(response: APIResponse): Promise<T[]> {
  expect(response.ok(), response.url()).toBeTruthy();
  const body = (await response.json()) as { entities?: Entity<T>[]; properties?: { items?: T[] } };
  return body.properties?.items ?? (body.entities ?? []).map((entity) => entity.properties);
}

test("shows the council businesses of an Alésia spreadsheet and map", async ({ appPage: page }) => {
  const councilBusinesses = await items<{ id: string; folderResourceId: string }>(
    await page.request.get("/api/council-business"),
  );
  const businesses: { id: string; title: string }[] = [];
  for (const business of councilBusinesses) {
    const folder = await page.request.get(`/api/resources/${business.folderResourceId}`);
    expect(folder.ok(), folder.url()).toBeTruthy();
    businesses.push({ id: business.id, title: ((await folder.json()) as Entity<{ name: string }>).properties.name });
  }
  const attachments = new Map<string, { id: string; title: string }[]>();
  for (const business of businesses) {
    for (const resource of await items<{ id: string; resourceId?: string }>(
      await page.request.get(`/api/council-business/${business.id}/resources`),
    )) {
      const id = resource.resourceId ?? resource.id;
      attachments.set(id, [...(attachments.get(id) ?? []), business]);
    }
  }
  const catalog = await items<{ id: string; kind: string }>(await page.request.get("/api/resources/catalog"));
  for (const kind of ["spreadsheet", "geographic"]) {
    const resource = catalog.find((entry) => entry.kind === kind && attachments.has(entry.id));
    expect(resource, `an attached ${kind} of the Alésia dataset`).toBeTruthy();
    const expected = attachments.get(resource!.id)!;
    await page.goto(`/app/workspace?resource=${resource!.id}`);
    const related = page.getByTestId("resource-related-businesses");
    await expect(related.getByTestId(/^resource-related-business-/)).toHaveCount(expected.length);
    for (const business of expected) {
      await expect(related.getByTestId(`resource-related-business-${business.id}`)).toContainText(business.title);
    }
  }
});
