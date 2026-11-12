import type { ApiRole } from "@hall/api-contract";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CreateButton } from "@/components/ui/create-button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HelpHint } from "../components/HelpHint";
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
  const [access, setAccess] = useState<"invitation" | "hand-delivered">("invitation");
  const handDelivered = access === "hand-delivered";
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const generationId = useRef(0);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<ApiErrorCode | null>(null);
  const { query, setQuery } = useCollectionView();
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
    if (!addOpen || !canCreate || !canGeneratePassphrase || !handDelivered) {
      setGenerating(false);
      return;
    }
    generate();
    return () => {
      generationId.current += 1;
    };
  }, [addOpen, canCreate, canGeneratePassphrase, handDelivered, generate]);
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
        ...(handDelivered ? { password, passwordChangeRequired } : {}),
        roles,
        contactId: contactId === "none" ? null : contactId,
      });
      if (created) navigate(`/users/${created.id}`);
      return created;
    });
  };
  const closeCreate = () => {
    if (submitting) return;
    setAddOpen(false);
    setPassword("");
    setPassphrase(null);
  };
  if (!loading && !listed)
    return (
      <div className="page">
        <PageHeader title={t("users.title")} hint={t("users.description")} />
        <div className="page-content">
          <RequestErrorBanner error={error} />
        </div>
      </div>
    );
  return (
    <div className="page">
      <PageHeader title={t("users.title")} hint={t("users.description")} />
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
                        setAccess("invitation");
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
        <Modal open={addOpen && canCreate} title={t("users.add")} onClose={closeCreate}>
          <form className="modal-form" onSubmit={submit} data-testid="user-create-form">
            <RequestErrorBanner error={error ?? generationError} />
            <fieldset disabled={submitting || generating} className="admin-fields">
              <FieldRow>
                <Field label={t("users.displayName")}>
                  <Input name="displayName" required maxLength={160} data-testid="user-display-name" />
                </Field>
                <Field label={t("users.email")}>
                  <Input name="email" type="email" required autoComplete="off" data-testid="user-email" />
                </Field>
              </FieldRow>
              <fieldset className="checkbox-group" data-testid="user-access">
                <legend>{t("users.access")}</legend>
                <label className="checkbox-field">
                  <input
                    type="radio"
                    name="access"
                    checked={!handDelivered}
                    onChange={() => setAccess("invitation")}
                    data-testid="user-access-invitation"
                  />
                  {t("users.accessInvitation")}
                  <HelpHint text={t("users.accessInvitationDescription")} />
                </label>
                <label className="checkbox-field">
                  <input
                    type="radio"
                    name="access"
                    checked={handDelivered}
                    onChange={() => setAccess("hand-delivered")}
                    data-testid="user-access-hand-delivered"
                  />
                  {t("users.accessHandDelivered")}
                  <HelpHint text={t("users.accessHandDeliveredDescription")} />
                </label>
              </fieldset>
              {handDelivered && (
                <Field
                  label={t("users.password")}
                  help={passphrase ? undefined : t("users.passwordHint")}
                  hint={passphrase ? t("users.generatedPasswordHint") : undefined}
                >
                  <Input
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
                    data-testid="user-password"
                  />
                </Field>
              )}
              <Field label={t("users.contact")}>
                <EntitySelect
                  type="contact"
                  testId="user-contact-select"
                  value={contactId === "none" ? "" : contactId}
                  onValueChange={(value) => setContactId(value || "none")}
                  options={contacts.map((contact) => ({
                    value: contact.id,
                    label: `${contact.firstName} ${contact.lastName}`,
                  }))}
                  clearLabel={t("users.noContact")}
                />
              </Field>
            </fieldset>
            {handDelivered && (
              <div className="admin-passphrase">
                {canGeneratePassphrase && (
                  <Button
                    type="button"
                    variant="secondary"
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
            )}
            {handDelivered && (
              <TemporaryPasswordSetting
                value={passwordChangeRequired}
                onChange={setPasswordChangeRequired}
                disabled={submitting}
              />
            )}
            <UserRoles value={roles} onChange={setRoles} disabled={submitting} />
            {requiresActiveMember(roles) && (
              <p className="admin-hint" data-testid="user-councillor-contact-hint">
                {t("authorization.activeMemberRequired")}
              </p>
            )}
            <div className="dialog-actions">
              <Button variant="plain" type="button" onClick={closeCreate} data-testid="user-create-cancel">
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting ||
                  generating ||
                  roles.length === 0 ||
                  (handDelivered && passphrase !== null && !handedOver)
                }
                data-testid="user-create-submit"
              >
                {t(submitting ? "common.saving" : "common.create")}
              </Button>
            </div>
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
                className="user-row"
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
                status={{
                  tone: user.status === "active" ? "success" : "danger",
                  label: t(`users.status.${user.status}`),
                }}
                wide={<span className="user-row-roles">{user.roles.map((role) => roleName(role)).join(" · ")}</span>}
              />
            ))}
          </ListRows>
        )}
      </div>
    </div>
  );
}
