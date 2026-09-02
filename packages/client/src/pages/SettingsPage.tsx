import type { HallSettings } from "@hall/domain";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, RequestErrorBanner } from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { canLogout, logout } from "../services/authApi";
import { loadHallSettings, updateActiveCouncilTermExpectedMemberCount } from "../services/hallSettingsApi";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { type ThemePreference, useThemePrefsStore } from "../theme/themePrefs";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const { preference, setPreference } = useThemePrefsStore();
  const { submitting, run } = useSubmitting();
  const [logoutAvailable, setLogoutAvailable] = useState(false);
  const [hallSettings, setHallSettings] = useState<HallSettings | null>(null);
  const [settingsUpdateAvailable, setSettingsUpdateAvailable] = useState(false);
  const [expectedMemberCount, setExpectedMemberCount] = useState("");
  const [settingsError, setSettingsError] = useState<ApiErrorCode | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const localeId = useId();
  const themeId = useId();
  const expectedMemberCountId = useId();
  useEffect(() => {
    void canLogout()
      .then(setLogoutAvailable)
      .catch(() => setLogoutAvailable(false));
  }, []);
  useEffect(() => {
    void loadHallSettings()
      .then(({ settings, canUpdate }) => {
        setHallSettings(settings);
        setSettingsUpdateAvailable(canUpdate);
        setExpectedMemberCount(settings.councilTerm.expectedMemberCount?.toString() ?? "");
      })
      .catch((error) => setSettingsError(apiErrorCode(error)));
  }, []);

  const submitCouncilTerm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hallSettings || !settingsUpdateAvailable) return;
    const parsedExpectedMemberCount = Number(expectedMemberCount);
    if (!Number.isSafeInteger(parsedExpectedMemberCount) || parsedExpectedMemberCount <= 0) {
      setSettingsError("invalid_request");
      return;
    }
    await run(async () => {
      setSettingsError(null);
      setSettingsSaved(false);
      try {
        const saved = await updateActiveCouncilTermExpectedMemberCount(parsedExpectedMemberCount);
        setHallSettings(saved);
        setExpectedMemberCount(String(saved.councilTerm.expectedMemberCount));
        await useCouncilMembersStore.getState().load();
        setSettingsSaved(true);
        return true;
      } catch (error) {
        setSettingsError(apiErrorCode(error));
        return false;
      }
    });
  };
  return (
    <div className="page">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="page-content">
        <RequestErrorBanner error={settingsError} />
        {hallSettings && settingsUpdateAvailable ? (
          <form className="creation-form" onSubmit={(event) => void submitCouncilTerm(event)}>
            <h3>{t("settings.councilTerm")}</h3>
            <div className="grid gap-1.5">
              <Label htmlFor={expectedMemberCountId}>{t("settings.expectedMemberCount")}</Label>
              <Input
                id={expectedMemberCountId}
                type="number"
                min="1"
                step="1"
                required
                value={expectedMemberCount}
                onChange={(event) => {
                  setExpectedMemberCount(event.currentTarget.value);
                  setSettingsSaved(false);
                }}
                data-testid="settings-expected-member-count"
              />
              <p className="text-xs text-muted">{t("settings.expectedMemberCountDescription")}</p>
            </div>
            <Button variant="default" type="submit" disabled={submitting} data-testid="settings-council-term-save">
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
            {settingsSaved ? (
              <span role="status" data-testid="settings-council-term-saved">
                {t("workspace.saved")}
              </span>
            ) : null}
          </form>
        ) : null}
        <div className="creation-form">
          <div className="grid gap-1.5">
            <Label htmlFor={localeId}>{t("settings.language")}</Label>
            <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
              <SelectTrigger id={localeId} className="w-full" data-testid="settings-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr" data-testid="settings-language-fr">
                  {t("settings.french")}
                </SelectItem>
                <SelectItem value="en" data-testid="settings-language-en">
                  {t("settings.english")}
                </SelectItem>
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
