import { findSirenAction } from "@hall/api-contract";
import type { HallSettings } from "@hall/domain";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddIcon, ArrowUpIcon, DeleteIcon } from "../components/icons";
import { PageHeader, RequestErrorBanner } from "../components/Ui";
import { PasswordDialog } from "../features/users/PasswordDialog";
import { useSubmitting } from "../hooks/useSubmitting";
import { type Locale, useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { changePassword, getSessionSiren, logout } from "../services/authApi";
import {
  loadHallSettings,
  updateActiveCouncilTermExpectedMemberCount,
  updateMeetingLocations,
} from "../services/hallSettingsApi";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { type ThemePreference, useThemePrefsStore } from "../theme/themePrefs";

export function SettingsPage() {
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
  const [meetingLocations, setMeetingLocations] = useState<string[]>([]);
  const [newMeetingLocation, setNewMeetingLocation] = useState("");
  const [meetingLocationsSaved, setMeetingLocationsSaved] = useState(false);
  const newMeetingLocationId = useId();
  const localeId = useId();
  const themeId = useId();
  const expectedMemberCountId = useId();
  useEffect(() => {
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
        setMeetingLocations(settings.meetingLocations);
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
  const changeMeetingLocations = (next: string[]) => {
    setMeetingLocations(next);
    setMeetingLocationsSaved(false);
  };
  const addMeetingLocation = () => {
    const name = newMeetingLocation.trim();
    if (!name || meetingLocations.includes(name)) return;
    changeMeetingLocations([...meetingLocations, name]);
    setNewMeetingLocation("");
  };
  const submitMeetingLocations = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run(async () => {
      setSettingsError(null);
      try {
        const saved = await updateMeetingLocations(meetingLocations);
        setHallSettings(saved);
        setMeetingLocations(saved.meetingLocations);
        setMeetingLocationsSaved(true);
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
          <form className="creation-form" onSubmit={(event) => void submitMeetingLocations(event)}>
            <h3>{t("settings.meetingLocations")}</h3>
            <p className="text-xs text-muted">{t("settings.meetingLocationsDescription")}</p>
            <ul className="settings-location-list" data-testid="settings-meeting-locations">
              {meetingLocations.map((name, index) => (
                <li key={name} className="settings-location-row" data-testid={`settings-meeting-location-${index}`}>
                  <span>{name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    aria-label={t("settings.meetingLocationMoveUp").replace("{name}", name)}
                    title={t("settings.meetingLocationMoveUp").replace("{name}", name)}
                    data-testid={`settings-meeting-location-up-${index}`}
                    onClick={() =>
                      changeMeetingLocations([
                        ...meetingLocations.slice(0, index - 1),
                        name,
                        meetingLocations[index - 1] as string,
                        ...meetingLocations.slice(index + 1),
                      ])
                    }
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("settings.meetingLocationRemove").replace("{name}", name)}
                    title={t("settings.meetingLocationRemove").replace("{name}", name)}
                    data-testid={`settings-meeting-location-remove-${index}`}
                    onClick={() => changeMeetingLocations(meetingLocations.filter((_, other) => other !== index))}
                  >
                    <DeleteIcon />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="settings-location-add">
              <Label htmlFor={newMeetingLocationId} className="sr-only">
                {t("settings.meetingLocationNew")}
              </Label>
              <Input
                id={newMeetingLocationId}
                value={newMeetingLocation}
                maxLength={200}
                placeholder={t("settings.meetingLocationNew")}
                data-testid="settings-meeting-location-new"
                onChange={(event) => setNewMeetingLocation(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addMeetingLocation();
                }}
              />
              <Button
                type="button"
                variant="outline"
                data-testid="settings-meeting-location-add"
                disabled={!newMeetingLocation.trim()}
                onClick={addMeetingLocation}
              >
                <AddIcon />
                {t("settings.meetingLocationAdd")}
              </Button>
            </div>
            <Button variant="default" type="submit" disabled={submitting} data-testid="settings-meeting-locations-save">
              {t(submitting ? "common.saving" : "common.save")}
            </Button>
            {meetingLocationsSaved ? (
              <span role="status" data-testid="settings-meeting-locations-saved">
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
        {logoutAvailable || passwordChangeAvailable ? (
          <div className="creation-form">
            <h3>{t("settings.session")}</h3>
            <div className="flex flex-wrap gap-2">
              {passwordChangeAvailable && (
                <Button variant="outline" onClick={() => setPasswordOpen(true)} data-testid="settings-change-password">
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
