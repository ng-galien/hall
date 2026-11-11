import type { MailMessage, MailPreview, MailRecipient, MailRecipientGroup } from "@hall/api-contract";
import { apiSirenRequest } from "./apiClient";

export interface MailRecipientSelections {
  contacts: Array<Omit<MailRecipient, "kind">>;
  councilContactIds: string[];
  committees: Array<{ id: string; name: string; contactIds: string[] }>;
}
export const listMail = () => apiSirenRequest<MailMessage[]>("/mail");
export const openMail = (id: string) => apiSirenRequest<MailMessage>(`/mail/${id}`);
export const previewMail = (id: string) => apiSirenRequest<MailPreview>(`/mail/${id}/preview`);
export const listMailGroups = () => apiSirenRequest<MailRecipientGroup[]>("/mail-recipient-groups");
export const listMailRecipients = () => apiSirenRequest<MailRecipientSelections>("/mail/recipients");
