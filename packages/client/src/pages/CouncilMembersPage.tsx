import type { CouncilMember } from "@hall/domain";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddIcon, EditIcon } from "../components/icons";
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
import { formatPhoneNumber, phoneHref } from "../features/council-members/phonePresentation";
import { StatusBadge } from "../features/status/DomainStatusBadge";
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
  const { layout, setLayout, query, setQuery } = useCollectionView();
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
  const renderCommitteeLinks = (memberId: string) => {
    const currentCommittees = memberCommittees(memberId);
    if (currentCommittees.length === 0) {
      return <span className="council-member-no-committees">{t("members.noCommitteesShort")}</span>;
    }
    const visibleCommittees = currentCommittees.slice(0, 2);
    const remaining = currentCommittees.length - visibleCommittees.length;
    return (
      <span className="council-member-committee-links">
        <span className="sr-only">{t("members.committees")} : </span>
        {visibleCommittees.map((committee) => (
          <Link to={`/council-committees/${committee.id}`} key={committee.id}>
            {committee.name}
          </Link>
        ))}
        {remaining > 0 ? (
          <Link to={`/council-members/${memberId}#committees`}>
            {plural(remaining, "members.moreCommittees.one", "members.moreCommittees.other")}
          </Link>
        ) : null}
      </span>
    );
  };
  const renderEditAction = (member: CouncilMember) => {
    const fullName = `${member.contact.firstName} ${member.contact.lastName}`;
    const label = t("members.editNamed", { name: fullName });
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="council-member-edit-action">
            <Link to={`/council-members/${member.id}`} aria-label={label} data-testid={`member-open-${member.id}`}>
              <EditIcon />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
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
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
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
        ) : layout === "cards" ? (
          <div className="card-grid">
            {visibleMembers.map((member) => (
              <article
                className="entity-card entity-card-member"
                data-testid={`member-record-${member.id}`}
                key={member.id}
              >
                <div className="council-member-card-heading">
                  <div className="member-identity member-identity-card">
                    <span className="member-avatar member-avatar-large" aria-hidden="true">
                      {member.contact.firstName.slice(0, 1)}
                      {member.contact.lastName.slice(0, 1)}
                    </span>
                    <div>
                      <span className="council-member-name">
                        {member.contact.firstName} {member.contact.lastName}
                      </span>
                      <span>
                        {t(`role.${member.role}`)}
                        {member.rank == null ? "" : ` · ${t("members.rank")} ${member.rank}`}
                      </span>
                    </div>
                  </div>
                  {renderEditAction(member)}
                </div>
                <div className="council-member-contact">
                  {member.contact.email ? (
                    <a href={`mailto:${member.contact.email}`}>{member.contact.email}</a>
                  ) : (
                    <span>{t("members.noEmail")}</span>
                  )}
                  {member.contact.phone ? (
                    <a href={phoneHref(member.contact.phone)}>{formatPhoneNumber(member.contact.phone)}</a>
                  ) : (
                    <span>{t("members.noPhone")}</span>
                  )}
                  <span>{t("members.termSince", { date: formatDate(member.termStartedOn) })}</span>
                </div>
                {renderCommitteeLinks(member.id)}
                <span className="entity-card-footer">
                  <span className="council-member-mandate">
                    {t("members.term")}
                    <StatusBadge value={member.active ? "active" : "inactive"} />
                  </span>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="data-list">
            {visibleMembers.map((member) => (
              <div
                className="data-row council-member-row council-member-record"
                data-testid={`member-record-${member.id}`}
                key={member.id}
              >
                <div className="member-identity">
                  <span className="member-avatar" aria-hidden="true">
                    {member.contact.firstName.slice(0, 1)}
                    {member.contact.lastName.slice(0, 1)}
                  </span>
                  <div>
                    <span className="council-member-name">
                      {member.contact.firstName} {member.contact.lastName}
                    </span>
                    <span>
                      {t(`role.${member.role}`)}
                      {member.rank == null ? "" : ` · ${t("members.rank")} ${member.rank}`}
                    </span>
                  </div>
                </div>
                <div className="council-member-contact council-member-list-contact">
                  {member.contact.email ? (
                    <a href={`mailto:${member.contact.email}`}>{member.contact.email}</a>
                  ) : (
                    <span>{t("members.noEmail")}</span>
                  )}
                  {member.contact.phone ? (
                    <a href={phoneHref(member.contact.phone)}>{formatPhoneNumber(member.contact.phone)}</a>
                  ) : (
                    <span>{t("members.noPhone")}</span>
                  )}
                  <span>{t("members.termSince", { date: formatDate(member.termStartedOn) })}</span>
                </div>
                <span className="council-member-list-committees">{renderCommitteeLinks(member.id)}</span>
                <span className="council-member-list-status">
                  <span className="council-member-mandate">
                    {t("members.term")}
                    <StatusBadge value={member.active ? "active" : "inactive"} />
                  </span>
                  {renderEditAction(member)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
