import type { AccountMailOutcome, ApiRole } from "@hall/api-contract";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EntitySelect } from "../components/search/EntitySelect";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../components/Ui";
import { ListRow, ListRowAvatar, ListRows } from "../components/ui/list-row";
import { SectionHeader } from "../components/ui/section-header";
import { useRoleOptions } from "../features/authorization/useRoleOptions";
import { GeneratedPassphrase } from "../features/users/GeneratedPassphrase";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { TemporaryPasswordSetting } from "../features/users/TemporaryPasswordSetting";
import { UserRoles } from "../features/users/UserRoles";
import { useUserIdentity } from "../features/users/useUserIdentity";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { generatePassphrase, resetUserPassword } from "../services/usersApi";
import { useContactsStore } from "../stores/contactsStore";
import { useUsersStore } from "../stores/usersStore";

const accountMailTones = { sent: "success", failed: "danger", unknown: "neutral" } as const satisfies Record<
  AccountMailOutcome,
  string
>;

// @implements-requirement HALL-FR-USR-080 (an account manager sends a reset link from the user page)
// @implements-requirement HALL-FR-USR-090 (one line for the latest account email, with « Renvoyer »)
export function UserPage() {
  const { userId = "" } = useParams();
  const { t, formatDateTime } = useI18n();
  const { roleName, requiresActiveMember } = useRoleOptions();
  const {
    users,
    loading,
    error,
    loadDetail,
    canUpdate,
    canAssignRoles,
    canResetPassword,
    canSendPasswordLink,
    canDisable,
    canRevokeAccess,
    canReactivate,
    update,
    assignRoles,
    disable,
    revokeAccess,
    reactivate,
    sendPasswordLink,
    clearError,
  } = useUsersStore();
  const { submitting, run } = useSubmitting();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reactivatedPassphrase, setReactivatedPassphrase] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const fieldId = useId();
  const user = users.find((entry) => entry.id === userId);
  const { draft, change, flush, saveState, invalid } = useUserIdentity(user, Boolean(canUpdate[userId]));
  const saveLabels = {
    idle: "",
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };
  const contacts = useContactsStore((state) => state.contacts);
  const contact = contacts.find((entry) => entry.id === draft.contactId);
  useEffect(() => {
    void loadDetail(userId);
  }, [loadDetail, userId]);
  const saveRoles = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      if (!(await flush())) return false;
      const saved = await assignRoles(userId, roles);
      if (saved) setRolesOpen(false);
      return saved;
    });
  };
  return (
    <div className="page">
      <PageHeader
        title={user?.displayName ?? t("users.title")}
        hint={t("users.detailDescription")}
        describesItem
      />
      <div className="page-content admin-detail-page">
        {!rolesOpen && !disableOpen && !revokeOpen && <RequestErrorBanner error={error} />}
        {loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : !user ? (
          <EmptyState>{t("users.notFound")}</EmptyState>
        ) : (
          <div className="admin-detail-surface" data-testid="user-detail">
            <section className="admin-record" aria-labelledby={`${fieldId}-identity`}>
              <SectionHeader
                titleId={`${fieldId}-identity`}
                title={t("users.identity")}
                description={t("users.identityDescription")}
                commands={
                  <>
                    {saveState !== "idle" && (
                      <span className="record-state" data-save={saveState} role="status" data-testid="user-save-state">
                        {saveLabels[saveState]}
                      </span>
                    )}
                    <span
                      className="record-state"
                      data-tone={user.status === "active" ? "success" : "neutral"}
                      data-testid="user-status"
                    >
                      {t(`users.status.${user.status}`)}
                    </span>
                  </>
                }
              />
              {invalid && (
                <p className="form-error" role="alert" data-testid="user-identity-error">
                  {t("users.identityRequired")}
                </p>
              )}
              {error === "conflict" && <p className="admin-hint">{t("users.conflictHint")}</p>}
              <div className="admin-fields">
                <FieldRow>
                  <Field label={t("users.displayName")}>
                    <Input
                      value={draft.displayName}
                      readOnly={!canUpdate[userId]}
                      required
                      maxLength={160}
                      aria-invalid={invalid}
                      onChange={(event) => change("displayName", event.currentTarget.value)}
                      data-testid="user-display-name"
                    />
                  </Field>
                  <Field label={t("users.email")}>
                    <Input
                      type="email"
                      value={draft.email}
                      readOnly={!canUpdate[userId]}
                      required
                      aria-invalid={invalid}
                      onChange={(event) => change("email", event.currentTarget.value)}
                      data-testid="user-email"
                    />
                  </Field>
                </FieldRow>
                {canUpdate[userId] && (
                  <Field label={t("users.contact")}>
                    <EntitySelect
                      type="contact"
                      testId="user-contact-select"
                      value={draft.contactId ?? ""}
                      onValueChange={(value) => change("contactId", value || null)}
                      options={contacts.map((contact) => ({
                        value: contact.id,
                        label: `${contact.firstName} ${contact.lastName}`,
                      }))}
                      placeholder={t("users.noContact")}
                      clearLabel={t("users.noContact")}
                    />
                  </Field>
                )}
              </div>
              {contact ? (
                <ListRows>
                  <ListRow
                    to={`/contacts/${contact.id}`}
                    openTestId="user-contact-link"
                    head={
                      <ListRowAvatar initials={`${contact.firstName.slice(0, 1)}${contact.lastName.slice(0, 1)}`} />
                    }
                    overline={t("users.contact")}
                    title={`${contact.firstName} ${contact.lastName}`}
                    detail={contact.email ?? undefined}
                  />
                </ListRows>
              ) : !canUpdate[userId] ? (
                <p className="admin-hint">{t(draft.contactId ? "users.contactUnavailable" : "users.noContact")}</p>
              ) : null}
              {saveState === "error" && !invalid && (
                <Button variant="secondary" onClick={() => void flush()} data-testid="user-save-retry">
                  {t("common.retry")}
                </Button>
              )}
              <TemporaryPasswordSetting
                value={user.passwordChangeRequired}
                disabled={!canUpdate[userId] || submitting}
                onChange={(passwordChangeRequired) =>
                  void run(async () => {
                    if (!(await flush())) return false;
                    return Boolean(await update(userId, { ...draft, passwordChangeRequired }));
                  })
                }
              />
            </section>
            <section className="admin-record" aria-labelledby={`${fieldId}-roles`}>
              <SectionHeader
                titleId={`${fieldId}-roles`}
                title={t("users.roles")}
                description={t("users.rolesDescription")}
                commands={
                  <>
                    {canAssignRoles[userId] && (
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          if (!(await flush())) return;
                          clearError();
                          setRoles([...user.roles]);
                          setRolesOpen(true);
                        }}
                        data-testid="user-edit-roles"
                      >
                        {t("users.editRoles")}
                      </Button>
                    )}
                  </>
                }
              />
              <p data-testid="user-roles">{user.roles.map((role) => roleName(role)).join(" · ")}</p>
            </section>
            {(canResetPassword[userId] || canSendPasswordLink[userId] || user.accountMail) && (
              <section className="admin-record" aria-labelledby={`${fieldId}-password`}>
                <SectionHeader
                  titleId={`${fieldId}-password`}
                  title={t("users.passwordSection")}
                  description={t("users.passwordAccessDescription")}
                  commands={
                    <>
                      {canSendPasswordLink[userId] && (
                        <Button
                          variant="secondary"
                          disabled={submitting}
                          data-testid="user-send-password-link"
                          onClick={() =>
                            void run(async () => {
                              if (!(await flush())) return false;
                              clearError();
                              return sendPasswordLink(userId, "recovery");
                            })
                          }
                        >
                          {t("users.sendPasswordLink")}
                        </Button>
                      )}
                      {canResetPassword[userId] && (
                        <Button
                          variant="secondary"
                          data-testid="user-reset-password"
                          onClick={async () => {
                            if (!(await flush())) return;
                            setPasswordReset(false);
                            setPasswordOpen(true);
                          }}
                        >
                          {t("users.resetPassword")}
                        </Button>
                      )}
                    </>
                  }
                />
                {user.accountMail ? (
                  <div className="admin-heading-status" data-testid="user-account-mail">
                    <span>
                      {t(`users.accountMail.${user.accountMail.kind}`)} · {formatDateTime(user.accountMail.sentAt)}
                    </span>
                    <span
                      className="record-state"
                      data-tone={accountMailTones[user.accountMail.outcome]}
                      data-testid="user-account-mail-outcome"
                      data-outcome={user.accountMail.outcome}
                    >
                      {t(`users.accountMailOutcome.${user.accountMail.outcome}`)}
                    </span>
                    {canSendPasswordLink[userId] && user.accountMail.kind !== "password-changed" && (
                      <Button
                        variant="secondary"
                        disabled={submitting}
                        data-testid="user-account-mail-resend"
                        onClick={() => {
                          const purpose = user.accountMail?.kind;
                          if (purpose !== "invitation" && purpose !== "recovery") return;
                          void run(async () => {
                            clearError();
                            return sendPasswordLink(userId, purpose);
                          });
                        }}
                      >
                        {t("users.accountMailResend")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="admin-hint" data-testid="user-account-mail-none">
                    {t("users.accountMailNone")}
                  </p>
                )}
                {passwordReset && (
                  <p role="status" data-testid="password-reset-success">
                    {t("users.passwordResetSuccess")}
                  </p>
                )}
              </section>
            )}
            {canReactivate[userId] && (
              <section className="admin-record" aria-labelledby={`${fieldId}-reactivate`}>
                <SectionHeader
                  titleId={`${fieldId}-reactivate`}
                  title={t("users.reactivate")}
                  description={t("users.reactivateDescription")}
                  commands={
                    <>
                      <Button
                        variant="secondary"
                        disabled={submitting}
                        data-testid="user-reactivate"
                        onClick={() =>
                          void run(async () => {
                            clearError();
                            const generated = await reactivate(userId);
                            if (generated) {
                              setHandedOver(false);
                              setReactivatedPassphrase(generated);
                            }
                            return Boolean(generated);
                          })
                        }
                      >
                        {t("users.reactivate")}
                      </Button>
                    </>
                  }
                />
              </section>
            )}
            {canRevokeAccess[userId] && (
              <section className="admin-danger-zone">
                <SectionHeader
                  title={t("users.revokeAccess")}
                  description={t("users.revokeAccessDescription")}
                  commands={
                    <>
                      <Button
                        variant="danger"
                        onClick={async () => {
                          if (!(await flush())) return;
                          clearError();
                          setRevokeOpen(true);
                        }}
                        data-testid="user-revoke-access"
                      >
                        {t("users.revokeAccess")}
                      </Button>
                    </>
                  }
                />
              </section>
            )}
            {canDisable[userId] && (
              <section className="admin-danger-zone">
                <SectionHeader
                  title={t("users.disable")}
                  description={t("users.disableDescription")}
                  commands={
                    <>
                      <Button
                        variant="danger"
                        onClick={async () => {
                          if (!(await flush())) return;
                          clearError();
                          setDisableOpen(true);
                        }}
                        data-testid="user-disable"
                      >
                        {t("users.disable")}
                      </Button>
                    </>
                  }
                />
              </section>
            )}
          </div>
        )}
        {passwordOpen && (
          <PasswordDialog
            title={t("users.resetPassword")}
            onGenerate={generatePassphrase}
            temporaryPassword={user?.passwordChangeRequired ?? false}
            onClose={() => setPasswordOpen(false)}
            onSubmit={async ({ newPassword, passwordChangeRequired }) => {
              if (!(await flush())) throw new Error("Pending identity update failed");
              await resetUserPassword(userId, newPassword, passwordChangeRequired);
              await loadDetail(userId);
              setPasswordReset(true);
            }}
          />
        )}
        <Modal
          open={rolesOpen}
          title={t("users.editRoles")}
          onClose={() => {
            if (!submitting) setRolesOpen(false);
          }}
        >
          <form className="modal-form" onSubmit={saveRoles}>
            <RequestErrorBanner error={error} />
            <UserRoles value={roles} onChange={setRoles} disabled={submitting} />
            {requiresActiveMember(roles) && (
              <p className="admin-hint" data-testid="user-councillor-contact-hint">
                {t("authorization.activeMemberRequired")}
              </p>
            )}
            <div className="dialog-actions">
              <Button variant="secondary" type="button" disabled={submitting} onClick={() => setRolesOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting || roles.length === 0} data-testid="user-roles-submit">
                {t(submitting ? "common.saving" : "users.applyRoles")}
              </Button>
            </div>
          </form>
        </Modal>
        <Modal
          open={disableOpen}
          title={t("users.disable")}
          onClose={() => {
            if (!submitting) setDisableOpen(false);
          }}
        >
          <div className="modal-form">
            <RequestErrorBanner error={error} />
            <p>{t("users.disableConfirm", { name: user?.displayName ?? "" })}</p>
            <div className="dialog-actions">
              <Button variant="secondary" disabled={submitting} onClick={() => setDisableOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={submitting}
                data-testid="user-disable-confirm"
                onClick={() =>
                  void run(async () => {
                    if (!(await flush())) return false;
                    const saved = await disable(userId);
                    if (saved) setDisableOpen(false);
                    return saved;
                  })
                }
              >
                {t(submitting ? "common.saving" : "users.disable")}
              </Button>
            </div>
          </div>
        </Modal>
        <Modal
          open={revokeOpen}
          title={t("users.revokeAccess")}
          onClose={() => {
            if (!submitting) setRevokeOpen(false);
          }}
        >
          <div className="modal-form">
            <RequestErrorBanner error={error} />
            <p>{t("users.revokeAccessConfirm", { name: user?.displayName ?? "" })}</p>
            <div className="dialog-actions">
              <Button variant="secondary" disabled={submitting} onClick={() => setRevokeOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={submitting}
                data-testid="user-revoke-access-confirm"
                onClick={() =>
                  void run(async () => {
                    if (!(await flush())) return false;
                    const saved = await revokeAccess(userId);
                    if (saved) setRevokeOpen(false);
                    return saved;
                  })
                }
              >
                {t(submitting ? "common.saving" : "users.revokeAccess")}
              </Button>
            </div>
          </div>
        </Modal>
        <Modal
          open={reactivatedPassphrase !== null}
          title={t("users.reactivated")}
          onClose={() => {
            if (handedOver) setReactivatedPassphrase(null);
          }}
        >
          <div className="modal-form" data-testid="user-reactivated">
            {reactivatedPassphrase && (
              <GeneratedPassphrase
                passphrase={reactivatedPassphrase}
                handedOver={handedOver}
                onHandedOverChange={setHandedOver}
              />
            )}
            <div className="dialog-actions">
              <Button
                disabled={!handedOver}
                data-testid="user-reactivated-close"
                onClick={() => setReactivatedPassphrase(null)}
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
