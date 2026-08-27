import { Button, Input, Label } from "@fluentui/react-components";
import { type FormEvent, useState } from "react";
import { PageHeader, RequestErrorBanner } from "../components/Ui";
import { reloadApplicationData } from "../hooks/useApplicationData";
import { useSubmitting } from "../hooks/useSubmitting";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { getApiToken, saveApiToken } from "../services/apiAccess";
import type { ApiErrorCode } from "../services/apiClient";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const [apiToken, setApiToken] = useState(getApiToken);
  const [saved, setSaved] = useState(false);
  const [accessError, setAccessError] = useState<ApiErrorCode | null>(null);
  const { submitting, run } = useSubmitting();
  const saveAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run(async () => {
      try {
        saveApiToken(apiToken);
        const error = await reloadApplicationData();
        setAccessError(error);
        setSaved(error === null);
      } catch {
        setAccessError("request_failed");
        setSaved(false);
      }
    });
  };
  return (
    <div className="page">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="page-content">
        <div className="creation-form">
          <Label htmlFor="interface-language">{t("settings.language")}</Label>
          <select
            id="interface-language"
            aria-label={t("settings.language")}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="fr">{t("settings.french")}</option>
            <option value="en">{t("settings.english")}</option>
          </select>
          <p className="text-sm text-muted">{t("settings.languageDescription")}</p>
        </div>
        <form className="creation-form" onSubmit={saveAccess}>
          <h3>{t("settings.serverAccess")}</h3>
          <Label htmlFor="server-access-token">{t("settings.apiToken")}</Label>
          <Input
            id="server-access-token"
            type="password"
            autoComplete="off"
            value={apiToken}
            onChange={(_event, data) => {
              setApiToken(data.value);
              setSaved(false);
              setAccessError(null);
            }}
          />
          <p className="text-sm text-muted">{t("settings.serverAccessDescription")}</p>
          <Button type="submit" appearance="primary" disabled={submitting}>
            {t(submitting ? "common.saving" : "settings.saveAccess")}
          </Button>
          <RequestErrorBanner error={accessError} />
          {saved ? <p role="status">{t("settings.accessSaved")}</p> : null}
        </form>
      </div>
    </div>
  );
}
