import { useEffect } from "react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "../i18n/I18nProvider";

/** Shown by the router when a screen throws: a plain notice and a way out, never the stack trace. */
export function ApplicationErrorPage() {
  const { t } = useI18n();
  const error = useRouteError();
  useEffect(() => {
    console.error("Hall screen failure", error);
  }, [error]);
  return (
    <main className="application-error" role="alert" data-testid="application-error">
      <h1>{t("applicationError.title")}</h1>
      <p>{t("applicationError.description")}</p>
      <div className="application-error-actions">
        <Button data-testid="application-error-reload" onClick={() => window.location.reload()}>
          {t("applicationError.reload")}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/" data-testid="application-error-home">
            {t("applicationError.home")}
          </Link>
        </Button>
      </div>
    </main>
  );
}
