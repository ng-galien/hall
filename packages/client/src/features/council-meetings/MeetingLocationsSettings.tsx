import type { HallSettings } from "@hall/domain";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddIcon, ArrowUpIcon, DeleteIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { updateMeetingLocations } from "../../services/hallSettingsApi";

/** Edits Hall's ordered meeting-location catalogue; every change is saved immediately. */
// @implements-requirement HALL-FR-LOC-040
export function MeetingLocationsSettings({
  initialLocations,
  onSaved,
}: {
  initialLocations: string[];
  onSaved?: (settings: HallSettings) => void;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [locations, setLocations] = useState(initialLocations);
  const [newLocation, setNewLocation] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [saved, setSaved] = useState(false);
  const newLocationId = useId();

  const save = async (next: string[]) =>
    (await run(async () => {
      setError(null);
      setSaved(false);
      try {
        const settings = await updateMeetingLocations(next);
        setLocations(settings.meetingLocations);
        onSaved?.(settings);
        setSaved(true);
        return true;
      } catch (cause) {
        setError(apiErrorCode(cause));
        return false;
      }
    })) === true;

  const add = async () => {
    const name = newLocation.trim();
    if (!name) return;
    if (locations.includes(name)) {
      setError("invalid_request");
      return;
    }
    if (await save([...locations, name])) setNewLocation("");
  };
  const rename = (index: number, value: string) => {
    const name = value.trim();
    if (!name || locations.some((other, position) => position !== index && other === name)) {
      setError("invalid_request");
      return Promise.resolve(false);
    }
    return save(locations.map((current, position) => (position === index ? name : current)));
  };
  const moveUp = (index: number) =>
    void save([
      ...locations.slice(0, index - 1),
      locations[index] as string,
      locations[index - 1] as string,
      ...locations.slice(index + 1),
    ]);
  const remove = (index: number) => void save(locations.filter((_, position) => position !== index));

  return (
    <section className="creation-form" data-testid="settings-meeting-locations-section">
      <h3>{t("settings.meetingLocations")}</h3>
      <p className="text-xs text-muted">{t("settings.meetingLocationsDescription")}</p>
      <RequestErrorBanner error={error} />
      {locations.length === 0 ? (
        <p className="settings-location-empty" data-testid="settings-meeting-locations-empty">
          {t("settings.meetingLocationsEmpty")}
        </p>
      ) : (
        <ul className="settings-location-list" data-testid="settings-meeting-locations">
          {locations.map((name, index) => (
            <li key={name} className="settings-location-row" data-testid={`settings-meeting-location-${index}`}>
              <InlineRenameField
                value={name}
                editing={renaming === name}
                onEditingChange={(editing) => setRenaming(editing ? name : null)}
                onCommit={(value) => rename(index, value)}
                label={t("settings.meetingLocationRename", { name: name })}
                className="settings-location-input"
                testId={`settings-meeting-location-name-input-${index}`}
              >
                <button
                  type="button"
                  className="settings-location-name"
                  data-testid={`settings-meeting-location-name-${index}`}
                  title={t("settings.meetingLocationRename", { name: name })}
                  disabled={submitting}
                  onClick={() => setRenaming(name)}
                >
                  {name}
                  {index === 0 ? (
                    <span className="settings-location-default">{t("settings.meetingLocationDefault")}</span>
                  ) : null}
                </button>
              </InlineRenameField>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={submitting || index === 0}
                aria-label={t("settings.meetingLocationMoveUp", { name: name })}
                title={t("settings.meetingLocationMoveUp", { name: name })}
                data-testid={`settings-meeting-location-up-${index}`}
                onClick={() => moveUp(index)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={submitting}
                aria-label={t("settings.meetingLocationRemove", { name: name })}
                title={t("settings.meetingLocationRemove", { name: name })}
                data-testid={`settings-meeting-location-remove-${index}`}
                onClick={() => remove(index)}
              >
                <DeleteIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="settings-location-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Label htmlFor={newLocationId} className="sr-only">
          {t("settings.meetingLocationNew")}
        </Label>
        <Input
          id={newLocationId}
          value={newLocation}
          maxLength={200}
          placeholder={t("settings.meetingLocationNew")}
          data-testid="settings-meeting-location-new"
          onChange={(event) => {
            setNewLocation(event.currentTarget.value);
            setSaved(false);
          }}
        />
        <Button
          type="submit"
          variant="outline"
          data-testid="settings-meeting-location-add"
          disabled={submitting || !newLocation.trim()}
        >
          <AddIcon />
          {t("settings.meetingLocationAdd")}
        </Button>
      </form>
      {saved ? (
        <span role="status" className="text-xs text-muted" data-testid="settings-meeting-locations-saved">
          {t("workspace.saved")}
        </span>
      ) : null}
    </section>
  );
}
