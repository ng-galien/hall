import { type FormEvent, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { exportCouncilBusinessBundle, importCouncilBusinessBundle } from "../../services/councilBusinessBundlesApi";

export function BusinessBundleExportDialog({ businessId, onClose }: { businessId: string; onClose(): void }) {
  const { t } = useI18n();
  const id = useId();
  const { submitting, run } = useSubmitting();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setError(null);
      try {
        await exportCouncilBusinessBundle(businessId, { firstName: firstName.trim(), lastName: lastName.trim() });
        onClose();
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
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
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-last`}>{t("bundles.lastName")}</Label>
            <Input
              id={`${id}-last`}
              data-testid="bundle-last-name"
              required
              maxLength={200}
              value={lastName}
              onChange={(event) => setLastName(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-first`}>{t("bundles.firstName")}</Label>
            <Input
              id={`${id}-first`}
              data-testid="bundle-first-name"
              required
              maxLength={200}
              value={firstName}
              onChange={(event) => setFirstName(event.currentTarget.value)}
            />
          </div>
        </fieldset>
        <Button
          type="submit"
          disabled={submitting || !firstName.trim() || !lastName.trim()}
          data-testid="bundle-export-submit"
        >
          {t(submitting ? "common.loading" : "bundles.export")}
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
  const id = useId();
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
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{t("bundles.archive")}</Label>
          <Input
            id={id}
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
        </div>
        <Button type="submit" disabled={submitting || !file} data-testid="bundle-import-submit">
          {t(submitting ? "common.loading" : "bundles.import")}
        </Button>
      </form>
    </Modal>
  );
}
