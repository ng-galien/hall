import type { ApiPrincipal, SirenEntity } from "@hall/api-contract";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { PASSWORD_LINK_ROUTE, PasswordLinkScreen, PasswordRecoveryScreen } from "../features/users/PasswordLinkScreens";
import { useI18n } from "../i18n/I18nProvider";
import { ApiError, type ApiErrorCode, AUTHENTICATION_REQUIRED_EVENT, apiErrorCode } from "../services/apiClient";
import {
  type AuthenticationStatus,
  authenticate,
  changePassword,
  getAuthenticationStatus,
  getSession,
  logout,
  passwordLinksAvailable,
} from "../services/authApi";
import { errorTranslationKeys } from "./Ui";

// @implements-requirement HALL-FR-USR-080 (sign-in offers « Mot de passe oublié ? »; a password-link address opens the
// screen that records the password of the link, before any session check)
export function AuthenticationGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const linkToken = location.pathname.replace(/\/+$/, "") === PASSWORD_LINK_ROUTE ? location.hash.slice(1) : null;
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [passwordRecorded, setPasswordRecorded] = useState(false);
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
      setPasswordRecorded(false);
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

  if (linkToken !== null && status && representation)
    return (
      <PasswordLinkScreen
        representation={representation}
        token={linkToken}
        onRecorded={(recordedEmail) => {
          setEmail(recordedEmail);
          setPasswordRecorded(true);
          setRecovery(false);
          setPrincipal(null);
          navigate("/", { replace: true });
        }}
        onRequestNew={() => {
          setRecovery(true);
          navigate("/", { replace: true });
        }}
      />
    );
  if (recovery && representation && !principal)
    return (
      <PasswordRecoveryScreen
        representation={representation}
        initialEmail={email}
        onBack={(typed) => {
          setEmail(typed);
          setRecovery(false);
        }}
      />
    );
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
            <Field label={t("auth.displayName")}>
              <Input name="displayName" autoComplete="name" required />
            </Field>
            {status.bootstrapTokenRequired ? (
              <Field label={t("auth.setupToken")}>
                <Input name="setupToken" type="password" autoComplete="off" required />
              </Field>
            ) : null}
          </>
        ) : null}
        {passwordRecorded ? (
          <p role="status" data-testid="auth-password-recorded">
            {t("auth.passwordRecorded")}
          </p>
        ) : null}
        <Field label={t("auth.email")}>
          <Input
            data-testid="auth-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </Field>
        <Field label={t("auth.password")}>
          <Input
            data-testid="auth-password"
            name="password"
            type="password"
            autoComplete={status?.bootstrapRequired ? "new-password" : "current-password"}
            minLength={12}
            required
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert" data-testid="auth-error">
            {t(errorTranslationKeys[error])}
          </p>
        ) : null}
        <Button data-testid="auth-submit" type="submit" disabled={submitting || !representation}>
          {t(submitting ? "auth.submitting" : status?.bootstrapRequired ? "auth.bootstrapSubmit" : "auth.signInSubmit")}
        </Button>
        {representation && passwordLinksAvailable(representation) ? (
          <Button
            variant="plain"
            type="button"
            data-testid="auth-forgot-password"
            onClick={() => {
              setError(null);
              setRecovery(true);
            }}
          >
            {t("auth.forgotPassword")}
          </Button>
        ) : null}
      </form>
    </main>
  );
}
