import { expect, it, vi } from "vitest";
import type { CouncilClient } from "../clients/councilClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import { createCouncilBusinessWorkspaceService } from "../services/councilBusinessWorkspaceService.js";

// @verifies-requirement HALL-FR-WSP-370
it("builds sidebar navigation from metadata without opening any report", async () => {
  const listBusinesses = vi
    .fn()
    .mockResolvedValue([{ id: "business", folderResourceId: "folder", reportResourceId: "report" }]);
  const listBusinessWorkspaceItems = vi.fn(() => {
    throw new Error("report content must not be read");
  });
  const open = vi.fn(() => {
    throw new Error("individual resources must not be opened");
  });
  const listAll = vi.fn(() => {
    throw new Error("the whole catalog must not be read");
  });
  const listFolderNavigation = vi.fn().mockResolvedValue({
    folders: [
      {
        id: "folder",
        kind: "folder",
        name: "Tourisme",
        path: "Tourisme et loisirs",
        fullPath: "Tourisme et loisirs/Tourisme",
        slug: "tourisme",
      },
    ],
    paths: ["Tourisme et loisirs/Tourisme"],
  });
  const service = createCouncilBusinessWorkspaceService({
    councilClient: { listBusinesses, listBusinessWorkspaceItems } as unknown as CouncilClient,
    resourcesClient: { listAll, listFolderNavigation, open } as unknown as ResourcesClient,
  });

  const index = await service.listNavigationIndex();
  expect(index.businesses).toEqual([
    {
      id: "business",
      folderResourceId: "folder",
      reportResourceId: "report",
      title: "Tourisme",
      folderPath: "Tourisme et loisirs",
    },
  ]);
  expect(index.catalog).toHaveLength(1);
  expect(index.paths).toEqual(["Tourisme et loisirs/Tourisme"]);
  expect(listBusinesses).toHaveBeenCalledOnce();
  expect(listFolderNavigation).toHaveBeenCalledOnce();
  expect(listAll).not.toHaveBeenCalled();
  expect(listBusinessWorkspaceItems).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});
