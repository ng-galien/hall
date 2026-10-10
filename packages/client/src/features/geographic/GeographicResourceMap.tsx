import type { ResourceDetail } from "@hall/api-contract";
import type { GeographicLayer, GeographicLayerId, GeographicView } from "@hall/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "ol/ol.css";
import { Button } from "@/components/ui/button";
import type { ColorPickerPreset } from "@/components/ui/color-picker";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import { ApiError, type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { GeographicCompositionEditor } from "./GeographicCompositionEditor";
import { GeographicLayerControls } from "./GeographicLayerControls";
import { GeographicLayerUploadDialog } from "./GeographicLayerUploadDialog";
import { geographicFeatureKindLabels } from "./geographicFeatureKindPolicy";
import {
  canImportGeographicLayer,
  canLinkGeographicLayer,
  setGeographicOverlayVisibility,
} from "./geographicLayersApi";
import {
  geographicDataSignature,
  normalizeGeographicData,
  reorderGeographicLayers,
  setGeographicLayerVisibility,
} from "./geographicMapModel";
import { useGeographicCompositionLayout } from "./useGeographicCompositionLayout";
import {
  type GeographicDrawTool,
  type GeographicWorkspaceMode,
  useGeographicMapRuntime,
} from "./useGeographicMapRuntime";
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

// @implements-requirement HALL-FR-DOC-340
export function GeographicResourceMap({
  resource,
  data,
  canUpdate,
  autosaveEnabled = true,
  onError,
  onRegisterFlush,
  onViewChange,
  embedded = false,
}: {
  resource: GeographicResource;
  data: GeographicResourceData;
  canUpdate: boolean;
  autosaveEnabled?: boolean;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
  /** Receives the displayed view after each move; the displayed view is saved only by the explicit framing action. */
  onViewChange?(view: GeographicView): void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const { setStatus: setSaveStatus } = useResourceSaveStatus(resource.id);
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
  const [workspaceMode, setWorkspaceMode] = useState<GeographicWorkspaceMode>("map");
  const [drawTool, setDrawTool] = useState<GeographicDrawTool>("select");
  const [hallLayerVisible, setHallLayerVisible] = useState(true);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [renameArmedFeatureId, setRenameArmedFeatureId] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [displayedView, setDisplayedView] = useState<GeographicView>(normalizedData.view);

  const draftSignature = useMemo(() => geographicDataSignature(draft), [draft]);
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
    data,
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
  const compositionLayout = useGeographicCompositionLayout(resource.id, workspaceMode === "draw");
  const [overlays, setOverlays] = useState(resource.overlays);
  const [layerUploadOpen, setLayerUploadOpen] = useState(false);
  useEffect(() => setOverlays(resource.overlays), [resource.overlays]);
  const mapRepresentation = useWorkspaceResourcesStore((state) => state.representations[resource.id] ?? null);
  const canChangeOverlays = canUpdate && canLinkGeographicLayer(mapRepresentation);
  const canAddLayer = canUpdate && canImportGeographicLayer(mapRepresentation);
  const overlayStatuses = useGeographicOverlays(mapRuntime.map, overlays);
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
            throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
          }
          latestVersionRef.current = updated.version;
          savedSignatureRef.current = signature;
          setSavedSignature(signature);
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 409) {
            const latest = await useWorkspaceResourcesStore.getState().open(resource.id);
            if (latest?.data.kind === "geographic") latestVersionRef.current = latest.data.version;
            conflictRef.current = true;
            setConflict(true);
            onError(null);
          } else {
            onError(apiErrorCode(failure));
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
  const saveDisplayedView = () => {
    updateDraft((current) => ({ ...current, view: displayedView }));
    void save();
  };
  const retryConflict = () => {
    conflictRef.current = false;
    setConflict(false);
    void save();
  };
  const changeWorkspaceMode = (mode: GeographicWorkspaceMode) => {
    setWorkspaceMode(mode);
    setDrawTool("select");
  };

  const selectFeature = (id: string) => {
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

  if (embedded) {
    return (
      <div className="geographic-resource" data-testid="geographic-resource-map" data-geographic-mode="embedded">
        <div ref={mapRuntime.mapElementRef} className="geographic-map" />
      </div>
    );
  }

  return (
    <div className="geographic-resource" data-testid="geographic-resource-map">
      <div ref={mapRuntime.mapElementRef} className="geographic-map" />
      <GeographicLayerControls
        workspaceMode={workspaceMode}
        canUpdate={canUpdate}
        hallLayerVisible={hallLayerVisible}
        layers={draft.layers}
        onWorkspaceMode={changeWorkspaceMode}
        onHallLayerVisible={setHallLayerVisible}
        onLayerVisibility={setLayerVisibility}
        onLayerOpacity={(id, opacity) =>
          updateLayers(draft.layers.map((layer) => (layer.id === id ? { ...layer, opacity } : layer)))
        }
        onMoveLayer={moveLayer}
        onZoom={mapRuntime.changeZoom}
        canFit={draft.hallLayer.features.length > 0}
        onFit={mapRuntime.fitComposition}
        overlays={overlays}
        overlayStatuses={overlayStatuses}
        canChangeOverlays={canChangeOverlays}
        onOverlayVisibility={changeOverlayVisibility}
        onAddLayer={canAddLayer ? () => setLayerUploadOpen(true) : undefined}
      />
      {workspaceMode === "draw" && canUpdate ? (
        <GeographicCompositionEditor
          panelRef={compositionLayout.panelRef}
          style={compositionLayout.style}
          drawTool={drawTool}
          features={draft.hallLayer.features}
          selectedFeatureId={mapRuntime.selectedFeatureId}
          editingFeatureId={editingFeatureId}
          renameArmedFeatureId={renameArmedFeatureId}
          featureKindLabels={featureKindLabels}
          colorPresets={featureColorPresets}
          onDrawTool={setDrawTool}
          onSelect={selectFeature}
          onEditingFeature={setEditingFeatureId}
          onRenameArmedFeature={setRenameArmedFeatureId}
          onRename={renameFeature}
          onVisibility={mapRuntime.setFeatureVisibility}
          onFitFeature={mapRuntime.fitFeature}
          onColor={mapRuntime.setFeatureColor}
          onDelete={mapRuntime.deleteSelected}
          onPointerDown={compositionLayout.startDrag}
          onPointerMove={compositionLayout.move}
          onPointerUp={compositionLayout.stopDrag}
        />
      ) : null}
      {canUpdate ? (
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
          <Button type="button" variant="outline" onClick={retryConflict}>
            {t("geographic.retryConflict")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
