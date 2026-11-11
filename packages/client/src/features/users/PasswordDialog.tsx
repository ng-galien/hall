import { type FormEvent, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
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
      <fieldset className="admin-fields" disabled={submitting}>
        {requireCurrent && (
          <Field label={t("users.currentPassword")}>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.currentTarget.value)}
              data-testid="password-current"
            />
          </Field>
        )}
        <Field label={t("users.newPassword")} help={t("users.passwordHint")}>
          <Input
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
            type={passphrase ? "text" : "password"}
            value={newPassword}
            onChange={(event) => typed(setNewPassword)(event.currentTarget.value)}
            data-testid="password-new"
          />
        </Field>
        {onGenerate && (
          <div className="admin-passphrase">
            <Button
              type="button"
              variant="secondary"
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
            {passphrase && (
              <GeneratedPassphrase passphrase={passphrase} handedOver={handedOver} onHandedOverChange={setHandedOver} />
            )}
          </div>
        )}
        <Field
          label={t("users.confirmPassword")}
          error={mismatch ? <span data-testid="password-mismatch">{t("users.passwordMismatch")}</span> : undefined}
        >
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => typed(setConfirmation)(event.currentTarget.value)}
            data-testid="password-confirmation"
          />
        </Field>
      </fieldset>
      {temporaryPassword !== undefined && (
        <TemporaryPasswordSetting
          value={passwordChangeRequired}
          onChange={setPasswordChangeRequired}
          disabled={submitting}
        />
      )}
      <div className="dialog-actions">
        {mandatory ? null : (
          <Button variant="secondary" type="button" disabled={submitting} onClick={onClose}>
            {t("common.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting || (passphrase !== null && !handedOver)}
          data-testid="password-submit"
        >
          {t(submitting ? "common.saving" : "users.confirmPasswordChange")}
        </Button>
      </div>
    </form>
  );
  if (mandatory)
    return (
      <main className="authentication-shell" data-testid="password-replacement-required">
        <section className="authentication-panel">
          <h1>{title}</h1>
          {form}
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={onLogout}
            data-testid="password-replacement-logout"
          >
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
