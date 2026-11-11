import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddIcon } from "../components/icons";
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
import { ListRow, ListRowAvatar, ListRows } from "../components/ui/list-row";
import { formatPhoneNumber } from "../features/council-members/phonePresentation";
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
  const fieldId = useId();
  const visibleMembers = members.filter((member) =>
    matchesQuery(
      query,
      member.contact.firstName,
      member.contact.lastName,
      member.contact.email,
      member.contact.phone,
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
          {canCreate ? (
            <Button variant="default" onClick={() => setAddOpen(true)} data-testid="member-add">
              <AddIcon />
              {t("members.add")}
            </Button>
          ) : null}
        </CollectionToolbar>
        <Modal open={canCreate && addOpen} title={t("members.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit} data-testid="member-create-form">
            <div className="form-grid">
              <div className="grid gap-1.5 admin-edit-wide">
                <Label htmlFor={`${fieldId}-contact`}>{t("members.contact")}</Label>
                <EntitySelect
                  type="contact"
                  name="contactId"
                  testId="member-contact-select"
                  placeholder={t("members.chooseContact")}
                  options={eligibleContacts.map((contact) => ({
                    value: contact.id,
                    label: `${contact.firstName} ${contact.lastName}`,
                  }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-role`}>{t("members.role")}</Label>
                <Select name="role" required defaultValue="councillor">
                  <SelectTrigger id={`${fieldId}-role`} className="w-full" data-testid="member-role-select">
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
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-rank`}>{t("members.rank")}</Label>
                <Input
                  id={`${fieldId}-rank`}
                  name="rank"
                  type="number"
                  min={0}
                  step={1}
                  data-testid="member-create-rank"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-termStartedOn`}>{t("members.termStart")}</Label>
                <Input
                  id={`${fieldId}-termStartedOn`}
                  name="termStartedOn"
                  type="date"
                  required
                  data-testid="member-term-start"
                />
              </div>
            </div>
            <Button variant="default" type="submit" disabled={submitting} data-testid="member-create-submit">
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>
        {visibleMembers.length === 0 ? (
          <EmptyState>{t(members.length === 0 ? "members.empty" : "common.noSearchResults")}</EmptyState>
        ) : (
          <ListRows>
            {visibleMembers.map((member) => {
              const fullName = `${member.contact.firstName} ${member.contact.lastName}`;
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
                  wide={
                    <>
                      <span>{member.contact.email || t("members.noEmail")}</span>
                      <span>
                        {member.contact.phone ? formatPhoneNumber(member.contact.phone) : t("members.noPhone")}
                      </span>
                      <span>{t("members.termSince", { date: formatDate(member.termStartedOn) })}</span>
                      <span>{committeeSummary(member.id)}</span>
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
