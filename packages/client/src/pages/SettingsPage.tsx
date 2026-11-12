import { findSirenAction, findSirenLink } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, RequestErrorBanner } from "../components/Ui";
import { AuthorizationSettings } from "../features/authorization/AuthorizationSettings";
import { MeetingLocationsSettings } from "../features/council-meetings/MeetingLocationsSettings";
import { CommuneSettings } from "../features/settings/CommuneSettings";
import { MailSettings } from "../features/settings/MailSettings";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { useSubmitting } from "../hooks/useSubmitting";
import type { TranslationKey } from "../i18n/en";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, apiSirenRequest } from "../services/apiClient";
import { changePassword, getSessionSiren, logout } from "../services/authApi";
import { loadHallSettings, updateActiveCouncilTermExpectedMemberCount } from "../services/hallSettingsApi";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { type ThemePreference, useThemePrefsStore } from "../theme/themePrefs";
import { TemplatesPage } from "./TemplatesPage";

/** The screens of the settings: five under Administration in the menu, and « Paramètres » for the person. */
export type SettingsCategory = "commune" | "council" | "rights" | "documents" | "mail" | "preferences";

const administrationCategories = ["commune", "council", "rights", "documents", "mail"] as const;

const categoryTitles: Record<SettingsCategory, TranslationKey> = {
  commune: "navigation.commune",
  council: "navigation.councilSettings",
  rights: "navigation.rights",
  documents: "navigation.documentSettings",
  mail: "navigation.mailSettings",
  preferences: "navigation.settings",
};

/** « Paramètres »: the preferences and the session of the person; an address of a former tab opens its own screen. */
export function PersonalSettingsPage() {
  const [searchParams] = useSearchParams();
  const requested = administrationCategories.find((value) => value === searchParams.get("category"));
  return requested ? <Navigate to={`/administration/${requested}`} replace /> : <SettingsPage category="preferences" />;
}

// @implements-requirement HALL-FR-CFG-010
/** One screen of the settings, reached by its own entry of the menu, without tabs. */
export function SettingsPage({ category }: { category: SettingsCategory }) {
  const [rolesAvailable, setRolesAvailable] = useState(false);
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
      <PageHeader title={t(categoryTitles[category])} />
      <div className="page-content" data-testid={`settings-${category}-screen`}>
        <RequestErrorBanner error={settingsError} />
        {category === "commune" ? (
          <>
            {hallSettings ? (
              <CommuneSettings settings={hallSettings} canUpdate={settingsUpdateAvailable} onSaved={setHallSettings} />
            ) : null}
          </>
        ) : null}
        {category === "council" ? (
          <>
            {hallSettings && councilTermUpdateAvailable ? (
              <form className="creation-form" onSubmit={(event) => void submitCouncilTerm(event)}>
                <h3>{t("settings.councilTerm")}</h3>
                <Field label={t("settings.expectedMemberCount")} help={t("settings.expectedMemberCountDescription")}>
                  <Input
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
                </Field>
                <div className="settings-actions">
                  {settingsSaved ? (
                    <span
                      className="record-state"
                      data-save="saved"
                      role="status"
                      data-testid="settings-council-term-saved"
                    >
                      {t("workspace.saved")}
                    </span>
                  ) : null}
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={submitting}
                    data-testid="settings-council-term-save"
                  >
                    {t(submitting ? "common.saving" : "common.save")}
                  </Button>
                </div>
              </form>
            ) : null}
            {hallSettings && settingsUpdateAvailable ? (
              <MeetingLocationsSettings initialLocations={hallSettings.meetingLocations} onSaved={setHallSettings} />
            ) : null}
          </>
        ) : null}
        {category === "documents" ? <TemplatesPage embedded /> : null}
        {category === "mail" && hallSettings ? (
          <MailSettings settings={hallSettings} canUpdate={settingsUpdateAvailable} onSaved={setHallSettings} />
        ) : null}
        {category === "rights" && rolesAvailable ? <AuthorizationSettings /> : null}
        {category === "preferences" ? (
          <>
            <section className="creation-form">
              <h3>{t("settings.display")}</h3>
              <Field label={t("settings.language")} help={t("settings.languageDescription")}>
                <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
                  <SelectTrigger className="w-full" data-testid="settings-language">
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
              </Field>
              <Field label={t("settings.theme")} help={t("settings.themeDescription")}>
                <Select value={preference} onValueChange={(value) => setPreference(value as ThemePreference)}>
                  <SelectTrigger className="w-full" data-testid="settings-theme">
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
              </Field>
            </section>
            {logoutAvailable || passwordChangeAvailable ? (
              <section className="creation-form">
                <h3>{t("settings.session")}</h3>
                <div className="settings-actions settings-actions-start">
                  {passwordChangeAvailable && (
                    <Button
                      variant="secondary"
                      onClick={() => setPasswordOpen(true)}
                      data-testid="settings-change-password"
                    >
                      {t("users.changePassword")}
                    </Button>
                  )}
                  {logoutAvailable && (
                    <Button variant="secondary" onClick={() => void logout()} data-testid="settings-logout">
                      {t("settings.logout")}
                    </Button>
                  )}
                </div>
              </section>
            ) : null}
            {import.meta.env.DEV ? (
              <p className="settings-lab">
                <Link to="/editor-lab" data-testid="settings-editor-lab">
                  {t("navigation.lab")}
                </Link>
              </p>
            ) : null}
          </>
        ) : null}
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
