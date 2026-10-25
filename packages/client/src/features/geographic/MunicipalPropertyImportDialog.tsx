import type { SirenEntity } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { importMunicipalProperty, type MunicipalPropertyState } from "./geographicLayersApi";

/** Imports the list of parcels owned by the commune from a CSV or text file, or from a pasted list. */
// @implements-requirement HALL-FR-DOC-400
export function MunicipalPropertyImportDialog({
  property,
  onImported,
  onClose,
}: {
  property: SirenEntity;
  onImported(state: MunicipalPropertyState): void;
  onClose(): void;
}) {
  const { t, formatNumber } = useI18n();
  const id = useId();
  const { submitting, run } = useSubmitting();
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [list, setList] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [emptyRejected, setEmptyRejected] = useState<string[] | null>(null);
  const [result, setResult] = useState<MunicipalPropertyState | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setError(null);
      setEmptyRejected(null);
      try {
        const imported = await importMunicipalProperty(property, { label: label.trim(), file, list });
        if (imported.kind === "empty") {
          setEmptyRejected(imported.rejected);
          return;
        }
        setResult(imported.state);
        onImported(imported.state);
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
  };

  return (
    <Modal
      open
      title={t("municipalProperty.import.title")}
      testId="municipal-property-import-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      {result ? (
        <div className="modal-form" data-testid="municipal-property-import-result">
          <p>
            {t("municipalProperty.import.done", {
              count: formatNumber(result.data.parcelIds.length),
              matched: formatNumber(result.data.matchedParcelCount),
            })}
          </p>
          {result.data.rejected && result.data.rejected.length > 0 ? (
            <p className="geographic-feature-card-muted">
              {t("municipalProperty.import.ignored", { values: result.data.rejected.slice(0, 20).join(", ") })}
            </p>
          ) : null}
          <Button type="button" data-testid="municipal-property-import-close" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      ) : (
        <form className="modal-form" onSubmit={submit}>
          <RequestErrorBanner error={error} />
          {emptyRejected ? (
            <p role="alert" className="form-error" data-testid="municipal-property-import-empty">
              {t("municipalProperty.import.empty")}
            </p>
          ) : null}
          <p>{t("municipalProperty.import.description")}</p>
          <fieldset className="grid gap-3" disabled={submitting}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-label`}>{t("municipalProperty.import.label")}</Label>
              <Input
                id={`${id}-label`}
                required
                maxLength={200}
                value={label}
                data-testid="municipal-property-import-label"
                onChange={(event) => setLabel(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-file`}>{t("municipalProperty.import.file")}</Label>
              <Input
                id={`${id}-file`}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                data-testid="municipal-property-import-file"
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-list`}>{t("municipalProperty.import.list")}</Label>
              <Textarea
                id={`${id}-list`}
                rows={5}
                value={list}
                data-testid="municipal-property-import-list"
                onChange={(event) => setList(event.currentTarget.value)}
              />
            </div>
          </fieldset>
          <Button
            type="submit"
            disabled={submitting || !label.trim() || (!file && !list.trim())}
            data-testid="municipal-property-import-submit"
          >
            {t(submitting ? "common.loading" : "municipalProperty.import.submit")}
          </Button>
        </form>
      )}
    </Modal>
  );
}
