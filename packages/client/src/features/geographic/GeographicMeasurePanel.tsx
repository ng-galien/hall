import { type HallGeoJsonMeasurement, hallGeoJsonCapacity } from "@hall/domain";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type OlMap from "ol/Map";
import type VectorSource from "ol/source/Vector";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaIcon, CopyIcon, DeleteIcon, PointerIcon, RulerIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import {
  type CardinalLetters,
  formatGeographicArea,
  formatGeographicLength,
  formatProjected,
  formatSquareMetres,
  formatWgs84,
  type GeographicMeasure,
  geographicPosition,
  measurementFeature,
  projectedClipboardText,
  savedMeasure,
  wgs84ClipboardText,
} from "./geographicMeasureModel";
import {
  type GeographicMeasureTool,
  useGeographicMeasurements,
  useGeographicPointer,
} from "./useGeographicMeasurements";

interface GeographicMeasurePanelProps {
  map: OlMap | null;
  drawingSource: VectorSource<Feature<Geometry>> | null;
  /** Receives true while a measuring tool takes the map clicks. */
  onMeasuringChange(measuring: boolean): void;
  /** Saved measurements of the map, in saving order. */
  measurements: readonly HallGeoJsonMeasurement[];
  /** True when the map offers the modification of its content: saving, renaming and removing measurements. */
  canSave: boolean;
  /** Adds the measurement to the map; false when the drawings GeoJSON has no room left for it. */
  onAddMeasurement(measurement: HallGeoJsonMeasurement): boolean;
  onRenameMeasurement(id: string, label: string): Promise<boolean>;
  onRemoveMeasurement(id: string): void;
}

type CopyOutcome = { target: string; outcome: "copied" | "failed" };

const COPY_FEEDBACK_MS = 2_000;

function useCardinalLetters(): CardinalLetters {
  const { t } = useI18n();
  return useMemo(
    () => ({
      north: t("geographic.measure.north"),
      south: t("geographic.measure.south"),
      east: t("geographic.measure.east"),
      west: t("geographic.measure.west"),
    }),
    [t],
  );
}

/** Writes to the clipboard and keeps the outcome of the last copy for a short time. */
function useCoordinateCopy() {
  const [copyOutcome, setCopyOutcome] = useState<CopyOutcome | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(async (target: string, text: string) => {
    window.clearTimeout(timer.current);
    let outcome: CopyOutcome["outcome"] = "copied";
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
    } catch {
      outcome = "failed";
    }
    setCopyOutcome({ target, outcome });
    timer.current = window.setTimeout(() => setCopyOutcome(null), COPY_FEEDBACK_MS);
  }, []);
  return { copyOutcome, copy };
}

function MeasureReadout({ measure, testId }: { measure: GeographicMeasure; testId: string }) {
  const { t, formatNumber } = useI18n();
  const cardinals = useCardinalLetters();
  if (measure.kind === "length") {
    return (
      <dl className="geographic-measures-values" data-testid={testId}>
        <dt>{t("geographic.measure.length")}</dt>
        <dd data-testid={`${testId}-length`}>{formatGeographicLength(measure.length, formatNumber)}</dd>
        {measure.segments.length > 1 ? (
          <>
            <dt>{t("geographic.measure.segments")}</dt>
            <dd>{formatNumber(measure.segments.length)}</dd>
          </>
        ) : null}
      </dl>
    );
  }
  if (measure.kind === "area") {
    return (
      <dl className="geographic-measures-values" data-testid={testId}>
        <dt>{t("geographic.measure.area")}</dt>
        <dd data-testid={`${testId}-area`}>
          {formatGeographicArea(measure.area, formatNumber)}
          {measure.area >= 10_000 ? ` (${formatSquareMetres(measure.area, formatNumber)})` : ""}
        </dd>
        <dt>{t("geographic.measure.perimeter")}</dt>
        <dd data-testid={`${testId}-perimeter`}>{formatGeographicLength(measure.perimeter, formatNumber)}</dd>
      </dl>
    );
  }
  const position = geographicPosition(measure.coordinate);
  return (
    <dl className="geographic-measures-values" data-testid={testId}>
      <dt>{t("geographic.measure.wgs84")}</dt>
      <dd>{formatWgs84(position, formatNumber, cardinals)}</dd>
    </dl>
  );
}

