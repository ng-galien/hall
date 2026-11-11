import { type FormEvent, useState } from "react";
import { ShareIcon } from "../../components/icons";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field, FieldRow } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import {
  councilBusinessBundleFile,
  exportCouncilBusinessBundle,
  importCouncilBusinessBundle,
} from "../../services/councilBusinessBundlesApi";
import { shareOrDownload } from "../../services/fileSharing";

// @implements-requirement HALL-FR-DOC-570
export function BusinessBundleExportDialog({ businessId, onClose }: { businessId: string; onClose(): void }) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const sender = () => ({ firstName: firstName.trim(), lastName: lastName.trim() });
  const deliver = (share: boolean) =>
    void run(async () => {
      setError(null);
      try {
        if (share) await shareOrDownload(await councilBusinessBundleFile(businessId, sender()));
        else await exportCouncilBusinessBundle(businessId, sender());
        onClose();
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    deliver(false);
  };
  return (
    <Modal
      open
      title={t("bundles.export")}
      testId="bundle-export-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <form className="modal-form" onSubmit={submit}>
        <RequestErrorBanner error={error} />
        <p>{t("bundles.senderDescription")}</p>
        <fieldset className="grid gap-3" disabled={submitting}>
          <FieldRow>
            <Field label={t("bundles.lastName")}>
              <Input
                data-testid="bundle-last-name"
                required
                maxLength={200}
                value={lastName}
                onChange={(event) => setLastName(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("bundles.firstName")}>
              <Input
                data-testid="bundle-first-name"
                required
                maxLength={200}
                value={firstName}
                onChange={(event) => setFirstName(event.currentTarget.value)}
              />
            </Field>
          </FieldRow>
        </fieldset>
        <Button
          type="submit"
          disabled={submitting || !firstName.trim() || !lastName.trim()}
          data-testid="bundle-export-submit"
        >
          {t(submitting ? "common.loading" : "bundles.export")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={submitting || !firstName.trim() || !lastName.trim()}
          data-testid="bundle-export-share"
          onClick={() => deliver(true)}
        >
          <ShareIcon aria-hidden="true" />
          {t("common.share")}
        </Button>
      </form>
    </Modal>
  );
}

export function BusinessBundleImportDialog({
  onClose,
  onImported,
}: {
  onClose(): void;
  onImported(id: string): Promise<void>;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    void run(async () => {
      setError(null);
      try {
        const business = await importCouncilBusinessBundle(file);
        await onImported(business.id);
        onClose();
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
  };
  return (
    <Modal
      open
      title={t("bundles.import")}
      testId="bundle-import-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <form className="modal-form" onSubmit={submit}>
        {error === "conflict" ? (
          <p role="alert" className="form-error" data-testid="bundle-import-conflict">
            {t("bundles.alreadyPresent")}
          </p>
        ) : (
          <RequestErrorBanner error={error} />
        )}
        <p>{t("bundles.destination")}</p>
        <Field label={t("bundles.archive")}>
          <Input
            type="file"
            accept=".hallbundle"
            required
            disabled={submitting}
            data-testid="bundle-import-file"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" disabled={submitting || !file} data-testid="bundle-import-submit">
          {t(submitting ? "common.loading" : "bundles.import")}
        </Button>
      </form>
    </Modal>
  );
}
