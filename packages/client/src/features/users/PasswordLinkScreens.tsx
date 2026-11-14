import type { ApiPasswordLink, SirenEntity } from "@hall/api-contract";
import { type FormEvent, useEffect, useState } from "react";
import { HelpHint } from "../../components/HelpHint";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/I18nProvider";
import { ApiError, type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { completePasswordLink, openPasswordLink, requestPasswordLink } from "../../services/authApi";

type StatusRepresentation = SirenEntity<Record<string, unknown>>;

/** The route of the link screen, below the application base; the link secret is the fragment of its address. */
export const PASSWORD_LINK_ROUTE = "/password-link";

const isUnusable = (failure: unknown) =>
  failure instanceof ApiError && apiErrorCode(failure) === "password_link_unusable";

// @implements-requirement HALL-FR-USR-080
export function PasswordRecoveryScreen({
  representation,
  initialEmail,
  onBack,
}: {
  representation: StatusRepresentation;
  initialEmail: string;
  onBack(email: string): void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordLink(representation, email);
      setSent(true);
    } catch (failure) {
      setError(apiErrorCode(failure));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="authentication-shell">
      <form className="authentication-panel" onSubmit={submit} data-testid="password-recovery">
        <p className="eyebrow">{t("navigation.council")}</p>
        <div className="authentication-title">
          <h1>{t("auth.recoveryTitle")}</h1>
          {sent ? null : <HelpHint text={t("auth.recoveryDescription")} />}
        </div>
        {sent ? (
          <p role="status" data-testid="password-recovery-sent">
            {t("auth.recoverySent")}
          </p>
        ) : (
          <>
            <RequestErrorBanner error={error} />
            <Field label={t("auth.email")}>
              <Input
                data-testid="password-recovery-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </Field>
            <Button data-testid="password-recovery-submit" type="submit" disabled={submitting}>
              {t(submitting ? "auth.submitting" : "auth.recoverySubmit")}
            </Button>
          </>
        )}
        <Button variant="plain" type="button" onClick={() => onBack(email)} data-testid="password-recovery-back">
          {t("auth.backToSignIn")}
        </Button>
      </form>
    </main>
  );
}

// @implements-requirement HALL-FR-USR-080
export function PasswordLinkScreen({
  representation,
  token,
  onRecorded,
  onRequestNew,
}: {
  representation: StatusRepresentation;
  token: string;
  onRecorded(email: string): void;
  onRequestNew(): void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState<ApiPasswordLink | null>(null);
  const [unusable, setUnusable] = useState(false);
  const [loadError, setLoadError] = useState<ApiErrorCode | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  useEffect(() => {
    let current = true;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setUnusable(true);
      return;
    }
    openPasswordLink(representation, token).then(
      (opened) => {
        if (current) setLink(opened);
      },
      (failure) => {
        if (!current) return;
        if (isUnusable(failure)) setUnusable(true);
        else setLoadError(apiErrorCode(failure));
      },
    );
    return () => {
      current = false;
    };
  }, [representation, token]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMismatch(newPassword !== confirmation);
    if (newPassword !== confirmation || !link) return;
    setSubmitting(true);
    try {
      await completePasswordLink(representation, { token, newPassword });
      onRecorded(link.email);
    } catch (failure) {
      if (isUnusable(failure)) setUnusable(true);
      else setError(apiErrorCode(failure));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="authentication-shell">
      <form className="authentication-panel" onSubmit={submit} data-testid="password-link">
        <p className="eyebrow">{t("navigation.council")}</p>
        <h1>
          {t(
            unusable
              ? "auth.passwordLinkExpiredTitle"
              : link?.purpose === "invitation"
                ? "auth.invitationTitle"
                : "auth.passwordLinkTitle",
          )}
        </h1>
        {unusable ? (
          <>
            <p role="alert" data-testid="password-link-unusable">
              {t("error.password_link_unusable")}
            </p>
            <Button type="button" onClick={onRequestNew} data-testid="password-link-request-new">
              {t("auth.requestNewLink")}
            </Button>
          </>
        ) : loadError ? (
          <RequestErrorBanner error={loadError} />
        ) : !link ? (
          <p>{t("common.loading")}</p>
        ) : (
          <>
            <p data-testid="password-link-account">{t("auth.passwordLinkAccount", { email: link.email })}</p>
            <RequestErrorBanner error={error} />
            <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
            <fieldset className="admin-fields" disabled={submitting}>
              <Field label={t("users.newPassword")} help={t("users.passwordHint")}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.currentTarget.value)}
                  data-testid="password-link-new"
                />
              </Field>
              <Field
                label={t("users.confirmPassword")}
                error={
                  mismatch ? <span data-testid="password-link-mismatch">{t("users.passwordMismatch")}</span> : undefined
                }
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.currentTarget.value)}
                  data-testid="password-link-confirmation"
                />
              </Field>
            </fieldset>
            <Button type="submit" disabled={submitting} data-testid="password-link-submit">
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
