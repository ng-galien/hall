import { findSirenAction } from "@hall/api-contract";
import type { DocumentResource, Resource } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import {
  createTextResource,
  deleteResource,
  downloadResourceDocument,
  listResources,
  updateResource,
  uploadEditorAsset,
  uploadResourceDocument,
} from "../services/resourcesApi";

interface ResourcesState {
  resources: Resource[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreateText: boolean;
  canUpload: boolean;
  canUploadEditorAsset: boolean;
  updatableIds: string[];
  load(): Promise<void>;
  createText(input: Record<string, unknown>): Promise<boolean>;
  update(resourceId: string, input: Record<string, unknown>): Promise<boolean>;
  upload(form: FormData): Promise<Resource | null>;
  uploadEditorAsset(form: FormData): Promise<Resource | null>;
  download(resource: DocumentResource): Promise<boolean>;
  remove(resourceId: string): Promise<boolean>;
}

export const useResourcesStore = create<ResourcesState>((set, get) => ({
  resources: [],
  loading: false,
  error: null,
  canCreateText: false,
  canUpload: false,
  canUploadEditorAsset: false,
  updatableIds: [],
  async load() {
    set({ loading: true, error: null });
    try {
      const resources = await listResources();
      const representation = await sirenRepresentation("/resources");
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
        canCreateText: Boolean(findSirenAction(representation, "resource.create-text")),
        canUpload: Boolean(findSirenAction(representation, "resource.create-document")),
        canUploadEditorAsset: Boolean(findSirenAction(representation, "resource.create-editor-asset")),
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
}));
