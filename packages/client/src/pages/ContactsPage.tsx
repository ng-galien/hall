import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ContactIcon } from "../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { CreateButton } from "../components/ui/create-button";
import { ListRow, ListRowAvatar, ListRows } from "../components/ui/list-row";
import { formatPhoneNumber } from "../features/council-members/phonePresentation";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";

export function ContactsPage() {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const { contacts, create, error, canCreate } = useContactsStore();
  const [addOpen, setAddOpen] = useState(false);
  const { query, setQuery } = useCollectionView();
  const visibleContacts = contacts.filter((contact) =>
    matchesQuery(
      query,
      contact.firstName,
      contact.lastName,
      contact.organizationName,
      contact.jobTitle,
      contact.email,
      contact.phone,
    ),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const created = await create({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        organizationName: form.get("organizationName") || null,
        jobTitle: form.get("jobTitle") || null,
        email: form.get("email") || null,
        phone: form.get("phone") || null,
        notes: "",
      });
      if (created) {
        formElement.reset();
        setAddOpen(false);
      }
      return created;
    });
  };
  return (
    <div className="page">
      <PageHeader title={t("contacts.title")} description={t("contacts.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery}>
          <CreateButton
            testId="contacts-add"
            options={
              canCreate
                ? [
                    {
                      id: "contact",
                      label: t("contacts.add"),
                      Icon: ContactIcon,
                      nature: "council",
                      onSelect: () => setAddOpen(true),
                    },
                  ]
                : []
            }
          />
        </CollectionToolbar>
        <Modal open={canCreate && addOpen} title={t("contacts.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit} data-testid="contact-create-form">
            <FieldRow>
              <Field label={t("contacts.firstName")}>
                <Input name="firstName" required data-testid="contact-first-name" />
              </Field>
              <Field label={t("contacts.lastName")}>
                <Input name="lastName" required data-testid="contact-last-name" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label={t("contacts.organization")}>
                <Input name="organizationName" />
              </Field>
              <Field label={t("contacts.jobTitle")}>
                <Input name="jobTitle" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label={t("contacts.phone")}>
                <Input name="phone" type="tel" />
              </Field>
              <Field label={t("contacts.email")}>
                <Input name="email" type="email" />
              </Field>
            </FieldRow>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAddOpen(false)}
                data-testid="contact-create-cancel"
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" type="submit" disabled={submitting} data-testid="contact-create-submit">
                {t(submitting ? "common.saving" : "common.create")}
              </Button>
            </div>
          </form>
        </Modal>
        {visibleContacts.length === 0 ? (
          <EmptyState>{t(contacts.length === 0 ? "contacts.empty" : "common.noSearchResults")}</EmptyState>
        ) : (
          <ListRows>
            {visibleContacts.map((contact) => {
              const name = `${contact.firstName} ${contact.lastName}`;
              return (
                <ListRow
                  key={contact.id}
                  to={`/contacts/${contact.id}`}
                  openTestId={`contact-open-${contact.id}`}
                  openLabel={t("contacts.editNamed", { name })}
                  head={<ListRowAvatar initials={`${contact.firstName.slice(0, 1)}${contact.lastName.slice(0, 1)}`} />}
                  title={name}
                  detail={[contact.jobTitle ?? t("contacts.contact"), contact.organizationName]
                    .filter(Boolean)
                    .join(" · ")}
                  wide={
                    <>
                      <span>{contact.email || t("contacts.noEmail")}</span>
                      <span>{contact.phone ? formatPhoneNumber(contact.phone) : t("contacts.noPhone")}</span>
                    </>
                  }
                />
              );
            })}
          </ListRows>
        )}
      </div>
    </div>
  );
}
