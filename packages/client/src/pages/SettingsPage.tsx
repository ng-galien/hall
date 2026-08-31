import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "../components/Ui";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { canLogout, logout } from "../services/authApi";
import { type ThemePreference, useThemePrefsStore } from "../theme/themePrefs";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const { preference, setPreference } = useThemePrefsStore();
  const [logoutAvailable, setLogoutAvailable] = useState(false);
  const localeId = useId();
  const themeId = useId();
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
          <div className="grid gap-1.5">
            <Label htmlFor={localeId}>{t("settings.language")}</Label>
            <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
              <SelectTrigger id={localeId} className="w-full" data-testid="settings-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr" data-testid="settings-language-fr">{t("settings.french")}</SelectItem>
                <SelectItem value="en" data-testid="settings-language-en">{t("settings.english")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">{t("settings.languageDescription")}</p>
          </div>
        </div>
        <div className="creation-form">
          <div className="grid gap-1.5">
            <Label htmlFor={themeId}>{t("settings.theme")}</Label>
            <Select value={preference} onValueChange={(value) => setPreference(value as ThemePreference)}>
              <SelectTrigger id={themeId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("settings.themeAuto")}</SelectItem>
                <SelectItem value="light">{t("settings.themeLight")}</SelectItem>
                <SelectItem value="dark">{t("settings.themeDark")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">{t("settings.themeDescription")}</p>
          </div>
        </div>
        {logoutAvailable ? (
          <div className="creation-form">
            <h3>{t("settings.session")}</h3>
            <Button onClick={() => void logout()}>{t("settings.logout")}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
