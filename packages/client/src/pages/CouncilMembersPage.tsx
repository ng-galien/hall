import { Button, Field } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { type FormEvent, useState } from "react";
import {
  CollectionToolbar,
  EmptyState,
  Input,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  StatusBadge,
  useCollectionView,
} from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilMembersStore } from "../stores/councilMembersStore";

export function CouncilMembersPage() {
  const { t, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { members, create: createMember, error, canCreate } = useCouncilMembersStore();
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
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
            <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddOpen(true)}>
              {t("members.add")}
            </Button>
          ) : null}
        </CollectionToolbar>
        <Modal open={canCreate && addOpen} title={t("members.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <div className="form-grid">
              <Field label={t("members.firstName")} required>
                <Input name="firstName" required />
              </Field>
              <Field label={t("members.lastName")} required>
                <Input name="lastName" required />
              </Field>
              <Field label={t("members.role")} required>
                <select name="role" required>
                  <option value="councillor">{t("role.councillor")}</option>
                  <option value="deputyMayor">{t("role.deputyMayor")}</option>
                  <option value="mayor">{t("role.mayor")}</option>
                </select>
              </Field>
              <Field label={t("members.email")}>
                <Input name="email" type="email" />
              </Field>
              <Field label={t("members.termStart")} required>
                <Input name="termStartedOn" type="date" required />
              </Field>
            </div>
            <Button appearance="primary" type="submit" disabled={submitting}>
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
