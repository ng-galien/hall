import type { ApiPrincipal, SirenEntity } from "@mairie/api-contract";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ApiError, AUTHENTICATION_REQUIRED_EVENT, apiErrorCode } from "../services/apiClient";
import { type AuthenticationStatus, authenticate, getAuthenticationStatus, getSession } from "../services/authApi";

export function AuthenticationGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthenticationStatus | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity<Record<string, unknown>> | null>(null);
  const [principal, setPrincipal] = useState<ApiPrincipal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getAuthenticationStatus();
        setStatus(result.data);
        setRepresentation(result.representation);
        try {
          setPrincipal(await getSession());
        } catch (sessionError) {
          if (!(sessionError instanceof ApiError) || sessionError.status !== 401) throw sessionError;
          setPrincipal(null);
        }
      } catch (loadError) {
        setError(apiErrorCode(loadError));
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

  if (principal) return children;
  if (!status && !error) return <main className="authentication-shell">Chargement…</main>;
  return (
    <main className="authentication-shell">
      <form className="authentication-panel" onSubmit={submit}>
        <p className="eyebrow">Conseil municipal</p>
        <h1>{status?.bootstrapRequired ? "Créer le premier administrateur" : "Connexion"}</h1>
        {status?.bootstrapRequired ? (
          <>
            <label>
              Nom affiché
              <input name="displayName" autoComplete="name" required />
            </label>
            {status.bootstrapTokenRequired ? (
              <label>
                Jeton d’initialisation
                <input name="setupToken" type="password" autoComplete="off" required />
              </label>
            ) : null}
          </>
        ) : null}
        <label>
          Adresse électronique
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete={status?.bootstrapRequired ? "new-password" : "current-password"}
            minLength={12}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={submitting || !representation}>
          {submitting ? "Validation…" : status?.bootstrapRequired ? "Initialiser" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
