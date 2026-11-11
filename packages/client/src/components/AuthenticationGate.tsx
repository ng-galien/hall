import type { ApiPrincipal, SirenEntity } from "@hall/api-contract";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { useI18n } from "../i18n/I18nProvider";
import { ApiError, type ApiErrorCode, AUTHENTICATION_REQUIRED_EVENT, apiErrorCode } from "../services/apiClient";
import {
  type AuthenticationStatus,
  authenticate,
  changePassword,
  getAuthenticationStatus,
  getSession,
  logout,
} from "../services/authApi";
import { errorTranslationKeys } from "./Ui";

export function AuthenticationGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<AuthenticationStatus | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity<Record<string, unknown>> | null>(null);
  const [principal, setPrincipal] = useState<ApiPrincipal | null>(null);
  const [loadError, setLoadError] = useState<ApiErrorCode | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      setLoadError(null);
      try {
        const result = await getAuthenticationStatus();
        const session = await getSession().catch((sessionError: unknown) => {
          if (!(sessionError instanceof ApiError) || sessionError.status !== 401) throw sessionError;
          return null;
        });
        setStatus(result.data);
        setRepresentation(result.representation);
        setPrincipal(session);
      } catch (error) {
        setLoadError(apiErrorCode(error));
      } finally {
        loading = false;
      }
    };
    const authenticationRequired = () => void load();
    window.addEventListener(AUTHENTICATION_REQUIRED_EVENT, authenticationRequired);
    void load();
    return () => window.removeEventListener(AUTHENTICATION_REQUIRED_EVENT, authenticationRequired);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!representation) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await authenticate(representation, {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        ...(status?.bootstrapRequired ? { displayName: String(form.get("displayName") ?? "") } : {}),
        ...(status?.bootstrapRequired && status.bootstrapTokenRequired
          ? { setupToken: String(form.get("setupToken") ?? "") }
          : {}),
      });
      setPrincipal(await getSession());
    } catch (submitError) {
      setError(apiErrorCode(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  if (principal?.passwordChangeRequired)
    return (
      <PasswordDialog
        mandatory
        title={t("auth.passwordReplacementTitle")}
        onClose={() => setPrincipal(null)}
        onLogout={() => void logout()}
        onSubmit={({ newPassword }) => changePassword({ newPassword })}
      />
    );
  if (principal) return children;
  if (loadError) {
    return (
      <main className="authentication-shell">
        <section className="authentication-panel">
          <p className="form-error" role="alert" data-testid="auth-load-error">
            {t(errorTranslationKeys[loadError])}
          </p>
          <Button
            data-testid="auth-retry"
            onClick={() => window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT))}
          >
            {t("common.retry")}
          </Button>
        </section>
      </main>
    );
  }
  if (!status) return <main className="authentication-shell">{t("common.loading")}</main>;
  return (
    <main className="authentication-shell">
      <form className="authentication-panel" onSubmit={submit}>
        <p className="eyebrow">{t("navigation.council")}</p>
        <h1>{t(status?.bootstrapRequired ? "auth.bootstrapTitle" : "auth.signInTitle")}</h1>
        {status?.bootstrapRequired ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="auth-display-name">{t("auth.displayName")}</Label>
              <Input id="auth-display-name" name="displayName" autoComplete="name" required />
            </div>
            {status.bootstrapTokenRequired ? (
              <div className="grid gap-1.5">
                <Label htmlFor="auth-setup-token">{t("auth.setupToken")}</Label>
                <Input id="auth-setup-token" name="setupToken" type="password" autoComplete="off" required />
              </div>
            ) : null}
          </>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="auth-email">{t("auth.email")}</Label>
          <Input data-testid="auth-email" id="auth-email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auth-password">{t("auth.password")}</Label>
          <Input
            data-testid="auth-password"
            id="auth-password"
            name="password"
            type="password"
            autoComplete={status?.bootstrapRequired ? "new-password" : "current-password"}
            minLength={12}
            required
          />
        </div>
        {error ? (
          <p className="form-error" role="alert" data-testid="auth-error">
            {t(errorTranslationKeys[error])}
          </p>
        ) : null}
        <Button data-testid="auth-submit" type="submit" disabled={submitting || !representation}>
          {t(submitting ? "auth.submitting" : status?.bootstrapRequired ? "auth.bootstrapSubmit" : "auth.signInSubmit")}
        </Button>
      </form>
    </main>
  );
}
