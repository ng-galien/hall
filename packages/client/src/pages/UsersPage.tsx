import type { ApiRole, ApiUser } from "@hall/api-contract";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { UserRoles } from "../features/users/UserRoles";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";
import { useUsersStore } from "../stores/usersStore";

export function UsersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { submitting, run } = useSubmitting();
  const { users, loading, load, create, error, canCreate, clearError } = useUsersStore();
  const contacts = useContactsStore((state) => state.contacts);
  const [addOpen, setAddOpen] = useState(false);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [contactId, setContactId] = useState("none");
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();
  useEffect(() => {
    void load();
  }, [load]);
  const visible = users.filter((user) =>
    matchesQuery(query, user.displayName, user.email, ...user.roles.map((role) => t(`users.role.${role}`))),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const created = await create({
        displayName: form.get("displayName"),
        email: form.get("email"),
        password: form.get("password"),
        roles,
        contactId: contactId === "none" ? null : contactId,
      });
      if (created) navigate(`/users/${created.id}`);
      return created;
    });
  };
  const open = (user: ApiUser) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon">
          <Link
            to={`/users/${user.id}`}
            aria-label={t("users.openNamed", { name: user.displayName })}
            data-testid={`user-open-${user.id}`}
          >
            <EditIcon />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("users.openNamed", { name: user.displayName })}</TooltipContent>
    </Tooltip>
  );
  const identity = (user: ApiUser, card = false) => (
    <div className={`member-identity ${card ? "member-identity-card" : ""}`}>
      <span className={`member-avatar ${card ? "member-avatar-large" : ""}`} aria-hidden="true">
        {user.displayName
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")}
      </span>
      <div>
        <span className="council-member-name">{user.displayName}</span>
        <span>{t(`users.status.${user.status}`)}</span>
      </div>
    </div>
  );
  const details = (user: ApiUser) => (
    <div className="council-member-contact">
      <a href={`mailto:${user.email}`}>{user.email}</a>
      <span>{user.roles.map((role) => t(`users.role.${role}`)).join(" · ")}</span>
    </div>
  );
  return (
    <div className="page">
      <PageHeader title={t("users.title")} description={t("users.description")} />
      <div className="page-content">
        {!addOpen && <RequestErrorBanner error={error} />}
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          {canCreate && (
            <Button
              onClick={() => {
                clearError();
                setRoles([]);
                setContactId("none");
                setAddOpen(true);
              }}
              data-testid="users-add"
            >
              <AddIcon />
              {t("users.add")}
            </Button>
          )}
        </CollectionToolbar>
        <Modal
          open={addOpen && canCreate}
          title={t("users.add")}
          onClose={() => {
            if (!submitting) setAddOpen(false);
          }}
        >
          <form className="modal-form" onSubmit={submit} data-testid="user-create-form">
            <RequestErrorBanner error={error} />
            <fieldset disabled={submitting} className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-name`}>{t("users.displayName")}</Label>
                <Input
                  id={`${fieldId}-name`}
                  name="displayName"
                  required
                  maxLength={160}
                  data-testid="user-display-name"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-email`}>{t("users.email")}</Label>
                <Input
                  id={`${fieldId}-email`}
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  data-testid="user-email"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-password`}>{t("users.password")}</Label>
                <Input
                  id={`${fieldId}-password`}
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                  aria-describedby={`${fieldId}-password-help`}
                  data-testid="user-password"
                />
                <p id={`${fieldId}-password-help`} className="text-sm text-muted-foreground">
                  {t("users.passwordHint")}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-contact`}>{t("users.contact")}</Label>
                <EntitySelect
                  type="contact"
                  testId="user-contact-select"
                  value={contactId === "none" ? "" : contactId}
                  onValueChange={(value) => setContactId(value || "none")}
                  options={contacts.map((contact) => ({
                    value: contact.id,
                    label: `${contact.firstName} ${contact.lastName}`,
                  }))}
                  placeholder={t("users.noContact")}
                  clearLabel={t("users.noContact")}
                />
              </div>
            </fieldset>
            <UserRoles value={roles} onChange={setRoles} disabled={submitting} />
            {roles.includes("councillor") && (
              <p className="text-sm text-muted-foreground" data-testid="user-councillor-contact-hint">
                {t("users.councillorContactHint")}
              </p>
            )}
            <Button type="submit" disabled={submitting || roles.length === 0} data-testid="user-create-submit">
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>
        {loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>{t(users.length === 0 ? "users.empty" : "common.noSearchResults")}</EmptyState>
        ) : layout === "cards" ? (
          <div className="card-grid" data-testid="users-collection">
            {visible.map((user) => (
              <article className="entity-card entity-card-member" key={user.id}>
                <div className="council-member-card-heading">
                  {identity(user, true)}
                  {open(user)}
                </div>
                {details(user)}
              </article>
            ))}
          </div>
        ) : (
          <div className="data-list" data-testid="users-collection">
            {visible.map((user) => (
              <div className="data-row council-member-row" key={user.id}>
                {identity(user)}
                {details(user)}
                <span className="council-member-list-status">{open(user)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
