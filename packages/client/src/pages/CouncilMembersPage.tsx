import { formatPhoneNumber } from "@hall/api-contract";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberIcon } from "../components/icons";
import { EntitySelect } from "../components/search/EntitySelect";
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
import { contactPhoneFields, preferredPhone } from "../features/contacts/contactPhones";
import { useDomainRowStatus } from "../features/status/DomainStatusBadge";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

export function CouncilMembersPage() {
  const { t, plural, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { members, create: createMember, error, canCreate } = useCouncilMembersStore();
  const contacts = useContactsStore((state) => state.contacts);
  const { bodies: committees, details, load: loadCommittees, loadAllDetails } = useCouncilCommitteesStore();
  const [addOpen, setAddOpen] = useState(false);
  const { query, setQuery } = useCollectionView();
  const rowStatus = useDomainRowStatus();
  const visibleMembers = members.filter((member) =>
    matchesQuery(
      query,
      member.contact.firstName,
      member.contact.lastName,
      member.contact.email,
      ...contactPhoneFields.map((field) => member.contact[field]).map((phone) => phone && formatPhoneNumber(phone)),
      t(`role.${member.role}`),
    ),
  );
  visibleMembers.sort(
    (left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY),
  );
  const eligibleContacts = contacts.filter(
    (contact) => !members.some((member) => member.active && member.contact.id === contact.id),
  );
  useEffect(() => {
    if (committees.length === 0) void loadCommittees(true);
    else void loadAllDetails();
  }, [committees.length, loadAllDetails, loadCommittees]);
  const memberCommittees = (memberId: string) => {
    const contactId = members.find((member) => member.id === memberId)?.contact.id;
    return Object.values(details)
      .filter((detail) =>
        detail.memberships.some((membership) => membership.contactId === contactId && !membership.endedOn),
      )
      .map((detail) => detail.body)
      .sort((left, right) => left.name.localeCompare(right.name));
  };
  const committeeSummary = (memberId: string) => {
    const currentCommittees = memberCommittees(memberId);
    if (currentCommittees.length === 0) return t("members.noCommitteesShort");
    const visibleCommittees = currentCommittees.slice(0, 2).map((committee) => committee.name);
    const remaining = currentCommittees.length - visibleCommittees.length;
    return [
      ...visibleCommittees,
      remaining > 0 ? plural(remaining, "members.moreCommittees.one", "members.moreCommittees.other") : "",
    ]
      .filter(Boolean)
      .join(", ");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const created = await createMember({
        contactId: form.get("contactId"),
        role: form.get("role"),
        rank: form.get("rank") ? Number(form.get("rank")) : null,
        termStartedOn: form.get("termStartedOn"),
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
      <PageHeader title={t("members.title")} description={t("members.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery}>
          <CreateButton
            testId="member-add"
            options={
              canCreate
                ? [
                    {
                      id: "member",
                      label: t("members.add"),
                      Icon: MemberIcon,
                      nature: "council",
                      onSelect: () => setAddOpen(true),
                    },
                  ]
                : []
            }
          />
        </CollectionToolbar>
        <Modal open={canCreate && addOpen} title={t("members.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit} data-testid="member-create-form">
            <Field label={t("members.contact")}>
              <EntitySelect
                type="contact"
                name="contactId"
                testId="member-contact-select"
                options={eligibleContacts.map((contact) => ({
                  value: contact.id,
                  label: `${contact.firstName} ${contact.lastName}`,
                }))}
              />
            </Field>
            <FieldRow>
              <Field label={t("members.role")}>
                <Select name="role" required defaultValue="councillor">
                  <SelectTrigger className="w-full" data-testid="member-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="councillor" data-testid="member-role-option-councillor">
                      {t("role.councillor")}
                    </SelectItem>
                    <SelectItem value="deputyMayor" data-testid="member-role-option-deputyMayor">
                      {t("role.deputyMayor")}
                    </SelectItem>
                    <SelectItem value="mayor" data-testid="member-role-option-mayor">
                      {t("role.mayor")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("members.rank")}>
                <Input name="rank" type="number" min={0} step={1} data-testid="member-create-rank" />
              </Field>
            </FieldRow>
            <Field label={t("members.termStart")}>
              <Input name="termStartedOn" type="date" required data-testid="member-term-start" />
            </Field>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAddOpen(false)}
                data-testid="member-create-cancel"
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" type="submit" disabled={submitting} data-testid="member-create-submit">
                {t(submitting ? "common.saving" : "common.create")}
              </Button>
            </div>
          </form>
        </Modal>
        {visibleMembers.length === 0 ? (
          <EmptyState>{t(members.length === 0 ? "members.empty" : "common.noSearchResults")}</EmptyState>
        ) : (
          <ListRows>
            {visibleMembers.map((member) => {
              const fullName = `${member.contact.firstName} ${member.contact.lastName}`;
              const phone = preferredPhone(member.contact);
              const coordinates = [member.contact.email, phone && formatPhoneNumber(phone)].filter(Boolean).join(" · ");
              return (
                <ListRow
                  key={member.id}
                  data-testid={`member-record-${member.id}`}
                  to={`/council-members/${member.id}`}
                  openTestId={`member-open-${member.id}`}
                  openLabel={t("members.editNamed", { name: fullName })}
                  head={
                    <ListRowAvatar
                      initials={`${member.contact.firstName.slice(0, 1)}${member.contact.lastName.slice(0, 1)}`}
                    />
                  }
                  title={fullName}
                  detail={`${t(`role.${member.role}`)}${member.rank == null ? "" : ` · ${t("members.rank")} ${member.rank}`}`}
                  status={rowStatus(member.active ? "active" : "inactive")}
                  size="large"
                  lines={[
                    ...(coordinates ? [coordinates] : []),
                    `${t("members.termSince", { date: formatDate(member.termStartedOn) })} · ${committeeSummary(member.id)}`,
                  ]}
                />
              );
            })}
          </ListRows>
        )}
      </div>
    </div>
  );
}
