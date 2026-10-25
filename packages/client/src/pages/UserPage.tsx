import type { ApiRole } from "@hall/api-contract";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteIcon, EditIcon } from "../components/icons";
import { EntitySelect } from "../components/search/EntitySelect";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../components/Ui";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { UserRoles } from "../features/users/UserRoles";
import { useUserIdentity } from "../features/users/useUserIdentity";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { resetUserPassword } from "../services/usersApi";
import { useContactsStore } from "../stores/contactsStore";
import { useUsersStore } from "../stores/usersStore";

export function UserPage() {
  const { userId = "" } = useParams();
  const { t } = useI18n();
  const {
    users,
    loading,
    error,
    loadDetail,
    canUpdate,
    canAssignRoles,
    canResetPassword,
    canDisable,
    assignRoles,
    disable,
    clearError,
  } = useUsersStore();
  const { submitting, run } = useSubmitting();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
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
      <PageHeader title={user?.displayName ?? t("users.title")} description={t("users.detailDescription")} />
      <div className="page-content admin-detail-page">
        {!rolesOpen && !disableOpen && <RequestErrorBanner error={error} />}
        {loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : !user ? (
          <EmptyState>{t("users.notFound")}</EmptyState>
        ) : (
          <div className="admin-detail-surface" data-testid="user-detail">
            <section className="admin-record" aria-labelledby={`${fieldId}-identity`}>
              <div className="admin-section-heading">
                <div>
                  <h2 id={`${fieldId}-identity`}>{t("users.identity")}</h2>
                  <p>{t("users.identityDescription")}</p>
                </div>
                {saveState !== "idle" && (
                  <span
                    className={`admin-save-state admin-save-${saveState}`}
                    role="status"
                    data-testid="user-save-state"
                  >
                    <span aria-hidden="true" />
                    {saveLabels[saveState]}
                  </span>
                )}
              </div>
              {invalid && (
                <p className="form-error" role="alert" data-testid="user-identity-error">
                  {t("users.identityRequired")}
                </p>
              )}
              {error === "conflict" && <p className="text-sm text-muted-foreground">{t("users.conflictHint")}</p>}
              <div className="admin-edit-grid admin-member-edit-grid">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-name`}>{t("users.displayName")}</Label>
                  <Input
                    id={`${fieldId}-name`}
                    value={draft.displayName}
                    readOnly={!canUpdate[userId]}
                    required
                    maxLength={160}
                    aria-invalid={invalid}
                    onChange={(event) => change("displayName", event.currentTarget.value)}
                    data-testid="user-display-name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-email`}>{t("users.email")}</Label>
                  <Input
                    id={`${fieldId}-email`}
                    type="email"
                    value={draft.email}
                    readOnly={!canUpdate[userId]}
                    required
                    aria-invalid={invalid}
                    onChange={(event) => change("email", event.currentTarget.value)}
                    data-testid="user-email"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-status`}>{t("users.status")}</Label>
                  <Input
                    id={`${fieldId}-status`}
                    value={t(`users.status.${user.status}`)}
                    readOnly
                    data-testid="user-status"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-contact`}>{t("users.contact")}</Label>
                  {canUpdate[userId] && (
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
                  )}
                  {contact ? (
                    <Button asChild variant="link" className="justify-start px-0">
                      <Link to={`/contacts/${contact.id}`} data-testid="user-contact-link">
                        {contact.firstName} {contact.lastName}
                      </Link>
                    </Button>
                  ) : !canUpdate[userId] ? (
                    <span>{t(draft.contactId ? "users.contactUnavailable" : "users.noContact")}</span>
                  ) : null}
                </div>
              </div>
              {saveState === "error" && !invalid && (
                <Button variant="outline" onClick={() => void flush()} data-testid="user-save-retry">
                  {t("common.retry")}
                </Button>
              )}
            </section>
            <section className="admin-record" aria-labelledby={`${fieldId}-roles`}>
              <div className="admin-section-heading">
                <div>
                  <h2 id={`${fieldId}-roles`}>{t("users.roles")}</h2>
                  <p>{t("users.rolesDescription")}</p>
                </div>
                {canAssignRoles[userId] && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!(await flush())) return;
                      clearError();
                      setRoles([...user.roles]);
                      setRolesOpen(true);
                    }}
                    data-testid="user-edit-roles"
                  >
                    <EditIcon />
                    {t("users.editRoles")}
                  </Button>
                )}
              </div>
              <p data-testid="user-roles">{user.roles.map((role) => t(`users.role.${role}`)).join(" · ")}</p>
            </section>
            {canResetPassword[userId] && (
              <section className="admin-record" aria-labelledby={`${fieldId}-password`}>
                <div className="admin-section-heading">
                  <div>
                    <h2 id={`${fieldId}-password`}>{t("users.passwordSection")}</h2>
                    <p>{t("users.passwordResetDescription")}</p>
                  </div>
                  <Button
                    variant="outline"
                    data-testid="user-reset-password"
                    onClick={async () => {
                      if (!(await flush())) return;
                      setPasswordReset(false);
                      setPasswordOpen(true);
                    }}
                  >
                    {t("users.resetPassword")}
                  </Button>
                </div>
                {passwordReset && (
                  <p role="status" data-testid="password-reset-success">
                    {t("users.passwordResetSuccess")}
                  </p>
                )}
              </section>
            )}
            {canDisable[userId] && (
              <div className="admin-danger-zone">
                <div>
                  <strong>{t("users.disable")}</strong>
                  <p>{t("users.disableDescription")}</p>
                </div>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!(await flush())) return;
                    clearError();
                    setDisableOpen(true);
                  }}
                  data-testid="user-disable"
                >
                  <DeleteIcon />
                  {t("users.disable")}
                </Button>
              </div>
            )}
          </div>
        )}
        {passwordOpen && (
          <PasswordDialog
            title={t("users.resetPassword")}
            onClose={() => setPasswordOpen(false)}
            onSubmit={async ({ newPassword }) => {
              if (!(await flush())) throw new Error("Pending identity update failed");
              await resetUserPassword(userId, newPassword);
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
            <Button type="submit" disabled={submitting || roles.length === 0} data-testid="user-roles-submit">
              {t(submitting ? "common.saving" : "users.applyRoles")}
            </Button>
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
            <Button
              variant="destructive"
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
        </Modal>
      </div>
    </div>
  );
}
