import type { HallSettings } from "@hall/domain";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { RequestErrorBanner } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { type MailSettingsValues, updateMailSettings } from "../../services/hallSettingsApi";

const valuesOf = (settings: HallSettings): MailSettingsValues => ({
  outboundEmailSenderName: settings.outboundEmailSenderName,
  outboundEmailSenderAddress: settings.outboundEmailSenderAddress,
  outboundEmailReplyToAddress: settings.outboundEmailReplyToAddress,
  outboundEmailSignatureMarkdown: settings.outboundEmailSignatureMarkdown,
  outboundEmailFooterMarkdown: settings.outboundEmailFooterMarkdown,
});

// @implements-requirement HALL-FR-CFG-030
export function MailSettings({
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
  const [draft, setDraft] = useState(() => valuesOf(settings));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const change = (patch: Partial<MailSettingsValues>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      setError(null);
      setSaved(false);
      try {
        const updated = await updateMailSettings(draft);
        setDraft(valuesOf(updated));
        onSaved?.(updated);
        setSaved(true);
        return true;
      } catch (cause) {
        setError(cause instanceof Error && cause.name === "ZodError" ? "invalid_request" : apiErrorCode(cause));
        return false;
      }
    });
  };
  return (
    <form className="creation-form" onSubmit={submit} data-testid="settings-mail">
      <h3>{t("settings.category.mail")}</h3>
      <p className="admin-hint">{t("settings.mail.description")}</p>
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      {(["outboundEmailSenderName", "outboundEmailSenderAddress", "outboundEmailReplyToAddress"] as const).map(
        (field) => (
          <Field key={field} label={t(`settings.mail.${field}`)}>
            <Input
              type={field === "outboundEmailSenderName" ? "text" : "email"}
              value={draft[field] ?? ""}
              readOnly={!canUpdate}
              data-testid={`settings-mail-${field}`}
              onChange={(event) =>
                change({ [field]: event.currentTarget.value || (field === "outboundEmailSenderName" ? "" : null) })
              }
            />
          </Field>
        ),
      )}
      {(["outboundEmailSignatureMarkdown", "outboundEmailFooterMarkdown"] as const).map((field) => (
        <div className="settings-editor" key={field}>
          <h4>{t(`settings.mail.${field}`)}</h4>
          <MarkdownEditor
            markdown={draft[field]}
            title={t(`settings.mail.${field}`)}
            testId={`settings-mail-${field}`}
            readOnly={!canUpdate}
            onChange={(value) => change({ [field]: value })}
          />
        </div>
      ))}
      {canUpdate ? (
        <div className="settings-actions">
          {saved ? (
            <span className="record-state" data-save="saved" role="status" data-testid="settings-mail-saved">
              {t("workspace.saved")}
            </span>
          ) : null}
          <Button type="submit" disabled={submitting} data-testid="settings-mail-save">
            {t(submitting ? "common.saving" : "common.save")}
          </Button>
        </div>
      ) : (
        <p className="admin-hint">{t("settings.communeReadOnly")}</p>
      )}
    </form>
  );
}
