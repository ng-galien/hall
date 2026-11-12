import type { HallSettings } from "@hall/domain";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HelpHint } from "../../components/HelpHint";
import { RequestErrorBanner } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { type CommuneSettings as CommuneValues, updateCommuneSettings } from "../../services/hallSettingsApi";

type CommuneField = keyof CommuneValues;

const fields: Array<{ field: CommuneField; label: TranslationKey; type?: string; inputMode?: "numeric" }> = [
  { field: "name", label: "settings.communeName" },
  { field: "inseeCode", label: "settings.communeInseeCode", inputMode: "numeric" },
  { field: "siren", label: "settings.communeSiren", inputMode: "numeric" },
  { field: "addressLine1", label: "settings.communeAddressLine1" },
  { field: "addressLine2", label: "settings.communeAddressLine2" },
  { field: "postalCode", label: "settings.communePostalCode", inputMode: "numeric" },
  { field: "city", label: "settings.communeCity" },
  { field: "population", label: "settings.communePopulation", type: "number" },
  { field: "populationReferenceDate", label: "settings.communePopulationReferenceDate", type: "date" },
  { field: "phone", label: "settings.communePhone", type: "tel" },
  { field: "website", label: "settings.communeWebsite", type: "url" },
  { field: "email", label: "settings.mail.contact", type: "email" },
  { field: "timeZone", label: "settings.mail.timeZone" },
];

/** Fields that go together share one row of the form. */
const fieldRows: CommuneField[][] = [
  ["name"],
  ["inseeCode", "siren"],
  ["addressLine1"],
  ["addressLine2"],
  ["postalCode", "city"],
  ["population", "populationReferenceDate"],
  ["phone", "email"],
  ["website", "timeZone"],
];

const nullableFields = new Set<CommuneField>([
  "inseeCode",
  "siren",
  "population",
  "populationReferenceDate",
  "website",
  "email",
]);

function draftOf(settings: HallSettings): Record<CommuneField, string> {
  return Object.fromEntries(
    fields.map(({ field }) => [field, settings[field] === null ? "" : String(settings[field])]),
  ) as Record<CommuneField, string>;
}

function communeOf(draft: Record<CommuneField, string>): CommuneValues {
  const value = (field: CommuneField) => {
    const text = draft[field].trim();
    if (!text && nullableFields.has(field)) return null;
    return field === "population" ? Number(text) : text;
  };
  return Object.fromEntries(fields.map(({ field }) => [field, value(field)])) as unknown as CommuneValues;
}

/**
 * The municipality's data in Settings: an administrator, who holds settings.update, edits the named fields; any other
 * signed-in account reads them. Fields owned by other settings categories keep their stored values.
 */
// @implements-requirement HALL-FR-COM-010
export function CommuneSettings({
  settings,
  canUpdate,
  onSaved,
}: {
  settings: HallSettings;
  canUpdate: boolean;
  onSaved?: (settings: HallSettings) => void;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [draft, setDraft] = useState(() => draftOf(settings));
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      setError(null);
      setSaved(false);
      try {
        const updated = await updateCommuneSettings(communeOf(draft));
        setDraft(draftOf(updated));
        onSaved?.(updated);
        setSaved(true);
        return true;
      } catch (cause) {
        setError(cause instanceof Error && cause.name === "ZodError" ? "invalid_request" : apiErrorCode(cause));
        return false;
      }
    });
  };

  if (!canUpdate) {
    return (
      <section className="creation-form" data-testid="settings-commune">
        <h3>{t("settings.commune")}</h3>
        <p className="admin-hint">{t("settings.communeReadOnly")}</p>
        <dl className="settings-commune-facts">
          {fields.map(({ field, label }) => (
            <div key={field}>
              <dt>{t(label)}</dt>
              <dd data-testid={`settings-commune-value-${field}`}>{draft[field] || t("settings.communeEmpty")}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <form className="creation-form" data-testid="settings-commune" onSubmit={submit}>
      <div className="creation-form-title">
        <h3>{t("settings.commune")}</h3>
        <HelpHint text={t("settings.communeDescription")} />
      </div>
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="admin-fields">
        {fieldRows.map((row) => (
          <FieldRow key={row.join("-")}>
            {row.map((field) => {
              const { label, type, inputMode } = fields.find((candidate) => candidate.field === field) ?? {
                label: "settings.communeName" as const,
              };
              return (
                <Field key={field} label={t(label)}>
                  <Input
                    type={type ?? "text"}
                    inputMode={inputMode}
                    min={type === "number" ? 0 : undefined}
                    step={type === "number" ? 1 : undefined}
                    required={field === "name"}
                    value={draft[field]}
                    disabled={submitting}
                    data-testid={`settings-commune-${field}`}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((current) => ({ ...current, [field]: value }));
                      setSaved(false);
                    }}
                  />
                </Field>
              );
            })}
          </FieldRow>
        ))}
      </div>
      <div className="settings-actions">
        {saved ? (
          <span className="record-state" data-save="saved" role="status" data-testid="settings-commune-saved">
            {t("workspace.saved")}
          </span>
        ) : null}
        <Button type="submit" disabled={submitting || !draft.name.trim()} data-testid="settings-commune-save">
          {t(submitting ? "common.saving" : "common.save")}
        </Button>
      </div>
    </form>
  );
}
