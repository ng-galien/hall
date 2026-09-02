import type { Contact } from "@hall/domain";
import { apiSirenRequest, submitSirenAction, submitSirenActionAt } from "./apiClient";

export const listContactsSiren = () => apiSirenRequest<Contact[]>("/contacts");
export const getContactSiren = (reference: string) => apiSirenRequest<Contact>(`/contacts/${reference}`);
export const createContact = (input: Record<string, unknown>) =>
  submitSirenActionAt<Contact>("/contacts", "contact.create", input).then((result) => result.data);
export const updateContact = (reference: string, input: Record<string, unknown>) =>
  getContactSiren(reference).then(({ representation }) => {
    if (!representation) throw new Error("Missing contact Siren representation");
    return submitSirenAction<Contact>(representation, "contact.update", input).then((result) => result.data);
  });
export const archiveContact = (reference: string) =>
  getContactSiren(reference).then(({ representation }) => {
    if (!representation) throw new Error("Missing contact Siren representation");
    return submitSirenAction<Contact>(representation, "contact.archive", {}).then((result) => result.data);
  });
