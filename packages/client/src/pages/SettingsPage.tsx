import { Label } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/Ui";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { canLogout, logout } from "../services/authApi";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const [logoutAvailable, setLogoutAvailable] = useState(false);
  useEffect(() => {
    void canLogout()
      .then(setLogoutAvailable)
      .catch(() => setLogoutAvailable(false));
  }, []);
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
        {logoutAvailable ? (
          <div className="creation-form">
            <h2>{t("settings.session")}</h2>
            <button type="button" onClick={() => void logout()}>
              {t("settings.logout")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
