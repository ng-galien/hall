import type { ResourceDetail, SirenEntity } from "@hall/api-contract";
import {
  type GeographicLayer,
  type GeographicLayerId,
  type GeographicView,
  type HallGeoJsonMeasurement,
  hallGeoJsonDrawings,
  hallGeoJsonMeasurements,
  hallGeoJsonWithinCapacity,
} from "@hall/domain";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "ol/ol.css";
import { Button } from "@/components/ui/button";
import type { ColorPickerPreset } from "@/components/ui/color-picker";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import { ApiError, type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { photoFile } from "../documents/photoFile";
import { useEditorDocumentUpload } from "../documents/useEditorDocumentUpload";
import { GeographicCompositionEditor } from "./GeographicCompositionEditor";
import { DrawingActionsMenu, DrawingColorControl } from "./GeographicDrawingControls";
import { GeographicDrawnElementCard, useGeographicDrawnElementNotes } from "./GeographicDrawnElementCard";
import { GeographicFeatureCard } from "./GeographicFeatureCard";
import { GeographicLayerControls } from "./GeographicLayerControls";
import { GeographicLayerUploadDialog } from "./GeographicLayerUploadDialog";
import { GeographicLegend } from "./GeographicLegend";
import { GeographicMeasurePanel, MeasureReadout } from "./GeographicMeasurePanel";
import type { GeographicPointerState, GeographicPointerTarget } from "./geographicCursorPolicy";
import { municipalFilterLayerIds } from "./geographicFeatureCardModel";
import {
  geographicDrawingName,
  geographicFeatureKindLabels,
  geographicFeatureKindPolicy,
} from "./geographicFeatureKindPolicy";
import {
  canImportGeographicLayer,
  canLinkGeographicLayer,
  type MunicipalPropertyState,
  setGeographicOverlayVisibility,
} from "./geographicLayersApi";
import {
  geographicDataSignature,
  normalizeGeographicData,
  reorderGeographicLayers,
  setGeographicLayerVisibility,
} from "./geographicMapModel";
import { measureGeometry } from "./geographicMeasureModel";
import { MunicipalPropertyImportDialog } from "./MunicipalPropertyImportDialog";
import { useGeographicCompositionLayout } from "./useGeographicCompositionLayout";
import {
  useGeographicFeatureNote,
  useGeographicFeaturePicking,
  useGeographicFeatureState,
} from "./useGeographicFeatureCard";
import { useGeographicMapCursor } from "./useGeographicMapCursor";
import {
  type GeographicDrawTool,
  type GeographicPanelMode,
  type GeographicWorkspaceMode,
  useGeographicMapRuntime,
} from "./useGeographicMapRuntime";
import { useGeographicDrawingMeasureLayer, useGeographicSavedMeasurementLayer } from "./useGeographicMeasurements";
import { useGeographicOverlays } from "./useGeographicOverlays";

const GEOGRAPHIC_SAVE_DEBOUNCE_MS = 1_500;

type GeographicResource = Extract<ResourceDetail, { kind: "geographic" }>;
type GeographicResourceData = GeographicResource["document"];

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function viewCenter(view: GeographicView): [number, number] {
  return view.kind === "center"
    ? view.center
    : [(view.extent[0] + view.extent[2]) / 2, (view.extent[1] + view.extent[3]) / 2];
}

function sameGeographicView(left: GeographicView, right: GeographicView): boolean {
  const [leftLon, leftLat] = viewCenter(left);
  const [rightLon, rightLat] = viewCenter(right);
  return (
    Math.abs(leftLon - rightLon) < 1e-7 &&
    Math.abs(leftLat - rightLat) < 1e-7 &&
    Math.abs(left.zoom - right.zoom) < 1e-3
  );
}

/** Source of the commune's list that brought a parcel. */
function parcelSource(municipal: MunicipalPropertyState | null, parcelId: string | null) {
  const sourceId = parcelId ? municipal?.data.parcelSourceIds[parcelId] : undefined;
  const source = municipal?.data.sources.find(({ id }) => id === sourceId);
  return { sourceLabel: source?.label ?? null, sourceImportedAt: source?.importedAt ?? null };
}

// @implements-requirement HALL-FR-DOC-340
// @implements-requirement HALL-FR-DOC-430
// biome-ignore-start lint/correctness/useExhaustiveDependencies: opening another map resets its temporary panel state.
// @implements-requirement HALL-FR-DOC-430
export function GeographicResourceMap({
  resource,
  representation,
  data,
  canUpdate,
  autosaveEnabled = true,
  onError,
  onRegisterFlush,
  onViewChange,
  initialView,
  embedded = false,
}: {
  resource: GeographicResource;
  representation?: SirenEntity | null;
  data: GeographicResourceData;
  canUpdate: boolean;
  autosaveEnabled?: boolean;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
  /** Receives the displayed view after each move; the displayed view is saved only by the explicit framing action. */
  onViewChange?(view: GeographicView): void;
  /** View displayed when the map is created; the saved framing stays `data.view`. */
  initialView?: GeographicView;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const { setStatus: setSaveStatus } = useResourceSaveStatus(resource.id);
  const documentUpload = useEditorDocumentUpload(resource.path);
  const uploadDrawingPhoto = useMemo(
    () =>
      documentUpload
        ? (photo: File) =>
            documentUpload.upload(
              photoFile(photo, (date) => t("workspace.photoName", { date })),
              {
                numberTakenName: true,
              },
            )
        : undefined,
    [documentUpload, t],
  );
  const normalizedData = useMemo(() => normalizeGeographicData(data), [data]);
  const latestDraftRef = useRef<GeographicResourceData>(normalizedData);
  const latestVersionRef = useRef(resource.version);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const conflictRef = useRef(false);
  const autosaveEnabledRef = useRef(autosaveEnabled);
  const savedSignatureRef = useRef(geographicDataSignature(normalizedData));
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const [draft, setDraft] = useState<GeographicResourceData>(normalizedData);
  const [savedSignature, setSavedSignature] = useState(() => geographicDataSignature(normalizedData));
  const [workspaceMode, setWorkspaceMode] = useState<GeographicWorkspaceMode>("draw");
  const [drawTool, setDrawTool] = useState<GeographicDrawTool>("select");
  const [hallLayerVisible, setHallLayerVisible] = useState(true);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [renameArmedFeatureId, setRenameArmedFeatureId] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const mapOverlayRef = useRef<HTMLDivElement | null>(null);
  const [mapOverlayHeight, setMapOverlayHeight] = useState(0);
  useEffect(() => {
    const overlay = mapOverlayRef.current;
    if (!overlay) return;
    const updateHeight = () => setMapOverlayHeight(overlay.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, []);
  const mapStageStyle = { "--geographic-overlay-height": `${mapOverlayHeight}px` } as CSSProperties;
  const [notePreparationRetry, setNotePreparationRetry] = useState(0);
  const [displayedView, setDisplayedView] = useState<GeographicView>(initialView ?? normalizedData.view);
  const displayedData = useMemo(
    () => ({ ...data, hallLayer: draft.hallLayer, ...(initialView ? { view: initialView } : {}) }),
    [data, draft.hallLayer, initialView],
  );
  const [measuring, setMeasuring] = useState(false);
  const [measuredDrawingIds, setMeasuredDrawingIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setWorkspaceMode("draw");
    setDrawTool("select");
    setMeasuredDrawingIds(new Set());
  }, [resource.id]);

  const draftSignature = useMemo(() => geographicDataSignature(draft), [draft]);
  const drawings = useMemo(() => hallGeoJsonDrawings(draft.hallLayer), [draft.hallLayer]);
  const measurements = useMemo(() => hallGeoJsonMeasurements(draft.hallLayer), [draft.hallLayer]);
  const dirty = draftSignature !== savedSignature;
  autosaveEnabledRef.current = autosaveEnabled;

  const updateDraft = useCallback((update: (current: GeographicResourceData) => GeographicResourceData) => {
    const next = update(latestDraftRef.current);
    latestDraftRef.current = next;
    setDraft(next);
    return next;
  }, []);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    latestVersionRef.current = resource.version;
  }, [resource.version]);
  const featureKindLabels = useMemo(() => geographicFeatureKindLabels(t), [t]);
  const onSelection = useCallback(() => {
    setEditingFeatureId(null);
    setRenameArmedFeatureId(null);
  }, []);
  const onFeatureCreated = useCallback((featureId: string) => {
    setEditingFeatureId(featureId);
    setRenameArmedFeatureId(null);
  }, []);
  const changeDisplayedView = useCallback(
    (view: GeographicView) => {
      setDisplayedView(view);
      onViewChange?.(view);
    },
    [onViewChange],
  );
  const mapRuntime = useGeographicMapRuntime({
    resourceId: resource.id,
    data: displayedData,
    requestedView: initialView,
    draftLayers: draft.layers,
    canUpdate,
    embedded,
    workspaceMode,
    drawTool,
    hallLayerVisible,
    featureKindLabels,
    updateDraft,
    onDrawTool: setDrawTool,
    onSelection,
    onFeatureCreated,
    onViewChange: changeDisplayedView,
  });
  const compositionLayout = useGeographicCompositionLayout(
    resource.id,
    workspaceMode === "draw" || workspaceMode === "measure" ? workspaceMode : null,
  );
  const [overlays, setOverlays] = useState(resource.overlays);
  const [layerUploadOpen, setLayerUploadOpen] = useState(false);
  useEffect(() => setOverlays(resource.overlays), [resource.overlays]);
  const storedRepresentation = useWorkspaceResourcesStore((state) => state.representations[resource.id] ?? null);
  const mapRepresentation = representation ?? storedRepresentation;
  const canChangeOverlays = canUpdate && canLinkGeographicLayer(mapRepresentation);
  const canAddLayer = canUpdate && canImportGeographicLayer(mapRepresentation);
  const featureState = useGeographicFeatureState(resource.id);
  const overlayRuntime = useGeographicOverlays(mapRuntime.map, overlays, featureState.styleInputs);
  const overlayStatuses = overlayRuntime.statuses;
  const [municipalImportOpen, setMunicipalImportOpen] = useState(false);
  const { setSelection } = featureState;
  useGeographicFeaturePicking(
    mapRuntime.map,
    (workspaceMode !== "draw" || !canUpdate) && !embedded && !measuring,
    overlayRuntime.pickFeature,
    featureState.selection,
    setSelection,
  );
  const selectedFeature = featureState.selection ? overlayRuntime.describeFeature(featureState.selection) : null;
  const pointerState: GeographicPointerState =
    workspaceMode === "draw" && canUpdate
      ? drawTool !== "select"
        ? "draw"
        : mapRuntime.modifyingFeatureId
          ? "modify"
          : "select"
      : measuring
        ? "measure"
        : "consult";
  const { drawingIdAt, modifyingFeatureId } = mapRuntime;
  const { pickFeature } = overlayRuntime;
  const pointerTargetAt = useCallback(
    (pixel: number[]): GeographicPointerTarget => {
      const drawingId = drawingIdAt(pixel);
      if (drawingId !== null) return drawingId === modifyingFeatureId ? "modifiedShape" : "drawing";
      return pointerState === "consult" && pickFeature(pixel) ? "layerFeature" : "none";
    },
    [drawingIdAt, modifyingFeatureId, pickFeature, pointerState],
  );
  useGeographicMapCursor(mapRuntime.map, pointerState, pointerTargetAt);
  const readerInspection = (embedded || workspaceMode !== "draw" || !canUpdate) && !measuring;
  const [inspectedDrawingId, setInspectedDrawingId] = useState<string | null>(null);
  const olMap = mapRuntime.map;
  const measureClickedDrawing = workspaceMode === "measure";
  const inspectionCallbacks = useRef({ drawingIdAt, setSelection, measureClickedDrawing });
  inspectionCallbacks.current = { drawingIdAt, setSelection, measureClickedDrawing };
  useEffect(() => {
    setInspectedDrawingId(null);
    if (!olMap || !readerInspection) return;
    const inspect = (event: { pixel: number[] }) => {
      const drawingId = inspectionCallbacks.current.drawingIdAt(event.pixel);
      setInspectedDrawingId(drawingId);
      if (!drawingId) return;
      inspectionCallbacks.current.setSelection(null);
      if (inspectionCallbacks.current.measureClickedDrawing)
        setMeasuredDrawingIds((previous) => (previous.has(drawingId) ? previous : new Set(previous).add(drawingId)));
    };
    olMap.on("singleclick", inspect);
    return () => olMap.un("singleclick", inspect);
  }, [olMap, readerInspection]);
  const inspectedDrawing = readerInspection
    ? (drawings.find(({ id }) => String(id) === inspectedDrawingId) ?? null)
    : null;
  const drawnElementNotes = useGeographicDrawnElementNotes(
    (workspaceMode === "draw" && canUpdate) || readerInspection ? mapRepresentation : null,
    onError,
  );
  const selectedDrawnElement =
    workspaceMode === "draw" && canUpdate
      ? (drawings.find(({ id }) => id === mapRuntime.selectedFeatureId) ?? null)
      : null;
  useGeographicSavedMeasurementLayer(embedded ? null : mapRuntime.map, measurements);
  useGeographicDrawingMeasureLayer(mapRuntime.map, mapRuntime.drawingSource, measuredDrawingIds, hallLayerVisible);
  const selectedNote = useGeographicFeatureNote(selectedFeature, onError);
  const municipalFilterLayers = municipalFilterLayerIds(
    overlayRuntime.featureKeys,
    featureState.municipalParcelIds.size,
  );
  const municipalRepresentation = featureState.municipal?.representation ?? null;
  const municipalImport = municipalRepresentation?.actions?.some(
    ({ name }) => name === "resource.import-municipal-property",
  )
    ? municipalRepresentation
    : null;
  const changeOverlayVisibility = (layerId: string, visible: boolean) => {
    if (!mapRepresentation) return;
    const previous = overlays;
    setOverlays((current) =>
      current.map((overlay) => (overlay.layerId === layerId ? { ...overlay, visible } : overlay)),
    );
    setGeographicOverlayVisibility(mapRepresentation, layerId, visible).then(setOverlays, (failure: unknown) => {
      setOverlays(previous);
      onError(apiErrorCode(failure));
    });
  };

  const save = useCallback(() => {
    if (!canUpdate) return Promise.resolve(true);
    if (conflictRef.current) return Promise.resolve(false);
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = async () => {
      while (true) {
        const payload = latestDraftRef.current;
        const signature = JSON.stringify(payload);
        if (signature === savedSignatureRef.current) {
          setSaveStatus("saved");
          return true;
        }
        onError(null);
        setSaveStatus("saving");
        try {
          const updated = await useWorkspaceResourcesStore.getState().updateContent(resource.id, {
            kind: "geographic",
            document: payload,
            expectedVersion: latestVersionRef.current,
          });
          if (updated?.kind !== "geographic") {
            throw new ApiError(useWorkspaceResourcesStore.getState().error ?? "request_failed", 0);
          }
          latestVersionRef.current = updated.version;
          savedSignatureRef.current = signature;
          setSavedSignature(signature);
        } catch (failure) {
          const code = apiErrorCode(failure);
          if ((failure instanceof ApiError && failure.status === 409) || code === "conflict") {
            const latest = await useWorkspaceResourcesStore.getState().open(resource.id);
            if (latest?.data.kind === "geographic") latestVersionRef.current = latest.data.version;
            conflictRef.current = true;
            setConflict(true);
            onError(null);
          } else {
            onError(code);
          }
          setSaveStatus("error");
          return false;
        }
      }
    };
    const pending = run().finally(() => {
      if (savePromiseRef.current === pending) savePromiseRef.current = null;
    });
    savePromiseRef.current = pending;
    return pending;
  }, [canUpdate, onError, resource.id, setSaveStatus]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    onRegisterFlush?.(() => (autosaveEnabledRef.current ? save() : Promise.resolve(true)));
    return () => onRegisterFlush?.(null);
  }, [onRegisterFlush, save]);

  useEffect(() => {
    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }
    if (!dirty || !canUpdate || conflict) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), GEOGRAPHIC_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, canUpdate, conflict, dirty, save, setSaveStatus]);

  useEffect(
    () => () => {
      if (
        autosaveEnabledRef.current &&
        !conflictRef.current &&
        JSON.stringify(latestDraftRef.current) !== savedSignatureRef.current
      ) {
        void saveRef.current?.();
      }
    },
    [],
  );

  const updateLayers = (layers: GeographicLayer[]) => updateDraft((current) => ({ ...current, layers }));
  const setLayerVisibility = (id: GeographicLayerId, visible: boolean) =>
    updateLayers(setGeographicLayerVisibility(draft.layers, id, visible));
  const moveLayer = (sourceId: GeographicLayerId, targetId: GeographicLayerId) =>
    updateLayers(reorderGeographicLayers(draft.layers, sourceId, targetId));
  const renameFeature = async (id: string, label: string) => {
    if (!mapRuntime.renameFeature(id, label)) return false;
    return save();
  };
  const setMeasurements = (change: (current: HallGeoJsonMeasurement[]) => HallGeoJsonMeasurement[]) =>
    updateDraft((current) => ({
      ...current,
      hallLayer: {
        ...current.hallLayer,
        type: "FeatureCollection",
        features: [...hallGeoJsonDrawings(current.hallLayer), ...change(hallGeoJsonMeasurements(current.hallLayer))],
      },
    }));
  const addMeasurement = (measurement: HallGeoJsonMeasurement): boolean => {
    if (!hallGeoJsonWithinCapacity([...latestDraftRef.current.hallLayer.features, measurement])) return false;
    setMeasurements((current) => [...current, measurement]);
    return true;
  };
  const renameMeasurement = (id: string, label: string) => {
    setMeasurements((current) =>
      current.map((measurement) =>
        measurement.id === id
          ? ({ ...measurement, properties: { ...measurement.properties, label } } as HallGeoJsonMeasurement)
          : measurement,
      ),
    );
    return save();
  };
  const removeMeasurement = (id: string) =>
    setMeasurements((current) => current.filter((measurement) => measurement.id !== id));
  const saveDisplayedView = () => {
    updateDraft((current) => ({ ...current, view: displayedView }));
    void save();
  };
  const retryConflict = () => {
    conflictRef.current = false;
    setConflict(false);
    void save().then((saved) => {
      if (saved) setNotePreparationRetry((attempt) => attempt + 1);
    });
  };
  const toggleWorkspaceMode = (mode: GeographicPanelMode) => {
    setWorkspaceMode((current) => (current === mode ? "map" : mode));
    setDrawTool("select");
  };

  const selectFeature = (id: string) => {
    if (!canUpdate) {
      setInspectedDrawingId(id);
      return;
    }
    setDrawTool("select");
    mapRuntime.selectFeature(id);
    setEditingFeatureId(null);
    setRenameArmedFeatureId(null);
  };
  const featureColorPresets: ColorPickerPreset[] = [
    { value: cssToken("--hall-color-brand"), label: t("geographic.color.blue") },
    { value: cssToken("--hall-color-focus"), label: t("geographic.color.lightBlue") },
    { value: cssToken("--hall-color-success"), label: t("geographic.color.green") },
    { value: cssToken("--hall-color-warning"), label: t("geographic.color.orange") },
    { value: cssToken("--hall-color-danger"), label: t("geographic.color.red") },
    { value: cssToken("--hall-color-seal"), label: t("geographic.color.burgundy") },
    { value: cssToken("--hall-color-text-muted"), label: t("geographic.color.gray") },
    { value: cssToken("--hall-color-text"), label: t("geographic.color.black") },
  ];
  const knownColors = new Set(featureColorPresets.map((preset) => preset.value.toLowerCase()));
  const mapColorPresets: ColorPickerPreset[] = [];
  for (const drawing of drawings) {
    const color = geographicFeatureKindPolicy[drawing.properties.kind].color(drawing.properties.style);
    if (!color || knownColors.has(color.toLowerCase())) continue;
    knownColors.add(color.toLowerCase());
    mapColorPresets.push({ value: color, label: t("geographic.color.used") });
  }
  const drawingColorPresets = [...featureColorPresets, ...mapColorPresets];
  const legendColorPresets: ColorPickerPreset[] = (draft.hallLayer.legend ?? []).map(({ color, label }) => ({
    value: color,
    label,
  }));

  const setDrawingMeasured = (id: string, visible: boolean) =>
    setMeasuredDrawingIds((previous) => {
      const next = new Set(previous);
      if (visible) next.add(id);
      else next.delete(id);
      return next;
    });
  const drawingName = (drawing: (typeof drawings)[number]) =>
    geographicDrawingName(drawing, drawings.indexOf(drawing), featureKindLabels);
  const drawingKindIcon = (drawing: (typeof drawings)[number]) => {
    const Icon = geographicFeatureKindPolicy[drawing.properties.kind].Icon;
    return <Icon />;
  };
  const drawingActions = (drawing: (typeof drawings)[number]) => {
    const id = String(drawing.id);
    const name = drawingName(drawing);
    const modifying = mapRuntime.modifyingFeatureId === id;
    return (
      <>
        <DrawingColorControl
          name={name}
          color={geographicFeatureKindPolicy[drawing.properties.kind].color(drawing.properties.style)}
          presets={drawingColorPresets}
          legendPresets={legendColorPresets}
          className="geographic-feature-card-color"
          onChange={(color) => mapRuntime.setFeatureColor(id, color)}
        />
        <DrawingActionsMenu
          name={name}
          className="geographic-feature-card-icon"
          testId={(part) => `geographic-drawn-element-card-${part}`}
          kind={drawing.properties.kind}
          visible={drawing.properties.visible !== false}
          onVisibility={(visible) => mapRuntime.setFeatureVisibility(id, visible)}
          modifying={modifying}
          onToggleModifying={() => {
            if (modifying) return mapRuntime.stopModifying();
            // The shape is modified in Éléments: from Mesures the action opens Éléments on this drawing.
            if (workspaceMode !== "draw") {
              setInspectedDrawingId(null);
              setWorkspaceMode("draw");
              setDrawTool("select");
            }
            mapRuntime.startModifying(id);
          }}
          measuresActive={measuredDrawingIds.has(id)}
          onMeasures={(active) => setDrawingMeasured(id, active)}
          arrows={drawing.properties.kind === "line" ? drawing.properties.style.arrows : undefined}
          onArrows={(arrows) => mapRuntime.setFeatureArrows(id, arrows)}
          onDelete={() => mapRuntime.deleteSelected(id)}
        />
      </>
    );
  };

  const drawingCard = (
    drawing: (typeof drawings)[number],
    { key, editable, onClose }: { key: string; editable: boolean; onClose(): void },
  ) => {
    const id = String(drawing.id);
    const geometry = mapRuntime.drawingSource?.getFeatureById(id)?.getGeometry();
    const measure = geometry ? measureGeometry(geometry) : null;
    return (
      <GeographicDrawnElementCard
        key={key}
        readOnly={!editable}
        label={drawingName(drawing)}
        kindLabel={featureKindLabels[drawing.properties.kind]}
        kindIcon={drawingKindIcon(drawing)}
        actions={editable ? drawingActions(drawing) : undefined}
        hidden={drawing.properties.visible === false}
        measures={
          measure && measure.kind !== "position" && (!editable || measuredDrawingIds.has(id)) ? (
            <MeasureReadout measure={measure} testId="geographic-drawn-element-card-measures" />
          ) : null
        }
        note={drawnElementNotes.notes?.find((note) => note.key === drawing.id) ?? null}
        loading={drawnElementNotes.notes === null}
        canCreateNote={editable && drawnElementNotes.canCreate && !conflict}
        creatingNote={drawnElementNotes.creating}
        mapElement={mapRuntime.mapElementRef.current}
        modifying={mapRuntime.modifyingFeatureId === id}
        onStopModifying={mapRuntime.stopModifying}
        onCreateNote={() => drawnElementNotes.create(id, save)}
        onCenter={() => mapRuntime.fitFeature(id)}
        onClose={onClose}
        uploadPhoto={editable ? uploadDrawingPhoto : undefined}
      />
    );
  };
  const inspectedDrawingCard = inspectedDrawing
    ? drawingCard(inspectedDrawing, {
        key: String(inspectedDrawing.id),
        editable: canUpdate && !embedded,
        onClose: () => setInspectedDrawingId(null),
      })
    : null;

  if (embedded) {
    return (
      <div className="geographic-resource" data-testid="geographic-resource-map" data-geographic-mode="embedded">
        <div className="geographic-map-stage" style={mapStageStyle}>
          <div ref={mapRuntime.mapElementRef} className="geographic-map" />
          {inspectedDrawingCard}
          <div ref={mapOverlayRef} className="geographic-map-overlay" data-testid="geographic-map-overlay">
            <GeographicLegend entries={draft.hallLayer.legend ?? []} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="geographic-resource" data-testid="geographic-resource-map">
      <div className="geographic-map-stage" style={mapStageStyle}>
        <div ref={mapRuntime.mapElementRef} className="geographic-map" />
        <GeographicLayerControls
          workspaceMode={workspaceMode}
          canUpdate={canUpdate}
          hallLayerVisible={hallLayerVisible}
          layers={draft.layers}
          onToggleMode={toggleWorkspaceMode}
          onHallLayerVisible={setHallLayerVisible}
          onLayerVisibility={setLayerVisibility}
          onLayerOpacity={(id, opacity) =>
            updateLayers(draft.layers.map((layer) => (layer.id === id ? { ...layer, opacity } : layer)))
          }
          onMoveLayer={moveLayer}
          onZoom={mapRuntime.changeZoom}
          canFit={drawings.length > 0}
          onFit={mapRuntime.fitComposition}
          overlays={overlays}
          overlayStatuses={overlayStatuses}
          canChangeOverlays={canChangeOverlays}
          onOverlayVisibility={changeOverlayVisibility}
          onAddLayer={canAddLayer ? () => setLayerUploadOpen(true) : undefined}
          municipalFilterLayerIds={municipalFilterLayers}
          municipalOnlyLayerIds={featureState.municipalOnlyLayerIds}
          onMunicipalOnly={featureState.setMunicipalOnly}
          onImportMunicipalProperty={canUpdate && municipalImport ? () => setMunicipalImportOpen(true) : undefined}
        />
        {workspaceMode === "measure" ? (
          <GeographicMeasurePanel
            panelRef={compositionLayout.panelRef}
            style={compositionLayout.style}
            onPointerDown={compositionLayout.startDrag}
            onPointerMove={compositionLayout.move}
            onPointerUp={compositionLayout.stopDrag}
            map={mapRuntime.map}
            drawingSource={mapRuntime.drawingSource}
            onMeasuringChange={setMeasuring}
            measurements={measurements}
            canSave={canUpdate}
            onAddMeasurement={addMeasurement}
            onRenameMeasurement={renameMeasurement}
            onRemoveMeasurement={removeMeasurement}
          />
        ) : null}
        {workspaceMode === "draw" ? (
          <GeographicCompositionEditor
            readOnly={!canUpdate}
            panelRef={compositionLayout.panelRef}
            style={compositionLayout.style}
            drawTool={drawTool}
            features={drawings}
            selectedFeatureId={mapRuntime.selectedFeatureId}
            modifyingFeatureId={mapRuntime.modifyingFeatureId}
            editingFeatureId={editingFeatureId}
            renameArmedFeatureId={renameArmedFeatureId}
            featureKindLabels={featureKindLabels}
            colorPresets={drawingColorPresets}
            legendColorPresets={legendColorPresets}
            onDrawTool={setDrawTool}
            onSelect={selectFeature}
            onEditingFeature={setEditingFeatureId}
            onRenameArmedFeature={setRenameArmedFeatureId}
            onRename={renameFeature}
            onVisibility={mapRuntime.setFeatureVisibility}
            onFitFeature={mapRuntime.fitFeature}
            onColor={mapRuntime.setFeatureColor}
            onArrows={mapRuntime.setFeatureArrows}
            measuredDrawingIds={measuredDrawingIds}
            onDrawingMeasures={setDrawingMeasured}
            onDelete={mapRuntime.deleteSelected}
            onMoveFeature={mapRuntime.moveFeature}
            onToggleModifying={(id) =>
              mapRuntime.modifyingFeatureId === id ? mapRuntime.stopModifying() : mapRuntime.startModifying(id)
            }
            legend={draft.hallLayer.legend ?? []}
            onLegend={(legend) =>
              updateDraft((current) => ({ ...current, hallLayer: { ...current.hallLayer, legend } }))
            }
            onPointerDown={compositionLayout.startDrag}
            onPointerMove={compositionLayout.move}
            onPointerUp={compositionLayout.stopDrag}
          />
        ) : null}
        {inspectedDrawingCard}
        {selectedDrawnElement
          ? drawingCard(selectedDrawnElement, {
              key: `${selectedDrawnElement.id}:${notePreparationRetry}`,
              editable: true,
              onClose: mapRuntime.clearSelection,
            })
          : null}
        {selectedFeature ? (
          <GeographicFeatureCard
            key={`${selectedFeature.layerId}:${selectedFeature.position}`}
            feature={selectedFeature}
            layerName={overlays.find((overlay) => overlay.layerId === selectedFeature.layerId)?.name ?? ""}
            note={selectedNote.note}
            notesLoading={selectedNote.loading}
            canCreateNote={selectedNote.canCreate}
            creatingNote={selectedNote.creating}
            municipal={{
              isMunicipal:
                selectedFeature.featureKey.kind === "cadastreParcel" &&
                selectedFeature.key !== null &&
                featureState.municipalParcelIds.has(selectedFeature.key),
              ...parcelSource(featureState.municipal, selectedFeature.key),
              municipalOnly: municipalFilterLayers.has(selectedFeature.layerId)
                ? featureState.municipalOnlyLayerIds.has(selectedFeature.layerId)
                : null,
            }}
            onCreateNote={() => selectedNote.create()}
            onMunicipalOnly={(enabled) => featureState.setMunicipalOnly(selectedFeature.layerId, enabled)}
            onCenter={() => overlayRuntime.fitFeature(selectedFeature)}
            onClose={() => setSelection(null)}
          />
        ) : null}
        {municipalImportOpen && municipalImport ? (
          <MunicipalPropertyImportDialog
            property={municipalImport}
            onImported={featureState.setMunicipal}
            onClose={() => setMunicipalImportOpen(false)}
          />
        ) : null}
        {layerUploadOpen && mapRepresentation ? (
          <GeographicLayerUploadDialog
            map={mapRepresentation}
            mapReference={resource.id}
            onImported={setOverlays}
            onClose={() => setLayerUploadOpen(false)}
          />
        ) : null}
        {conflict ? (
          <div className="geographic-conflict" role="alert">
            <span>{t("geographic.conflict")}</span>
            <Button type="button" variant="outline" data-testid="geographic-conflict-retry" onClick={retryConflict}>
              {t("geographic.retryConflict")}
            </Button>
          </div>
        ) : null}
        <div ref={mapOverlayRef} className="geographic-map-overlay" data-testid="geographic-map-overlay">
          <GeographicLegend
            entries={hallLayerVisible ? (draft.hallLayer.legend ?? []) : []}
            actions={
              canUpdate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="geographic-save-view"
                  data-testid="geographic-save-view"
                  disabled={conflict || sameGeographicView(displayedView, draft.view)}
                  onClick={saveDisplayedView}
                >
                  {t("geographic.saveView")}
                </Button>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: opening another map resets its temporary panel state.
