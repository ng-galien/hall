import { describe, expect, it } from "vitest";
import { createServiceTestServer } from "./testServer.js";

describe("reference entity resolver", () => {
  it("hydrates CouncilBusiness labels from their current folder resource", async () => {
    const { container } = await createServiceTestServer();
    const business = await container.cradle.councilClient.createBusiness({
      path: "seed",
      name: "Sujet initial",
      reportName: "Rapport principal",
      reportContent: "Rapport",
    });

    await container.cradle.resourcesClient.relocate(business.folderResourceId, {
      path: "seed",
      name: "Sujet renommé",
    });

    await expect(container.cradle.referenceEntityResolver.list("councilBusiness")).resolves.toEqual([
      { type: "councilBusiness", id: business.id, label: "Sujet renommé" },
    ]);
    await expect(container.cradle.referenceEntityResolver.resolve("councilBusiness", business.id)).resolves.toEqual({
      type: "councilBusiness",
      id: business.id,
      label: "Sujet renommé",
      target: business,
    });
  });
});
