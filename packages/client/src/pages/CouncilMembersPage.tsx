import type { CouncilMember } from "@hall/domain";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { StatusBadge } from "../features/status/DomainStatusBadge";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

export function CouncilMembersPage() {
  const { t, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { members, create: createMember, error, canCreate } = useCouncilMembersStore();
  const { committees, details, load: loadCommittees, loadAllDetails } = useCouncilCommitteesStore();
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();
  const visibleMembers = members.filter((member) =>
    matchesQuery(query, member.firstName, member.lastName, member.email, member.phone, t(`role.${member.role}`)),
  );
  useEffect(() => {
    if (committees.length === 0) void loadCommittees(true);
    else void loadAllDetails();
  }, [committees.length, loadAllDetails, loadCommittees]);
  const memberCommittees = (memberId: string) =>
    Object.values(details)
      .filter((detail) =>
        detail.memberships.some((membership) => membership.councilMemberId === memberId && !membership.endedOn),
      )
      .map((detail) => detail.committee)
      .sort((left, right) => left.name.localeCompare(right.name));
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
          <Link to={`/council-committees/${committee.slug}`} key={committee.id}>
            {committee.name}
          </Link>
        ))}
        {remaining > 0 ? (
          <Link to={`/council-members/${memberId}#committees`}>
            {t(remaining === 1 ? "members.moreCommittees.one" : "members.moreCommittees.other").replace(
              "{count}",
              String(remaining),
            )}
          </Link>
        ) : null}
      </span>
    );
  };
  const renderEditAction = (member: CouncilMember) => {
    const fullName = `${member.firstName} ${member.lastName}`;
    const label = t("members.editNamed").replace("{name}", fullName);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="council-member-edit-action">
            <Link to={`/council-members/${member.id}`} aria-label={label}>
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
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email") || null,
        phone: form.get("phone") || null,
        role: form.get("role"),
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
            <Button variant="default" onClick={() => setAddOpen(true)}>
              <AddIcon />
              {t("members.add")}
            </Button>
          ) : null}
        </CollectionToolbar>
        <Modal open={canCreate && addOpen} title={t("members.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-firstName`}>{t("members.firstName")}</Label>
                <Input id={`${fieldId}-firstName`} name="firstName" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-lastName`}>{t("members.lastName")}</Label>
                <Input id={`${fieldId}-lastName`} name="lastName" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-role`}>{t("members.role")}</Label>
                {/* Champ non contrôlé : `name` fait rendre à Radix un champ caché lu par FormData. */}
                <Select name="role" required defaultValue="councillor">
                  <SelectTrigger id={`${fieldId}-role`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="councillor">{t("role.councillor")}</SelectItem>
                    <SelectItem value="deputyMayor">{t("role.deputyMayor")}</SelectItem>
                    <SelectItem value="mayor">{t("role.mayor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-email`}>{t("members.email")}</Label>
                <Input id={`${fieldId}-email`} name="email" type="email" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-phone`}>{t("members.phone")}</Label>
                <Input id={`${fieldId}-phone`} name="phone" type="tel" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-termStartedOn`}>{t("members.termStart")}</Label>
                <Input id={`${fieldId}-termStartedOn`} name="termStartedOn" type="date" required />
              </div>
            </div>
            <Button variant="default" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>
        {visibleMembers.length === 0 ? (
          <EmptyState>{t(members.length === 0 ? "members.empty" : "common.noSearchResults")}</EmptyState>
        ) : layout === "cards" ? (
          <div className="card-grid">
            {visibleMembers.map((member) => (
              <article className="entity-card entity-card-member" key={member.id}>
                <div className="council-member-card-heading">
                  <div className="member-identity member-identity-card">
                    <span className="member-avatar member-avatar-large" aria-hidden="true">
                      {member.firstName.slice(0, 1)}
                      {member.lastName.slice(0, 1)}
                    </span>
                    <div>
                      <span className="council-member-name">
                        {member.firstName} {member.lastName}
                      </span>
                      <span>{t(`role.${member.role}`)}</span>
                    </div>
                  </div>
                  {renderEditAction(member)}
                </div>
                <div className="council-member-contact">
                  {member.email ? (
                    <a href={`mailto:${member.email}`}>{member.email}</a>
                  ) : (
                    <span>{t("members.noEmail")}</span>
                  )}
                  {member.phone ? (
                    <a href={phoneHref(member.phone)}>{formatPhoneNumber(member.phone)}</a>
                  ) : (
                    <span>{t("members.noPhone")}</span>
                  )}
                  <span>{t("members.termSince").replace("{date}", formatDate(member.termStartedOn))}</span>
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
              <div className="data-row council-member-row" key={member.id}>
                <div className="member-identity">
                  <span className="member-avatar" aria-hidden="true">
                    {member.firstName.slice(0, 1)}
                    {member.lastName.slice(0, 1)}
                  </span>
                  <div>
                    <span className="council-member-name">
                      {member.firstName} {member.lastName}
                    </span>
                    <span>{t(`role.${member.role}`)}</span>
                  </div>
                </div>
                <div className="council-member-contact council-member-list-contact">
                  {member.email ? (
                    <a href={`mailto:${member.email}`}>{member.email}</a>
                  ) : (
                    <span>{t("members.noEmail")}</span>
                  )}
                  {member.phone ? (
                    <a href={phoneHref(member.phone)}>{formatPhoneNumber(member.phone)}</a>
                  ) : (
                    <span>{t("members.noPhone")}</span>
                  )}
                  <span>{t("members.termSince").replace("{date}", formatDate(member.termStartedOn))}</span>
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