/** Readout of one saved measurement: its stored length, or its stored area and perimeter. */
function SavedMeasureValue({ measurement }: { measurement: HallGeoJsonMeasurement }) {
  const { formatNumber } = useI18n();
  const measure = savedMeasure(measurement);
  return (
    <span className="geographic-measurement-value" data-testid={`geographic-measurement-value-${measurement.id}`}>
      {measure.kind === "area"
        ? `${formatGeographicArea(measure.area, formatNumber)} · ${formatGeographicLength(measure.perimeter, formatNumber)}`
        : formatGeographicLength(measure.length, formatNumber)}
    </span>
  );
}

/** Saved measurements: name renamed in place, stored value, removal. */
// @implements-requirement HALL-FR-DOC-460
function SavedMeasurementList({
  measurements,
  canSave,
  editingId,
  onEditingId,
  onRename,
  onRemove,
}: {
  measurements: readonly HallGeoJsonMeasurement[];
  canSave: boolean;
  editingId: string | null;
  onEditingId(id: string | null): void;
  onRename(id: string, label: string): Promise<boolean>;
  onRemove(id: string): void;
}) {
  const { t } = useI18n();
  if (measurements.length === 0) {
    return <p className="geographic-measures-hint">{t("geographic.measure.savedEmpty")}</p>;
  }
  return (
    <ul className="geographic-measurement-list" data-testid="geographic-measurement-list">
      {measurements.map((measurement) => (
        <li
          key={measurement.id}
          className="geographic-measurement"
          data-testid={`geographic-measurement-${measurement.id}`}
          data-measurement-kind={measurement.properties.kind}
        >
          {measurement.properties.kind === "areaMeasurement" ? <AreaIcon /> : <RulerIcon />}
          <InlineRenameField
            value={measurement.properties.label}
            editing={canSave && editingId === measurement.id}
            onEditingChange={(editing) => onEditingId(editing ? measurement.id : null)}
            onCommit={(label) => onRename(measurement.id, label)}
            label={t("geographic.measure.name")}
            className="geographic-measurement-input"
            testId={`geographic-measurement-name-${measurement.id}`}
          >
            <button
              type="button"
              className="geographic-measurement-name"
              data-testid={`geographic-measurement-rename-${measurement.id}`}
              disabled={!canSave}
              onClick={() => onEditingId(measurement.id)}
            >
              {measurement.properties.label}
            </button>
          </InlineRenameField>
          <SavedMeasureValue measurement={measurement} />
          {canSave ? (
            <button
              type="button"
              className="geographic-measurement-remove"
              data-testid={`geographic-measurement-remove-${measurement.id}`}
              aria-label={t("geographic.measure.remove").replace("{name}", measurement.properties.label)}
              title={t("geographic.measure.remove").replace("{name}", measurement.properties.label)}
              onClick={() => onRemove(measurement.id)}
            >
              <DeleteIcon />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Mesures panel: measuring tools, the current measurement and its saving, the measures of a clicked drawing and the
 * saved measurements in the Mesures tab; cursor and view-centre positions in the Coordonnées tab.
 */
// @implements-requirement HALL-FR-DOC-410
export function GeographicMeasurePanel({
  map,
  drawingSource,
  onMeasuringChange,
  measurements,
  canSave,
  onAddMeasurement,
  onRenameMeasurement,
  onRemoveMeasurement,
}: GeographicMeasurePanelProps) {
  const { t, formatNumber } = useI18n();
  const [tool, setTool] = useState<GeographicMeasureTool>("none");
  const [showDrawingMeasures, setShowDrawingMeasures] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [capacityReached, setCapacityReached] = useState(false);
  const { current, finished, discardCurrent, drawingMeasure } = useGeographicMeasurements(
    map,
    drawingSource,
    tool,
    showDrawingMeasures,
  );
  const { cursor, center } = useGeographicPointer(map);
  useEffect(() => {
    if (finished) setCapacityReached(false);
  }, [finished]);

  useEffect(() => {
    onMeasuringChange(tool !== "none");
    return () => onMeasuringChange(false);
  }, [onMeasuringChange, tool]);

  const tools: Array<{ value: GeographicMeasureTool; icon: typeof RulerIcon; label: string }> = [
    { value: "none", icon: PointerIcon, label: t("geographic.measure.toolNone") },
    { value: "length", icon: RulerIcon, label: t("geographic.measure.toolLength") },
    { value: "area", icon: AreaIcon, label: t("geographic.measure.toolArea") },
  ];
  const positions = [
    { key: "cursor", label: t("geographic.measure.cursor"), coordinate: cursor },
    { key: "center", label: t("geographic.measure.center"), coordinate: center },
  ];
  const cardinals = useCardinalLetters();
  const { copyOutcome, copy } = useCoordinateCopy();
  const copyLabel = (target: string) =>
    copyOutcome?.target === target && copyOutcome.outcome === "copied"
      ? t("geographic.measure.copied")
      : t("geographic.measure.copy");
  const saveCurrent = () => {
    if (!finished) return;
    const id = crypto.randomUUID();
    const measurement = measurementFeature(
      id,
      `${t("geographic.measure.defaultName")} ${measurements.length + 1}`,
      finished,
    );
    if (!measurement) return;
    if (!onAddMeasurement(measurement)) {
      setCapacityReached(true);
      return;
    }
    discardCurrent();
    setEditingId(id);
  };

  return (
    <section className="geographic-measures" data-testid="geographic-measures" aria-label={t("geographic.measures")}>
      <Tabs
        className="geographic-measures-tabs"
        defaultValue="measures"
        onValueChange={(value) => {
          if (value === "coordinates") setTool("none");
        }}
      >
        <TabsList className="geographic-measures-tab-list w-full" aria-label={t("geographic.measures")}>
          <TabsTrigger value="measures" data-testid="geographic-measures-tab-measures">
            {t("geographic.measures")}
          </TabsTrigger>
          <TabsTrigger value="coordinates" data-testid="geographic-measures-tab-coordinates">
            {t("geographic.measure.coordinates")}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="measures"
          className="geographic-measures-tab"
          data-testid="geographic-measures-panel-measures"
        >
          <div className="geographic-composition-tools" role="toolbar" aria-label={t("geographic.measure.tools")}>
            {tools.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                className={tool === value ? "geographic-tool-active" : ""}
                data-testid={`geographic-measure-tool-${value}`}
                aria-label={label}
                title={label}
                aria-pressed={tool === value}
                onClick={() => setTool(value)}
              >
                <Icon />
              </button>
            ))}
          </div>
          <div className="geographic-measures-body">
            {tool !== "none" ? (
              current ? (
                <div className="geographic-measures-current">
                  <MeasureReadout measure={current} testId="geographic-measure-current" />
                  {canSave && finished ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="geographic-measure-save"
                      onClick={saveCurrent}
                    >
                      {t("geographic.measure.save")}
                    </Button>
                  ) : null}
                  {canSave && finished && capacityReached ? (
                    <p
                      className="geographic-measures-hint geographic-measures-error"
                      data-testid="geographic-measure-capacity"
                      role="alert"
                    >
                      {t("geographic.measure.capacityReached")
                        .replace("{features}", formatNumber(hallGeoJsonCapacity.features))
                        .replace("{coordinates}", formatNumber(hallGeoJsonCapacity.coordinates))}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="geographic-measures-hint">
                  {t(tool === "length" ? "geographic.measure.hintLength" : "geographic.measure.hintArea")}
                </p>
              )
            ) : drawingMeasure ? (
              <div data-testid="geographic-measure-drawing">
                <p className="geographic-measures-title">{drawingMeasure.label ?? t("geographic.measure.drawing")}</p>
                <MeasureReadout measure={drawingMeasure.measure} testId="geographic-measure-drawing-values" />
              </div>
            ) : (
              <p className="geographic-measures-hint">{t("geographic.measure.hintDrawing")}</p>
            )}
            <label className="geographic-measures-option">
              <input
                type="checkbox"
                data-testid="geographic-measure-show-drawings"
                checked={showDrawingMeasures}
                onChange={(event) => setShowDrawingMeasures(event.target.checked)}
              />
              <span>{t("geographic.measure.showDrawings")}</span>
            </label>
            <p className="geographic-measures-title">{t("geographic.measure.saved")}</p>
            <SavedMeasurementList
              measurements={measurements}
              canSave={canSave}
              editingId={editingId}
              onEditingId={setEditingId}
              onRename={onRenameMeasurement}
              onRemove={onRemoveMeasurement}
            />
          </div>
        </TabsContent>
        <TabsContent
          value="coordinates"
          className="geographic-measures-tab"
          data-testid="geographic-measures-panel-coordinates"
        >
          <div className="geographic-measures-body">
            {positions.map(({ key, label, coordinate }) => {
              const position = coordinate ? geographicPosition(coordinate) : null;
              return (
                <div key={key} className="geographic-measures-position" data-testid={`geographic-measure-${key}`}>
                  <p className="geographic-measures-title">{label}</p>
                  {position ? (
                    <dl className="geographic-measures-values">
                      <dt>{t("geographic.measure.wgs84")}</dt>
                      <dd>
                        <span data-testid={`geographic-measure-${key}-wgs84`}>
                          {formatWgs84(position, formatNumber, cardinals)}
                        </span>
                        <button
                          type="button"
                          data-testid={`geographic-measure-${key}-copy-wgs84`}
                          data-copy-outcome={copyOutcome?.target === `${key}-wgs84` ? copyOutcome.outcome : undefined}
                          aria-label={copyLabel(`${key}-wgs84`)}
                          title={copyLabel(`${key}-wgs84`)}
                          onClick={() => void copy(`${key}-wgs84`, wgs84ClipboardText(position))}
                        >
                          <CopyIcon />
                        </button>
                      </dd>
                      <dt>{t("geographic.measure.projected")}</dt>
                      <dd>
                        <span data-testid={`geographic-measure-${key}-projected`}>
                          {formatProjected(position, formatNumber)}
                        </span>
                        <button
                          type="button"
                          data-testid={`geographic-measure-${key}-copy-projected`}
                          data-copy-outcome={
                            copyOutcome?.target === `${key}-projected` ? copyOutcome.outcome : undefined
                          }
                          aria-label={copyLabel(`${key}-projected`)}
                          title={copyLabel(`${key}-projected`)}
                          onClick={() => void copy(`${key}-projected`, projectedClipboardText(position))}
                        >
                          <CopyIcon />
                        </button>
                      </dd>
                    </dl>
                  ) : (
                    <p className="geographic-measures-hint">{t("geographic.measure.cursorOutside")}</p>
                  )}
                </div>
              );
            })}
            <p
              className={
                copyOutcome?.outcome === "failed"
                  ? "geographic-measures-hint geographic-measures-error"
                  : "geographic-measures-hint"
              }
              data-testid="geographic-measure-copy-status"
              aria-live="polite"
            >
              {copyOutcome
                ? t(copyOutcome.outcome === "copied" ? "geographic.measure.copied" : "geographic.measure.copyFailed")
                : ""}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
