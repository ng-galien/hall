import type { Contact } from "@hall/api-contract";
import { findSirenAction } from "@hall/api-contract";
import { create } from "zustand";
import { type CouncilMemberView, councilMemberView } from "../models/directory";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { getContactSiren, listContactsSiren } from "../services/contactsApi";
import {
  createCouncilMember,
  getCouncilMemberSiren,
  listCouncilMembersSiren,
  updateCouncilMember,
} from "../services/councilMembersApi";

interface CouncilMembersState {
  members: CouncilMemberView[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  canUpdate: Record<string, boolean>;
  clearError(): void;
  replaceContact(contact: Contact): void;
  load(): Promise<void>;
  loadDetail(reference: string): Promise<CouncilMemberView | null>;
  create(input: Record<string, unknown>): Promise<boolean>;
  update(reference: string, input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilMembersStore = create<CouncilMembersState>((set, get) => ({
  members: [],
  loading: false,
  error: null,
  canCreate: false,
  canUpdate: {},
  clearError() {
    set({ error: null });
  },
  replaceContact(contact: Contact) {
    set((state) => ({
      members: state.members.map((member) =>
        member.contactId === contact.id ? councilMemberView(member, contact) : member,
      ),
    }));
  },
  async load() {
    set({ loading: true, error: null });
    try {
      const [result, contactsResult] = await Promise.all([listCouncilMembersSiren(), listContactsSiren()]);
      const contactsById = new Map(contactsResult.data.map((contact) => [contact.id, contact] as const));
      const members = result.data.flatMap((member) => {
        const contact = contactsById.get(member.contactId);
        return contact ? [councilMemberView(member, contact)] : [];
      });
      if (members.length !== result.data.length) throw new Error("Council member contact projection is missing");
      const canUpdate = Object.fromEntries(
        (result.representation?.entities ?? []).flatMap((entity) => {
          if (!("properties" in entity) || !findSirenAction(entity, "member.update")) return [];
          const memberId = entity.properties?.id;
          return typeof memberId === "string" ? [[memberId, true]] : [];
        }),
      );
      set({
        members,
        canCreate: Boolean(result.representation && findSirenAction(result.representation, "member.create")),
        canUpdate,
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async loadDetail(reference) {
    try {
      const result = await getCouncilMemberSiren(reference);
      const contact = (await getContactSiren(result.data.contactId)).data;
      const member = councilMemberView(result.data, contact);
      set((state) => ({
        members: state.members.some((candidate) => candidate.id === member.id)
          ? state.members.map((candidate) => (candidate.id === member.id ? member : candidate))
          : [...state.members, member],
        canUpdate: {
          ...state.canUpdate,
          [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "member.update")),
        },
      }));
      return member;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async create(input) {
    set({ error: null });
    try {
      await createCouncilMember(input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async update(reference, input) {
    set({ error: null });
    try {
      const updated = await updateCouncilMember(reference, input);
      const contact = (await getContactSiren(updated.contactId)).data;
      const member = councilMemberView(updated, contact);
      set((state) => ({
        members: state.members.map((candidate) => (candidate.id === member.id ? member : candidate)),
      }));
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
