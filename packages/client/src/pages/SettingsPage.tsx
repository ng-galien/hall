import { findSirenAction, findSirenLink } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, RequestErrorBanner } from "../components/Ui";
import { AuthorizationSettings } from "../features/authorization/AuthorizationSettings";
import { MeetingLocationsSettings } from "../features/council-meetings/MeetingLocationsSettings";
import { CommuneSettings } from "../features/settings/CommuneSettings";
import { MailSettings } from "../features/settings/MailSettings";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { useSubmitting } from "../hooks/useSubmitting";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, apiSirenRequest } from "../services/apiClient";
import { changePassword, getSessionSiren, logout } from "../services/authApi";
import { loadHallSettings, updateActiveCouncilTermExpectedMemberCount } from "../services/hallSettingsApi";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { type ThemePreference, useThemePrefsStore } from "../theme/themePrefs";
import { TemplatesPage } from "./TemplatesPage";

// @implements-requirement HALL-FR-CFG-010
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rolesAvailable, setRolesAvailable] = useState(false);
  const categories = [
    "commune",
    "council",
    "documents",
    "mail",
    ...(rolesAvailable ? ["rights" as const] : []),
    "preferences",
  ] as const;
  const requestedCategory = searchParams.get("category");
  const category = categories.find((value) => value === requestedCategory) ?? "commune";
  const { locale, setLocale, t } = useI18n();
  const { preference, setPreference } = useThemePrefsStore();
  const { submitting, run } = useSubmitting();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordChangeAvailable, setPasswordChangeAvailable] = useState(false);
  const [logoutAvailable, setLogoutAvailable] = useState(false);
  const [hallSettings, setHallSettings] = useState<HallSettings | null>(null);
  const [councilTermUpdateAvailable, setCouncilTermUpdateAvailable] = useState(false);
  const [expectedMemberCount, setExpectedMemberCount] = useState("");
  const [settingsError, setSettingsError] = useState<ApiErrorCode | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsUpdateAvailable, setSettingsUpdateAvailable] = useState(false);
  const localeId = useId();
  const themeId = useId();
  const expectedMemberCountId = useId();
  useEffect(() => {
    void apiSirenRequest("")
      .then(({ representation }) =>
        setRolesAvailable(Boolean(representation && findSirenLink(representation, "roles"))),
      )
      .catch(() => setRolesAvailable(false));
    void getSessionSiren()
      .then(({ representation }) => {
        setLogoutAvailable(Boolean(representation && findSirenAction(representation, "session.logout")));
        setPasswordChangeAvailable(
          Boolean(representation && findSirenAction(representation, "session.change-password")),
        );
      })
      .catch(() => {
        setLogoutAvailable(false);
        setPasswordChangeAvailable(false);
      });
  }, []);
  useEffect(() => {
    void loadHallSettings()
      .then(({ settings, canUpdate, councilTerm, canConfigureCouncilTerm }) => {
        setHallSettings(settings);
        setSettingsUpdateAvailable(canUpdate);
        setCouncilTermUpdateAvailable(canConfigureCouncilTerm);
        setExpectedMemberCount(councilTerm?.expectedMemberCount.toString() ?? "");
      })
      .catch((error) => setSettingsError(apiErrorCode(error)));
  }, []);

  const submitCouncilTerm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hallSettings || !councilTermUpdateAvailable) return;
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
        setExpectedMemberCount(String(saved.expectedMemberCount));
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
        <Tabs value={category} onValueChange={(value) => setSearchParams({ category: value })}>
          <TabsList
            className="settings-tabs w-full flex-wrap"
            data-testid="settings-tabs"
            aria-label={t("settings.title")}
          >
            {categories.map((value) => (
              <TabsTrigger key={value} value={value} data-testid={`settings-tab-${value}`}>
                {t(`settings.category.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="commune">
            {hallSettings ? (
              <CommuneSettings settings={hallSettings} canUpdate={settingsUpdateAvailable} onSaved={setHallSettings} />
            ) : null}
          </TabsContent>
          <TabsContent value="council">
            {hallSettings && councilTermUpdateAvailable ? (
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
            {hallSettings && settingsUpdateAvailable ? (
              <MeetingLocationsSettings initialLocations={hallSettings.meetingLocations} onSaved={setHallSettings} />
            ) : null}
          </TabsContent>
          <TabsContent value="documents">
            <TemplatesPage embedded />
          </TabsContent>
          <TabsContent value="mail">
            {hallSettings ? (
              <MailSettings settings={hallSettings} canUpdate={settingsUpdateAvailable} onSaved={setHallSettings} />
            ) : null}
          </TabsContent>
          {rolesAvailable ? (
            <TabsContent value="rights">
              <AuthorizationSettings />
            </TabsContent>
          ) : null}
          <TabsContent value="preferences">
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
                  <SelectTrigger id={themeId} className="w-full" data-testid="settings-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" data-testid="settings-theme-auto">
                      {t("settings.themeAuto")}
                    </SelectItem>
                    <SelectItem value="light" data-testid="settings-theme-light">
                      {t("settings.themeLight")}
                    </SelectItem>
                    <SelectItem value="dark" data-testid="settings-theme-dark">
                      {t("settings.themeDark")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted">{t("settings.themeDescription")}</p>
              </div>
            </div>
            {logoutAvailable || passwordChangeAvailable ? (
              <div className="creation-form">
                <h3>{t("settings.session")}</h3>
                <div className="flex flex-wrap gap-2">
                  {passwordChangeAvailable && (
                    <Button
                      variant="outline"
                      onClick={() => setPasswordOpen(true)}
                      data-testid="settings-change-password"
                    >
                      {t("users.changePassword")}
                    </Button>
                  )}
                  {logoutAvailable && (
                    <Button onClick={() => void logout()} data-testid="settings-logout">
                      {t("settings.logout")}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
      {passwordOpen && (
        <PasswordDialog
          title={t("users.changePassword")}
          requireCurrent
          onClose={() => setPasswordOpen(false)}
          onSubmit={changePassword}
        />
      )}
    </div>
  );
}
