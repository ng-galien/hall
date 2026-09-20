import type { Contact } from "@hall/api-contract";
import { findSirenAction } from "@hall/api-contract";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  archiveContact,
  createContact,
  getContactSiren,
  listContactsSiren,
  updateContact,
} from "../services/contactsApi";
import { useCouncilMembersStore } from "./councilMembersStore";

interface ContactsState {
  contacts: Contact[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  canUpdate: Record<string, boolean>;
  canArchive: Record<string, boolean>;
  clearError(): void;
  load(): Promise<void>;
  loadDetail(reference: string): Promise<Contact | null>;
  create(input: Record<string, unknown>): Promise<Contact | null>;
  update(reference: string, input: Record<string, unknown>): Promise<Contact | null>;
  archive(reference: string): Promise<boolean>;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  loading: false,
  error: null,
  canCreate: false,
  canUpdate: {},
  canArchive: {},
  clearError() {
    set({ error: null });
  },
  async load() {
    set({ loading: true, error: null });
    try {
      const result = await listContactsSiren();
      const entities = result.representation?.entities ?? [];
      const capability = (actionName: "contact.update" | "contact.archive") =>
        Object.fromEntries(
          entities.flatMap((entity) => {
            if (!("properties" in entity) || !findSirenAction(entity, actionName)) return [];
            const id = entity.properties?.id;
            return typeof id === "string" ? [[id, true]] : [];
          }),
        );
      set({
        contacts: result.data,
        canCreate: Boolean(result.representation && findSirenAction(result.representation, "contact.create")),
        canUpdate: capability("contact.update"),
        canArchive: capability("contact.archive"),
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async loadDetail(reference) {
    try {
      const result = await getContactSiren(reference);
      set((state) => ({
        contacts: state.contacts.some((contact) => contact.id === result.data.id)
          ? state.contacts.map((contact) => (contact.id === result.data.id ? result.data : contact))
          : [...state.contacts, result.data],
        canUpdate: {
          ...state.canUpdate,
          [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "contact.update")),
        },
        canArchive: {
          ...state.canArchive,
          [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "contact.archive")),
        },
      }));
      return result.data;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async create(input) {
    set({ error: null });
    try {
      const created = await createContact(input);
      await get().load();
      return created;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async update(reference, input) {
    set({ error: null });
    try {
      const updated = await updateContact(reference, input);
      set((state) => ({
        contacts: state.contacts.map((contact) => (contact.id === updated.id ? updated : contact)),
      }));
      useCouncilMembersStore.getState().replaceContact(updated);
      return updated;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async archive(reference) {
    set({ error: null });
    try {
      await archiveContact(reference);
      set((state) => ({ contacts: state.contacts.filter((contact) => contact.id !== reference) }));
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
