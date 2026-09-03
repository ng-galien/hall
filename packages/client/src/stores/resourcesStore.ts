import { findSirenAction } from "@hall/api-contract";
import type { DocumentResource, Resource } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import {
  downloadResourceDocument,
  listResources,
  uploadEditorAsset,
  uploadResourceDocument,
} from "../services/resourcesApi";

interface ResourcesState {
  resources: Resource[];
  loading: boolean;
  error: ApiErrorCode | null;
  canUpload: boolean;
  canUploadEditorAsset: boolean;
  load(): Promise<void>;
  upload(form: FormData): Promise<Resource | null>;
  uploadEditorAsset(form: FormData): Promise<Resource | null>;
  download(resource: DocumentResource): Promise<boolean>;
}

export const useResourcesStore = create<ResourcesState>((set, get) => ({
  resources: [],
  loading: false,
  error: null,
  canUpload: false,
  canUploadEditorAsset: false,
  async load() {
    set({ loading: true, error: null });
    try {
      const [resources, representation] = await Promise.all([listResources(), sirenRepresentation("/resources")]);
      set({
        resources,
        canUpload: Boolean(findSirenAction(representation, "resource.create-document")),
        canUploadEditorAsset: Boolean(findSirenAction(representation, "resource.create-editor-asset")),
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
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
}));
