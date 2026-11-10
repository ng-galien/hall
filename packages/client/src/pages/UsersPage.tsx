import type { ApiRole, ApiUser } from "@hall/api-contract";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useRoleOptions } from "../features/authorization/useRoleOptions";
import { GeneratedPassphrase } from "../features/users/GeneratedPassphrase";
import { UserRoles } from "../features/users/UserRoles";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { generatePassphrase } from "../services/usersApi";
import { useContactsStore } from "../stores/contactsStore";
import { useUsersStore } from "../stores/usersStore";

/** User accounts; a refused or failed reading of the collection leaves only its error on the page. */
export function UsersPage() {
  const { t } = useI18n();
  const { roleName, requiresActiveMember } = useRoleOptions();
  const navigate = useNavigate();
  const { submitting, run } = useSubmitting();
  const { users, listed, loading, load, create, error, canCreate, canGeneratePassphrase, clearError } = useUsersStore();
  const contacts = useContactsStore((state) => state.contacts);
  const [addOpen, setAddOpen] = useState(false);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [contactId, setContactId] = useState("none");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const generationId = useRef(0);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<ApiErrorCode | null>(null);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const fieldId = useId();
  useEffect(() => {
    void load();
  }, [load]);
  const generate = useCallback(() => {
    const id = ++generationId.current;
    setGenerating(true);
    setGenerationError(null);
    setPassword("");
    setPassphrase(null);
    setHandedOver(false);
    void generatePassphrase().then(
      (generated) => {
        if (id !== generationId.current) return;
        setPassword(generated);
        setPassphrase(generated);
        setGenerating(false);
      },
      (failure) => {
        if (id !== generationId.current) return;
        setGenerationError(apiErrorCode(failure));
        setGenerating(false);
      },
    );
  }, []);
  useEffect(() => {
    if (!addOpen || !canCreate || !canGeneratePassphrase) {
      setGenerating(false);
      return;
    }
    generate();
    return () => {
      generationId.current += 1;
    };
  }, [addOpen, canCreate, canGeneratePassphrase, generate]);
  const visible = users.filter((user) =>
    matchesQuery(query, user.displayName, user.email, ...user.roles.map((role) => roleName(role))),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const created = await create({
        displayName: form.get("displayName"),
        email: form.get("email"),
        password,
        roles,
        contactId: contactId === "none" ? null : contactId,
      });
      if (created) navigate(`/users/${created.id}`);
      return created;
    });
  };
  const open = (user: ApiUser) => (
    <Link
      className="collection-card-link"
      to={`/users/${user.id}`}
      aria-label={t("users.openNamed", { name: user.displayName })}
      data-testid={`user-open-${user.id}`}
    />
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
      <span>{user.roles.map((role) => roleName(role)).join(" · ")}</span>
    </div>
  );
  if (!loading && !listed)
    return (
      <div className="page">
        <PageHeader title={t("users.title")} description={t("users.description")} />
        <div className="page-content">
          <RequestErrorBanner error={error} />
        </div>
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
                setPassword("");
                setPassphrase(null);
                setHandedOver(false);
                setGenerationError(null);
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
            if (submitting) return;
            setAddOpen(false);
            setPassword("");
            setPassphrase(null);
          }}
        >
          <form className="modal-form" onSubmit={submit} data-testid="user-create-form">
            <RequestErrorBanner error={error ?? generationError} />
            <fieldset disabled={submitting || generating} className="form-grid items-start">
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
                  type={passphrase ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.currentTarget.value);
                    setPassphrase(null);
                    setHandedOver(false);
                  }}
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                  aria-describedby={`${fieldId}-password-help`}
                  data-testid="user-password"
                />
                <p id={`${fieldId}-password-help`} className="text-sm text-muted-foreground">
                  {t(passphrase ? "users.generatedPasswordHint" : "users.passwordHint")}
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
            <div className="grid gap-2">
              {canGeneratePassphrase && (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  data-testid="passphrase-generate"
                  disabled={generating || submitting}
                  onClick={generate}
                >
                  {t("users.passphraseGenerate")}
                </Button>
              )}
              {passphrase && (
                <GeneratedPassphrase
                  passphrase={passphrase}
                  handedOver={handedOver}
                  onHandedOverChange={setHandedOver}
                />
              )}
            </div>
            <UserRoles value={roles} onChange={setRoles} disabled={submitting} />
            {requiresActiveMember(roles) && (
              <p className="text-sm text-muted-foreground" data-testid="user-councillor-contact-hint">
                {t("authorization.activeMemberRequired")}
              </p>
            )}
            <Button
              type="submit"
              disabled={submitting || generating || roles.length === 0 || (passphrase !== null && !handedOver)}
              data-testid="user-create-submit"
            >
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>
        {loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState testId="users-empty">
            {t(users.length === 0 ? "users.empty" : "common.noSearchResults")}
          </EmptyState>
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
