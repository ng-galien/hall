import { type Contact, type CouncilMember, formatPhoneNumber } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { EmptyState, RequestErrorBanner } from "../../components/Ui";
import { LoadingIndicator } from "../../components/ui/loading-indicator";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getContactSiren } from "../../services/contactsApi";
import { getCouncilMemberSiren } from "../../services/councilMembersApi";
import { PhonePageOpening } from "../../shell/PhonePageOpening";
import { usePhoneDocumentPages } from "../../shell/usePhoneLayout";
import { contactPhoneFields, phoneHref } from "../contacts/contactPhones";
import { StatusBadge } from "../status/DomainStatusBadge";
import { PersonDetailField, PersonReferenceDialog } from "./PersonReferenceDialog";

type MemberDetail =
  | { status: "loading" }
  | { status: "ready"; member: CouncilMember; contact: Contact }
  | { status: "error"; error: ApiErrorCode };

/** Opens a member reference: its own page on a phone, otherwise the reference dialog. */
export function MemberReferenceDialog({ memberId, onClose }: { memberId: string; onClose(): void }) {
  return usePhoneDocumentPages() ? (
    <PhonePageOpening to={`/council-members/${memberId}`} onClose={onClose} />
  ) : (
    <MemberReferenceModal memberId={memberId} onClose={onClose} />
  );
}

/** Native member references read the member and its contact without mounting the autosaving member page. */
// @implements-requirement HALL-FR-SRC-030
function MemberReferenceModal({ memberId, onClose }: { memberId: string; onClose(): void }) {
  const { t, formatDate } = useI18n();
  const [detail, setDetail] = useState<MemberDetail>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setDetail({ status: "loading" });
    void getCouncilMemberSiren(memberId)
      .then(({ data: member }) =>
        getContactSiren(member.contactId).then(({ data: contact }) => {
          if (active) setDetail({ status: "ready", member, contact });
        }),
      )
      .catch((error: unknown) => {
        if (active) setDetail({ status: "error", error: apiErrorCode(error) });
      });
    return () => {
      active = false;
    };
  }, [memberId]);

  const contact = detail.status === "ready" ? detail.contact : null;
  return (
    <PersonReferenceDialog
      name={contact ? `${contact.firstName} ${contact.lastName}` : t("members.title")}
      description={t("members.referenceDescription")}
      initials={contact ? `${contact.firstName[0]}${contact.lastName[0]}` : null}
      testId="member-reference-dialog"
      onClose={onClose}
    >
      {detail.status === "loading" ? (
        <div className="p-6">
          <LoadingIndicator aria-label={t("common.loading")} />
        </div>
      ) : null}
      {detail.status === "error" ? (
        <div className="p-6">
          {detail.error === "council_member_not_found" ? (
            <EmptyState>{t("members.notFound")}</EmptyState>
          ) : (
            <RequestErrorBanner error={detail.error} />
          )}
        </div>
      ) : null}
      {detail.status === "ready" ? (
        <div data-testid="member-reference-details">
          <section className="px-6 py-5" aria-labelledby="member-reference-term-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="member-reference-term-title" className="text-sm font-semibold">
                {t("members.term")}
              </h3>
              <StatusBadge value={detail.member.active ? "active" : "inactive"} />
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-5 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
              <PersonDetailField
                label={t("members.role")}
                value={t(`role.${detail.member.role}`)}
                testId="member-reference-role"
              />
              <PersonDetailField
                label={t("members.rank")}
                value={detail.member.rank == null ? t("common.none") : String(detail.member.rank)}
                testId="member-reference-rank"
              />
              <PersonDetailField
                label={t("members.termStart")}
                value={formatDate(detail.member.termStartedOn)}
                testId="member-reference-term-start"
              />
              <PersonDetailField
                label={t("members.termEnd")}
                value={detail.member.termEndedOn ? formatDate(detail.member.termEndedOn) : t("members.currentTerm")}
                testId="member-reference-term-end"
              />
            </dl>
          </section>
          <section className="border-t px-6 py-5" aria-labelledby="member-reference-contact-title">
            <h3 id="member-reference-contact-title" className="text-sm font-semibold">
              {t("members.contact")}
            </h3>
            <dl className="mt-4 grid gap-x-6 gap-y-5 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
              <PersonDetailField
                label={t("members.email")}
                value={detail.contact.email || t("members.noEmail")}
                testId="member-reference-email"
                href={detail.contact.email ? `mailto:${detail.contact.email}` : undefined}
              />
              {contactPhoneFields.map((field) => {
                const phone = detail.contact[field];
                return phone ? (
                  <PersonDetailField
                    key={field}
                    label={t(`contacts.${field}`)}
                    value={formatPhoneNumber(phone)}
                    testId={`member-reference-${field}`}
                    href={phoneHref(phone)}
                  />
                ) : null;
              })}
            </dl>
          </section>
        </div>
      ) : null}
    </PersonReferenceDialog>
  );
}
