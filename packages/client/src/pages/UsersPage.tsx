import type { ApiRole } from "@hall/api-contract";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CreateButton } from "@/components/ui/create-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MembersIcon } from "../components/icons";
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
import { useRoleOptions } from "../features/authorization/useRoleOptions";
import { GeneratedPassphrase } from "../features/users/GeneratedPassphrase";
import { TemporaryPasswordSetting } from "../features/users/TemporaryPasswordSetting";
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
  const { query, setQuery } = useCollectionView();
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
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const created = await create({
        displayName: form.get("displayName"),
        email: form.get("email"),
        password,
        passwordChangeRequired,
        roles,
        contactId: contactId === "none" ? null : contactId,
      });
      if (created) navigate(`/users/${created.id}`);
      return created;
    });
  };
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
        <CollectionToolbar query={query} onQueryChange={setQuery}>
          <CreateButton
            testId="users-add"
            options={
              canCreate
                ? [
                    {
                      id: "user",
                      label: t("users.add"),
                      Icon: MembersIcon,
                      nature: "council",
                      onSelect: () => {
                        clearError();
                        setRoles([]);
                        setContactId("none");
                        setPassword("");
                        setPasswordChangeRequired(false);
                        setPassphrase(null);
                        setHandedOver(false);
                        setGenerationError(null);
                        setAddOpen(true);
                      },
                    },
                  ]
                : []
            }
          />
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
                  variant="secondary"
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
            <TemporaryPasswordSetting
              value={passwordChangeRequired}
              onChange={setPasswordChangeRequired}
              disabled={submitting}
            />
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
        ) : (
          <ListRows data-testid="users-collection">
            {visible.map((user) => (
              <ListRow
                key={user.id}
                to={`/users/${user.id}`}
                openTestId={`user-open-${user.id}`}
                openLabel={t("users.openNamed", { name: user.displayName })}
                head={
                  <ListRowAvatar
                    initials={user.displayName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")}
                  />
                }
                title={user.displayName}
                detail={user.email}
                status={{ tone: "neutral", label: t(`users.status.${user.status}`) }}
                wide={<span>{user.roles.map((role) => roleName(role)).join(" · ")}</span>}
              />
            ))}
          </ListRows>
        )}
      </div>
    </div>
  );
}
