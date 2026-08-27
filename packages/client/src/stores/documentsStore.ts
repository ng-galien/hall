import type { DocumentMetadata } from "@mairie/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { deleteDocument, downloadDocument, listDocuments, uploadDocument } from "../services/documentsApi";

interface DocumentsState {
  documents: DocumentMetadata[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  upload(form: FormData): Promise<boolean>;
  download(document: DocumentMetadata): Promise<boolean>;
  remove(documentId: string): Promise<boolean>;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      set({ documents: await listDocuments(), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async upload(form) {
    set({ error: null });
    try {
      await uploadDocument(form);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async download(document) {
    set({ error: null });
    try {
      await downloadDocument(document);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async remove(documentId) {
    set({ error: null });
    try {
      await deleteDocument(documentId);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
