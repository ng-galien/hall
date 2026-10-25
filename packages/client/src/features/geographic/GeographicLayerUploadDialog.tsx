import type { GeographicLayerImportIssue, GeographicMapOverlay, SirenEntity } from "@hall/api-contract";
import { type FormEvent, useId, useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { importGeographicLayer } from "./geographicLayersApi";

const issueKeys: Record<GeographicLayerImportIssue["code"], TranslationKey> = {
  invalidJson: "geographicLayer.issue.invalidJson",
  notFeatureCollection: "geographicLayer.issue.notFeatureCollection",
  unsupportedCrs: "geographicLayer.issue.unsupportedCrs",
  tooManyFeatures: "geographicLayer.issue.tooManyFeatures",
  noFeatures: "geographicLayer.issue.noFeatures",
  invalidFeature: "geographicLayer.issue.invalidFeature",
  unsupportedGeometry: "geographicLayer.issue.unsupportedGeometry",
  invalidCoordinates: "geographicLayer.issue.invalidCoordinates",
  coordinatesOutOfRange: "geographicLayer.issue.coordinatesOutOfRange",
  lineTooShort: "geographicLayer.issue.lineTooShort",
  ringTooShort: "geographicLayer.issue.ringTooShort",
  ringNotClosed: "geographicLayer.issue.ringNotClosed",
};

function layerNameFromFile(fileName: string): string {
  return fileName.replace(/\.(geo)?json$/i, "").trim();
}

/** Upload screen opened from the Couches menu: creates a layer from a GeoJSON file and links it to the map. */
// @implements-requirement HALL-FR-DOC-340
export function GeographicLayerUploadDialog({
  map,
  mapReference,
  onImported,
  onClose,
}: {
  map: SirenEntity;
  mapReference: string;
  onImported(overlays: GeographicMapOverlay[]): void;
  onClose(): void;
}) {
  const { t, formatNumber } = useI18n();
  const id = useId();
  const { submitting, run } = useSubmitting();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [issues, setIssues] = useState<GeographicLayerImportIssue[]>([]);
  const [tooLarge, setTooLarge] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    void run(async () => {
      setIssues([]);
      setTooLarge(false);
      setError(null);
      try {
        const result = await importGeographicLayer(map, mapReference, { file, name: name.trim() || file.name });
        if (result.kind === "rejected") {
          setIssues(result.issues);
          return;
        }
        if (result.kind === "tooLarge") {
          setTooLarge(true);
          return;
        }
        onImported(result.overlays);
        onClose();
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
  };

  return (
    <Modal
      open
      title={t("geographicLayer.upload.title")}
      testId="geographic-layer-upload-dialog"
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <form className="modal-form" onSubmit={submit}>
        <RequestErrorBanner error={error} />
        {tooLarge ? (
          <p role="alert" className="form-error" data-testid="geographic-layer-upload-too-large">
            {t("geographicLayer.upload.tooLarge")}
          </p>
        ) : null}
        {issues.length > 0 ? (
          <div role="alert" className="form-error" data-testid="geographic-layer-upload-issues">
            <p>{t("geographicLayer.upload.rejected")}</p>
            <ul className="geographic-layer-upload-issues">
              {issues.map((issue) => (
                <li key={`${issue.code}-${issue.path}`} data-testid="geographic-layer-upload-issue">
                  {issue.featureIndex === null
                    ? null
                    : t("geographicLayer.upload.featurePrefix", { index: formatNumber(issue.featureIndex + 1) })}
                  {t(issueKeys[issue.code])}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p>{t("geographicLayer.upload.description")}</p>
        <fieldset className="grid gap-3" disabled={submitting}>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-file`}>{t("geographicLayer.upload.file")}</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              required
              data-testid="geographic-layer-upload-file"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                setFile(selected);
                setIssues([]);
                setTooLarge(false);
                setError(null);
                if (selected) setName((current) => current || layerNameFromFile(selected.name));
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>{t("geographicLayer.upload.name")}</Label>
            <Input
              id={`${id}-name`}
              required
              maxLength={200}
              value={name}
              data-testid="geographic-layer-upload-name"
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>
        </fieldset>
        <Button type="submit" disabled={submitting || !file} data-testid="geographic-layer-upload-submit">
          {t(submitting ? "geographicLayer.upload.submitting" : "geographicLayer.upload.submit")}
        </Button>
      </form>
    </Modal>
  );
}
