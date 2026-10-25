import type { Contact } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddIcon, EditIcon } from "../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { formatPhoneNumber, phoneHref } from "../features/council-members/phonePresentation";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";

export function ContactsPage() {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const { contacts, create, error, canCreate } = useContactsStore();
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();
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
  const editAction = (contact: Contact) => {
    const name = `${contact.firstName} ${contact.lastName}`;
    const label = t("contacts.editNamed", { name: name });
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon">
            <Link to={`/contacts/${contact.id}`} aria-label={label} data-testid={`contact-open-${contact.id}`}>
              <EditIcon />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  };
  const contactDetails = (contact: Contact) => (
    <div className="council-member-contact">
      {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span>{t("contacts.noEmail")}</span>}
      {contact.phone ? (
        <a href={phoneHref(contact.phone)}>{formatPhoneNumber(contact.phone)}</a>
      ) : (
        <span>{t("contacts.noPhone")}</span>
      )}
      {contact.organizationName ? <span>{contact.organizationName}</span> : null}
    </div>
  );
  return (
    <div className="page">
      <PageHeader title={t("contacts.title")} description={t("contacts.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          {canCreate ? (
            <Button variant="default" onClick={() => setAddOpen(true)} data-testid="contacts-add">
              <AddIcon />
              {t("contacts.add")}
            </Button>
          ) : null}
        </CollectionToolbar>
        <Modal open={canCreate && addOpen} title={t("contacts.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit} data-testid="contact-create-form">
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-firstName`}>{t("contacts.firstName")}</Label>
                <Input id={`${fieldId}-firstName`} name="firstName" required data-testid="contact-first-name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-lastName`}>{t("contacts.lastName")}</Label>
                <Input id={`${fieldId}-lastName`} name="lastName" required data-testid="contact-last-name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-organization`}>{t("contacts.organization")}</Label>
                <Input id={`${fieldId}-organization`} name="organizationName" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-job-title`}>{t("contacts.jobTitle")}</Label>
                <Input id={`${fieldId}-job-title`} name="jobTitle" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-email`}>{t("contacts.email")}</Label>
                <Input id={`${fieldId}-email`} name="email" type="email" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-phone`}>{t("contacts.phone")}</Label>
                <Input id={`${fieldId}-phone`} name="phone" type="tel" />
              </div>
            </div>
            <Button variant="default" type="submit" disabled={submitting} data-testid="contact-create-submit">
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>
        {visibleContacts.length === 0 ? (
          <EmptyState>{t(contacts.length === 0 ? "contacts.empty" : "common.noSearchResults")}</EmptyState>
        ) : layout === "cards" ? (
          <div className="card-grid">
            {visibleContacts.map((contact) => (
              <article className="entity-card entity-card-member" key={contact.id}>
                <div className="council-member-card-heading">
                  <div className="member-identity member-identity-card">
                    <span className="member-avatar member-avatar-large" aria-hidden="true">
                      {contact.firstName[0]}
                      {contact.lastName[0]}
                    </span>
                    <div>
                      <span className="council-member-name">
                        {contact.firstName} {contact.lastName}
                      </span>
                      <span>{contact.jobTitle ?? t("contacts.contact")}</span>
                    </div>
                  </div>
                  {editAction(contact)}
                </div>
                {contactDetails(contact)}
              </article>
            ))}
          </div>
        ) : (
          <div className="data-list">
            {visibleContacts.map((contact) => (
              <div className="data-row council-member-row" key={contact.id}>
                <div className="member-identity">
                  <span className="member-avatar" aria-hidden="true">
                    {contact.firstName[0]}
                    {contact.lastName[0]}
                  </span>
                  <div>
                    <span className="council-member-name">
                      {contact.firstName} {contact.lastName}
                    </span>
                    <span>{contact.jobTitle ?? t("contacts.contact")}</span>
                  </div>
                </div>
                {contactDetails(contact)}
                <span className="council-member-list-status">{editAction(contact)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
