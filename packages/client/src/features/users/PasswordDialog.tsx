import { type FormEvent, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { GeneratedPassphrase } from "./GeneratedPassphrase";
import { TemporaryPasswordSetting } from "./TemporaryPasswordSetting";

export function PasswordDialog({
  title,
  requireCurrent = false,
  mandatory = false,
  temporaryPassword,
  onLogout,
  onGenerate,
  onClose,
  onSubmit,
}: {
  title: string;
  requireCurrent?: boolean;
  mandatory?: boolean;
  temporaryPassword?: boolean;
  onLogout?(): void;
  onGenerate?(): Promise<string>;
  onClose(): void;
  onSubmit(input: { currentPassword: string; newPassword: string; passwordChangeRequired?: boolean }): Promise<void>;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const id = useId();
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(temporaryPassword ?? false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const typed = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPassphrase(null);
    setHandedOver(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMismatch(newPassword !== confirmation);
    if (newPassword !== confirmation) return;
    await run(async () => {
      try {
        await onSubmit({
          currentPassword,
          newPassword,
          ...(temporaryPassword !== undefined ? { passwordChangeRequired } : {}),
        });
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
  const form = (
    <form className="modal-form" onSubmit={submit}>
      <RequestErrorBanner error={error} />
      <p>
        {t(
          mandatory
            ? "auth.passwordReplacementDescription"
            : requireCurrent
              ? "users.passwordChangeDescription"
              : "users.passwordResetDescription",
        )}
      </p>
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
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
            type={passphrase ? "text" : "password"}
            value={newPassword}
            onChange={(event) => typed(setNewPassword)(event.currentTarget.value)}
            aria-describedby={`${id}-hint`}
            data-testid="password-new"
          />
          <p className="text-sm text-muted-foreground" id={`${id}-hint`}>
            {t("users.passwordHint")}
          </p>
          {onGenerate && (
            <Button
              type="button"
              variant="outline"
              data-testid="passphrase-generate"
              onClick={() =>
                void onGenerate().then(
                  (generated) => {
                    setError(null);
                    setNewPassword(generated);
                    setConfirmation(generated);
                    setPassphrase(generated);
                    setHandedOver(false);
                  },
                  (failure) => setError(apiErrorCode(failure)),
                )
              }
            >
              {t("users.passphraseGenerate")}
            </Button>
          )}
          {passphrase && (
            <GeneratedPassphrase passphrase={passphrase} handedOver={handedOver} onHandedOverChange={setHandedOver} />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-confirmation`}>{t("users.confirmPassword")}</Label>
          <Input
            id={`${id}-confirmation`}
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => typed(setConfirmation)(event.currentTarget.value)}
            aria-invalid={mismatch}
            data-testid="password-confirmation"
          />
        </div>
      </fieldset>
      {temporaryPassword !== undefined && (
        <TemporaryPasswordSetting
          value={passwordChangeRequired}
          onChange={setPasswordChangeRequired}
          disabled={submitting}
        />
      )}
      {mismatch && (
        <p role="alert" className="form-error" data-testid="password-mismatch">
          {t("users.passwordMismatch")}
        </p>
      )}
      <Button type="submit" disabled={submitting || (passphrase !== null && !handedOver)} data-testid="password-submit">
        {t(submitting ? "common.saving" : "users.confirmPasswordChange")}
      </Button>
    </form>
  );
  if (mandatory)
    return (
      <main className="authentication-shell" data-testid="password-replacement-required">
        <section className="authentication-panel">
          <h1>{title}</h1>
          {form}
          <Button variant="outline" disabled={submitting} onClick={onLogout} data-testid="password-replacement-logout">
            {t("settings.logout")}
          </Button>
        </section>
      </main>
    );
  return (
    <Modal
      open
      title={title}
      onClose={() => {
        if (!submitting) onClose();
      }}
      testId="password-dialog"
    >
      {form}
    </Modal>
  );
}
