import { type FormEvent, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";

export function PasswordDialog({
  title,
  requireCurrent = false,
  onClose,
  onSubmit,
}: {
  title: string;
  requireCurrent?: boolean;
  onClose(): void;
  onSubmit(input: { currentPassword: string; newPassword: string }): Promise<void>;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const id = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMismatch(newPassword !== confirmation);
    if (newPassword !== confirmation) return;
    await run(async () => {
      try {
        await onSubmit({ currentPassword, newPassword });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
        onClose();
        return true;
      } catch (failure) {
        setError(apiErrorCode(failure));
        return false;
      }
    });
  };
  return (
    <Modal
      open
      title={title}
      onClose={() => {
        if (!submitting) onClose();
      }}
      testId="password-dialog"
    >
      <form className="modal-form" onSubmit={submit}>
        <RequestErrorBanner error={error} />
        <p>{t(requireCurrent ? "users.passwordChangeDescription" : "users.passwordResetDescription")}</p>
        <fieldset className="grid gap-3" disabled={submitting}>
          {requireCurrent && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-current`}>{t("users.currentPassword")}</Label>
              <Input
                id={`${id}-current`}
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                data-testid="password-current"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-new`}>{t("users.newPassword")}</Label>
            <Input
              id={`${id}-new`}
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
              aria-describedby={`${id}-hint`}
              data-testid="password-new"
            />
            <p className="text-sm text-muted-foreground" id={`${id}-hint`}>
              {t("users.passwordHint")}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-confirmation`}>{t("users.confirmPassword")}</Label>
            <Input
              id={`${id}-confirmation`}
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              aria-invalid={mismatch}
              data-testid="password-confirmation"
            />
          </div>
        </fieldset>
        {mismatch && (
          <p role="alert" className="form-error" data-testid="password-mismatch">
            {t("users.passwordMismatch")}
          </p>
        )}
        <Button type="submit" disabled={submitting} data-testid="password-submit">
          {t(submitting ? "common.saving" : "users.confirmPasswordChange")}
        </Button>
      </form>
    </Modal>
  );
}
