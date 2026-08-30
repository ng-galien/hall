import { findSirenAction } from "@hall/api-contract";
import type { DocumentResource, FolderRenameResult, RemoteResource, Resource } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import {
  createFolder,
  createRemoteResource,
  createTextResource,
  deleteResource,
  downloadResourceDocument,
  listFolderPaths,
  listResources,
  updateResource,
  uploadEditorAsset,
  uploadResourceDocument,
} from "../services/resourcesApi";

interface ResourcesState {
  resources: Resource[];
  folderPaths: string[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreateText: boolean;
  canCreateRemote: boolean;
  canCreateFolder: boolean;
  canUpload: boolean;
  canUploadEditorAsset: boolean;
  canRenameFolder: boolean;
  updatableIds: string[];
  load(): Promise<void>;
  createText(input: Record<string, unknown>): Promise<boolean>;
  createRemote(input: Record<string, unknown>): Promise<RemoteResource | null>;
  createFolder(parentPath: string, name: string): Promise<string | null>;
  update(resourceId: string, input: Record<string, unknown>): Promise<boolean>;
  upload(form: FormData): Promise<Resource | null>;
  uploadEditorAsset(form: FormData): Promise<Resource | null>;
  download(resource: DocumentResource): Promise<boolean>;
  remove(resourceId: string): Promise<boolean>;
  applyFolderRename(result: FolderRenameResult): void;
}

export const useResourcesStore = create<ResourcesState>((set, get) => ({
  resources: [],
  folderPaths: [],
  loading: false,
  error: null,
  canCreateText: false,
  canCreateRemote: false,
  canCreateFolder: false,
  canUpload: false,
  canUploadEditorAsset: false,
  canRenameFolder: false,
  updatableIds: [],
  async load() {
    set({ loading: true, error: null });
    try {
      const [resources, folderPaths, representation] = await Promise.all([
        listResources(),
        listFolderPaths(),
        sirenRepresentation("/resources"),
      ]);
      const updatableIds = (representation.entities ?? []).flatMap((entity) =>
        "properties" in entity &&
        entity.properties &&
        typeof entity.properties.id === "string" &&
        findSirenAction(entity, "resource.update")
          ? [entity.properties.id]
          : [],
      );
      set({
        resources,
        folderPaths,
        canCreateText: Boolean(findSirenAction(representation, "resource.create-text")),
        canCreateRemote: Boolean(findSirenAction(representation, "resource.create-remote")),
        canCreateFolder: Boolean(findSirenAction(representation, "workspace.create-folder")),
        canUpload: Boolean(findSirenAction(representation, "resource.create-document")),
        canUploadEditorAsset: Boolean(findSirenAction(representation, "resource.create-editor-asset")),
        canRenameFolder: Boolean(findSirenAction(representation, "workspace.rename-folder")),
        updatableIds,
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async createText(input) {
    set({ error: null });
    try {
      await createTextResource(input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async createRemote(input) {
    set({ error: null });
    try {
      const created = await createRemoteResource(input);
      await get().load();
      return created;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async createFolder(parentPath, name) {
    set({ error: null });
    try {
      const created = await createFolder(parentPath, name);
      await get().load();
      return created.path;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async update(resourceId, input) {
    set({ error: null });
    try {
      await updateResource(resourceId, input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async upload(form) {
    set({ error: null });
    try {
      const created = await uploadResourceDocument(form);
      await get().load();
      return created;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async uploadEditorAsset(form) {
    set({ error: null });
    try {
      return await uploadEditorAsset(form);
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async download(resource) {
    set({ error: null });
    try {
      await downloadResourceDocument(resource);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async remove(resourceId) {
    set({ error: null });
    try {
      await deleteResource(resourceId);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  applyFolderRename(result) {
    const prefix = `${result.sourcePath}/`;
    set((state) => ({
      folderPaths: state.folderPaths.map((folderPath) =>
        folderPath === result.sourcePath || folderPath.startsWith(prefix)
          ? `${result.targetPath}${folderPath.slice(result.sourcePath.length)}`
          : folderPath,
      ),
      resources: state.resources.map((resource) => {
        if (resource.folderPath !== result.sourcePath && !resource.folderPath.startsWith(prefix)) return resource;
        return {
          ...resource,
          folderPath: `${result.targetPath}${resource.folderPath.slice(result.sourcePath.length)}`,
          updatedAt: result.updatedAt,
        };
      }),
    }));
  },
}));
