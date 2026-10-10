import type { ResourceDetail } from "@hall/api-contract";
import { useI18n } from "../../i18n/I18nProvider";

type GeographicLayerResource = Extract<ResourceDetail, { kind: "geographicLayer" }>;

/** Read-only summary of a geographic layer opened from the workspace. */
// @implements-requirement HALL-FR-DOC-310
export function GeographicLayerResourceView({ resource }: { resource: GeographicLayerResource }) {
  const { t, formatDateTime, formatNumber, formatFileSize } = useI18n();
  const [west, south, east, north] = resource.extent.map((value) => formatNumber(Number(value.toFixed(5))));
  return (
    <dl className="geographic-layer-summary" data-testid="geographic-layer-summary">
      <dt>{t("geographicLayer.featureCount")}</dt>
      <dd data-testid="geographic-layer-summary-count">{formatNumber(resource.featureCount)}</dd>
      <dt>{t("geographicLayer.sourceFile")}</dt>
      <dd>
        {resource.source.fileName} ({formatFileSize(resource.source.byteSize)})
      </dd>
      <dt>{t("geographicLayer.importedAt")}</dt>
      <dd>{formatDateTime(resource.source.importedAt)}</dd>
      <dt>{t("geographicLayer.extent")}</dt>
      <dd>
        {west}, {south} – {east}, {north}
      </dd>
    </dl>
  );
}
