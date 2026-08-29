import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddIcon } from "../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { StatusBadge } from "../features/status/DomainStatusBadge";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

export function CouncilMembersPage() {
  const { t, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { members, create: createMember, error, canCreate } = useCouncilMembersStore();
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();
  const visibleMembers = members.filter((member) =>
    matchesQuery(query, member.firstName, member.lastName, member.email, t(`role.${member.role}`)),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const created = await createMember({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email") || null,
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
              <div className="entity-card entity-card-member" key={member.id}>
                <span className="member-avatar member-avatar-large" aria-hidden="true">
                  {member.firstName.slice(0, 1)}
                  {member.lastName.slice(0, 1)}
                </span>
                <strong>
                  {member.firstName} {member.lastName}
                </strong>
                <p>{t(`role.${member.role}`)}</p>
                <p className="entity-card-detail">{member.email ?? t("members.noEmail")}</p>
                <span className="entity-card-footer">
                  <StatusBadge value={member.active ? "active" : "inactive"} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="data-list">
            {visibleMembers.map((member) => (
              <div className="data-row" key={member.id}>
                <div className="member-identity">
                  <span className="member-avatar" aria-hidden="true">
                    {member.firstName.slice(0, 1)}
                    {member.lastName.slice(0, 1)}
                  </span>
                  <div>
                    <strong>
                      {member.firstName} {member.lastName}
                    </strong>
                    <span>
                      {t(`role.${member.role}`)} · {member.email ?? t("members.noEmail")} ·{" "}
                      {t("members.sinceDate").replace("{date}", formatDate(member.termStartedOn))}
                    </span>
                  </div>
                </div>
                <StatusBadge value={member.active ? "active" : "inactive"} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
