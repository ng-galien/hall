import type { GeographicFeatureNote } from "@hall/api-contract";
import { Button } from "@/components/ui/button";
import { CenterOnFeatureIcon, CloseIcon, FilterIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { InlineResourceContent } from "../resources/InlineResourceContent";
import { geographicPropertyText, orderedGeographicProperties } from "./geographicFeatureCardModel";
import type { GeographicFeatureDescription } from "./useGeographicOverlays";

export interface GeographicFeatureMunicipalState {
  isMunicipal: boolean;
  sourceLabel: string | null;
  sourceImportedAt: string | null;
  /** Present when the commune's list is not empty and the layer identifies cadastre parcels. */
  municipalOnly: boolean | null;
}

/** Detail card of one data-layer feature: properties, extent, centre action, municipal property and note. */
// @implements-requirement HALL-FR-DOC-380
// @implements-requirement HALL-FR-DOC-390
// @implements-requirement HALL-FR-DOC-400
export function GeographicFeatureCard({
  feature,
  layerName,
  note,
  notesLoading,
  canCreateNote,
  creatingNote,
  municipal,
  onCreateNote,
  onMunicipalOnly,
  onCenter,
  onClose,
}: {
  feature: GeographicFeatureDescription;
  layerName: string;
  note: GeographicFeatureNote | null;
  notesLoading: boolean;
  canCreateNote: boolean;
  creatingNote: boolean;
  municipal: GeographicFeatureMunicipalState;
  onCreateNote(): void;
  onMunicipalOnly(enabled: boolean): void;
  onCenter(): void;
  onClose(): void;
}) {
  const { t, formatDate } = useI18n();
  const title =
    feature.featureKey.kind === "cadastreParcel" && feature.label
      ? t("geographicFeature.parcelTitle").replace("{label}", feature.label)
      : (feature.key ?? t("geographicFeature.untitled").replace("{index}", String(feature.position + 1)));
  const coordinate = (value: number) => value.toFixed(6);
  const [west, south, east, north] = feature.extent;
  const properties = orderedGeographicProperties(feature.properties, feature.propertyKeys);
  return (
    <section
      className="geographic-feature-card"
      data-testid="geographic-feature-card"
      data-feature-key={feature.key ?? undefined}
      aria-label={title}
    >
      <header className="geographic-feature-card-header">
        <div className="geographic-feature-card-title">
          <h2 data-testid="geographic-feature-card-title">{title}</h2>
          <span>{layerName}</span>
        </div>
        <button
          type="button"
          className="geographic-feature-card-icon"
          data-testid="geographic-feature-card-center"
          aria-label={t("geographicFeature.center")}
          title={t("geographicFeature.center")}
          onClick={onCenter}
        >
          <CenterOnFeatureIcon />
        </button>
        <button
          type="button"
          className="geographic-feature-card-icon"
          data-testid="geographic-feature-card-close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="geographic-feature-card-body">
        {municipal.isMunicipal ? (
          <p className="geographic-feature-card-municipal" data-testid="geographic-feature-card-municipal">
            {t("geographicFeature.municipal")}
            {municipal.sourceLabel ? (
              <span>
                {t("geographicFeature.municipalSource")
                  .replace("{label}", municipal.sourceLabel)
                  .replace("{date}", municipal.sourceImportedAt ? formatDate(municipal.sourceImportedAt) : "")}
              </span>
            ) : null}
          </p>
        ) : null}
        {municipal.municipalOnly !== null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={municipal.municipalOnly}
            data-testid="geographic-feature-card-municipal-only"
            onClick={() => onMunicipalOnly(!municipal.municipalOnly)}
          >
            <FilterIcon />
            {t(municipal.municipalOnly ? "geographicFeature.showAll" : "geographic.municipalOnly")}
          </Button>
        ) : null}
        <dl className="geographic-feature-card-properties" data-testid="geographic-feature-card-properties">
          {feature.key ? (
            <div className="geographic-feature-card-property">
              <dt>{t("geographicFeature.key")}</dt>
              <dd>{feature.key}</dd>
            </div>
          ) : null}
          {properties.map(([name, value]) => (
            <div key={name} className="geographic-feature-card-property">
              <dt>{name}</dt>
              <dd>{geographicPropertyText(value)}</dd>
            </div>
          ))}
          <div className="geographic-feature-card-property">
            <dt>{t("geographicFeature.extent")}</dt>
            <dd>
              {coordinate(west)}, {coordinate(south)} – {coordinate(east)}, {coordinate(north)}
            </dd>
          </div>
        </dl>
        <div className="geographic-feature-card-note" data-testid="geographic-feature-card-note">
          {feature.featureKey.kind === "none" || !feature.key ? (
            <p className="geographic-feature-card-muted">{t("geographicFeature.noStableKey")}</p>
          ) : notesLoading ? (
            <p className="geographic-feature-card-muted">{t("common.loading")}</p>
          ) : note ? (
            <InlineResourceContent key={note.noteId} resourceId={note.noteId} heading={t("geographicFeature.note")} />
          ) : canCreateNote ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={creatingNote}
              data-testid="geographic-feature-note-create"
              onClick={onCreateNote}
            >
              {t("geographicFeature.addNote")}
            </Button>
          ) : (
            <p className="geographic-feature-card-muted">{t("geographicFeature.noNote")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
