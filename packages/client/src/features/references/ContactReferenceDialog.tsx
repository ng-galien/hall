import { type Contact, formatPhoneNumber } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { EmptyState, RequestErrorBanner } from "../../components/Ui";
import { LoadingIndicator } from "../../components/ui/loading-indicator";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getContactSiren } from "../../services/contactsApi";
import { PhonePageOpening } from "../../shell/PhonePageOpening";
import { usePhoneDocumentPages } from "../../shell/usePhoneLayout";
import { contactPhoneFields, phoneHref } from "../contacts/contactPhones";
import { PersonDetailField, PersonReferenceDialog } from "./PersonReferenceDialog";

type ContactDetail =
  | { status: "loading" }
  | { status: "ready"; contact: Contact }
  | { status: "error"; error: ApiErrorCode };

/** Opens a contact reference: its own page on a phone, otherwise the reference dialog. */
export function ContactReferenceDialog({ contactId, onClose }: { contactId: string; onClose(): void }) {
  return usePhoneDocumentPages() ? (
    <PhonePageOpening to={`/contacts/${contactId}`} onClose={onClose} />
  ) : (
    <ContactReferenceModal contactId={contactId} onClose={onClose} />
  );
}

/** Contact references consult the HTTP detail without mounting the autosaving contact page. */
// @implements-requirement HALL-FR-SRC-030
function ContactReferenceModal({ contactId, onClose }: { contactId: string; onClose(): void }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<ContactDetail>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setDetail({ status: "loading" });
    void getContactSiren(contactId).then(
      ({ data }) => {
        if (active) setDetail({ status: "ready", contact: data });
      },
      (error: unknown) => {
        if (active) setDetail({ status: "error", error: apiErrorCode(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [contactId]);

  return (
    <PersonReferenceDialog
      name={detail.status === "ready" ? `${detail.contact.firstName} ${detail.contact.lastName}` : t("contacts.title")}
      description={t("contacts.detailDescription")}
      initials={detail.status === "ready" ? `${detail.contact.firstName[0]}${detail.contact.lastName[0]}` : null}
      testId="contact-reference-dialog"
      onClose={onClose}
    >
      {detail.status === "loading" ? (
        <div className="p-6">
          <LoadingIndicator aria-label={t("common.loading")} />
        </div>
      ) : null}
      {detail.status === "error" ? (
        <div className="p-6">
          {detail.error === "contact_not_found" ? (
            <EmptyState>{t("contacts.notFound")}</EmptyState>
          ) : (
            <RequestErrorBanner error={detail.error} />
          )}
        </div>
      ) : null}
      {detail.status === "ready" ? (
        <div data-testid="contact-reference-details">
          <dl className="grid gap-x-6 gap-y-5 px-6 py-5 sm:grid-cols-2">
            {(["jobTitle", "organizationName"] as const).map((key) => (
              <PersonDetailField
                key={key}
                label={t(`contacts.${key === "organizationName" ? "organization" : key}`)}
                value={detail.contact[key] || t("common.none")}
                testId={`contact-reference-${key}`}
              />
            ))}
          </dl>
          <section className="border-t px-6 py-5" aria-labelledby="contact-reference-coordinates">
            <h3 id="contact-reference-coordinates" className="text-sm font-semibold">
              {t("contacts.identity")}
            </h3>
            <dl className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <PersonDetailField
                label={t("contacts.email")}
                value={detail.contact.email || t("common.none")}
                testId="contact-reference-email"
                href={detail.contact.email ? `mailto:${detail.contact.email}` : undefined}
              />
              {contactPhoneFields.map((field) => {
                const phone = detail.contact[field];
                return phone ? (
                  <PersonDetailField
                    key={field}
                    label={t(`contacts.${field}`)}
                    value={formatPhoneNumber(phone)}
                    testId={`contact-reference-${field}`}
                    href={phoneHref(phone)}
                  />
                ) : null;
              })}
            </dl>
          </section>
          <section className="border-t px-6 py-5" aria-labelledby="contact-reference-notes-title">
            <h3 id="contact-reference-notes-title" className="text-sm font-semibold">
              {t("contacts.notes")}
            </h3>
            <p
              className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed"
              data-testid="contact-reference-notes"
            >
              {detail.contact.notes || t("common.none")}
            </p>
          </section>
        </div>
      ) : null}
    </PersonReferenceDialog>
  );
}
