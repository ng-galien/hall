import type { GeographicMapOverlay } from "@hall/api-contract";
import type { GeographicLayer, GeographicLayerId } from "@hall/domain";
import { geographicLayerOptions } from "@hall/domain";
import { useState } from "react";
import {
  AddIcon,
  DragHandleIcon,
  EditIcon,
  FilterIcon,
  FitBoundsIcon,
  HiddenIcon,
  LayersIcon,
  ListViewIcon,
  MapIcon,
  VisibleIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import "./geographicLayers.css";
import type { GeographicPanelMode, GeographicWorkspaceMode } from "./useGeographicMapRuntime";
import type { GeographicOverlayStatus } from "./useGeographicOverlays";

interface GeographicLayerControlsProps {
  workspaceMode: GeographicWorkspaceMode;
  canUpdate: boolean;
  hallLayerVisible: boolean;
  layers: readonly GeographicLayer[];
  /** Opens the mode, or returns to the plain map when the mode is already active. */
  onToggleMode(mode: GeographicPanelMode): void;
  onHallLayerVisible(visible: boolean): void;
  onLayerVisibility(id: GeographicLayerId, visible: boolean): void;
  onLayerOpacity(id: GeographicLayerId, opacity: number): void;
  onMoveLayer(sourceId: GeographicLayerId, targetId: GeographicLayerId): void;
  onZoom(delta: number): void;
  canFit: boolean;
  onFit(): void;
  overlays: readonly GeographicMapOverlay[];
  overlayStatuses: Readonly<Record<string, GeographicOverlayStatus>>;
  canChangeOverlays: boolean;
  onOverlayVisibility(layerId: string, visible: boolean): void;
  /** Present only when the map advertises the layer import action. */
  onAddLayer?(): void;
  /** Layers whose features can be filtered to the commune's parcels. */
  municipalFilterLayerIds: ReadonlySet<string>;
  municipalOnlyLayerIds: ReadonlySet<string>;
  onMunicipalOnly(layerId: string, enabled: boolean): void;
  /** Present only when the commune's parcel list advertises its import action. */
  onImportMunicipalProperty?(): void;
}

/** Owns the base-layer controls, the linked data-layer rows and their transient drag/drop state. */
// @implements-requirement HALL-FR-DOC-290
// @implements-requirement HALL-FR-DOC-340
// @implements-requirement HALL-FR-DOC-490
export function GeographicLayerControls({
  workspaceMode,
  canUpdate,
  hallLayerVisible,
  layers,
  onToggleMode,
  onHallLayerVisible,
  onLayerVisibility,
  onLayerOpacity,
  onMoveLayer,
  onZoom,
  canFit,
  onFit,
  overlays,
  overlayStatuses,
  canChangeOverlays,
  onOverlayVisibility,
  onAddLayer,
  municipalFilterLayerIds,
  municipalOnlyLayerIds,
  onMunicipalOnly,
  onImportMunicipalProperty,
}: GeographicLayerControlsProps) {
  const { t, formatNumber } = useI18n();
  const [layersOpen, setLayersOpen] = useState(false);
  const [draggedLayerId, setDraggedLayerId] = useState<GeographicLayerId | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<GeographicLayerId | null>(null);

  return (
    <>
      <fieldset className="geographic-mode-switch">
        <legend className="sr-only">{t("geographic.mode")}</legend>
        <button
          type="button"
          className={workspaceMode === "draw" ? "geographic-mode-active" : ""}
          data-testid="geographic-mode-draw"
          aria-pressed={workspaceMode === "draw"}
          onClick={() => onToggleMode("draw")}
        >
          <ListViewIcon />
          <span>{t("geographic.modeDraw")}</span>
        </button>
        <button
          type="button"
          className={workspaceMode === "measure" ? "geographic-mode-active" : ""}
          data-testid="geographic-mode-map"
          aria-pressed={workspaceMode === "measure"}
          onClick={() => onToggleMode("measure")}
        >
          <MapIcon />
          <span>{t("geographic.modeMap")}</span>
        </button>
      </fieldset>
      <fieldset className="geographic-zoom-tools">
        <legend className="sr-only">{t("geographic.zoomControls")}</legend>
        <button
          type="button"
          data-testid="geographic-zoom-in"
          aria-label={t("geographic.zoomIn")}
          title={t("geographic.zoomIn")}
          onClick={() => onZoom(1)}
        >
          +
        </button>
        <button
          type="button"
          data-testid="geographic-zoom-out"
          aria-label={t("geographic.zoomOut")}
          title={t("geographic.zoomOut")}
          onClick={() => onZoom(-1)}
        >
          −
        </button>
        <button
          type="button"
          data-testid="geographic-fit-drawings"
          aria-label={t("geographic.fitComposition")}
          title={t("geographic.fitComposition")}
          disabled={!canFit}
          onClick={onFit}
        >
          <FitBoundsIcon />
        </button>
      </fieldset>
      <div className="geographic-layers">
        <button
          type="button"
          className="geographic-layers-trigger"
          data-testid="geographic-layers-trigger"
          aria-expanded={layersOpen}
          aria-label={t("geographic.layersOpen")}
          onClick={() => setLayersOpen((open) => !open)}
        >
          <LayersIcon />
          {t("geographic.layers")}
        </button>
        {layersOpen ? (
          <ul className="geographic-layers-panel" aria-label={t("geographic.layers")}>
            <li
              className={`geographic-layer-row geographic-layer-fixed${hallLayerVisible ? " geographic-layer-enabled" : ""}`}
              data-testid="geographic-layer-drawing"
            >
              <button
                type="button"
                className="geographic-layer-edit"
                aria-pressed={workspaceMode === "draw"}
                aria-label={t("geographic.drawingLayerEdit")}
                title={t("geographic.drawingLayerEdit")}
                disabled={!canUpdate}
                onClick={() => onToggleMode("draw")}
              >
                <EditIcon />
              </button>
              <button
                type="button"
                className="geographic-layer-visible"
                aria-pressed={hallLayerVisible}
                aria-label={t("geographic.layerVisible").replace("{name}", t("geographic.drawingLayer"))}
                title={t("geographic.layerVisible").replace("{name}", t("geographic.drawingLayer"))}
                onClick={() => onHallLayerVisible(!hallLayerVisible)}
              >
                {hallLayerVisible ? <VisibleIcon /> : <HiddenIcon />}
              </button>
              <span className="geographic-layer-name">{t("geographic.drawingLayer")}</span>
              <span />
            </li>
            {[...layers].reverse().map((layer) => {
              const name = geographicLayerOptions.find(({ id }) => id === layer.id)?.title ?? layer.id;
              return (
                <li
                  className={`geographic-layer-row${layer.visible ? " geographic-layer-enabled" : ""}${draggedLayerId === layer.id ? " geographic-layer-dragging" : ""}${dropTargetLayerId === layer.id ? " geographic-layer-drop-target" : ""}`}
                  key={layer.id}
                  data-testid={`geographic-layer-${layer.id}`}
                  onDragOver={(event) => {
                    if (!canUpdate || !draggedLayerId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetLayerId(layer.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedLayerId) onMoveLayer(draggedLayerId, layer.id);
                    setDraggedLayerId(null);
                    setDropTargetLayerId(null);
                  }}
                >
                  <button
                    type="button"
                    className="geographic-layer-drag-handle"
                    draggable={canUpdate}
                    disabled={!canUpdate}
                    data-testid={`geographic-layer-drag-${layer.id}`}
                    aria-label={t("geographic.layerDrag").replace("{name}", name)}
                    title={t("geographic.layerDrag").replace("{name}", name)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", layer.id);
                      setDraggedLayerId(layer.id);
                    }}
                    onDragEnd={() => {
                      setDraggedLayerId(null);
                      setDropTargetLayerId(null);
                    }}
                  >
                    <DragHandleIcon />
                  </button>
                  <button
                    type="button"
                    className="geographic-layer-visible"
                    disabled={!canUpdate}
                    aria-pressed={layer.visible}
                    aria-label={t("geographic.layerVisible").replace("{name}", name)}
                    title={t("geographic.layerVisible").replace("{name}", name)}
                    onClick={() => onLayerVisibility(layer.id, !layer.visible)}
                  >
                    {layer.visible ? <VisibleIcon /> : <HiddenIcon />}
                  </button>
                  <span className="geographic-layer-name">{name}</span>
                  <input
                    className="geographic-layer-opacity"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={layer.opacity}
                    disabled={!canUpdate || !layer.visible}
                    aria-label={t("geographic.layerOpacity").replace("{name}", name)}
                    onChange={(event) => onLayerOpacity(layer.id, Number(event.currentTarget.value))}
                  />
                </li>
              );
            })}
            {[...overlays]
              .sort((left, right) => right.position - left.position)
              .map((overlay) => {
                const status = overlayStatuses[overlay.layerId] ?? "loading";
                const label = t("geographic.layerVisible").replace("{name}", overlay.name);
                return (
                  <li
                    className={`geographic-layer-row geographic-overlay-row${overlay.visible ? " geographic-layer-enabled" : ""}`}
                    key={overlay.layerId}
                    data-testid={`geographic-overlay-${overlay.layerId}`}
                    data-overlay-status={status}
                  >
                    {municipalFilterLayerIds.has(overlay.layerId) ? (
                      <button
                        type="button"
                        className="geographic-layer-visible"
                        aria-pressed={municipalOnlyLayerIds.has(overlay.layerId)}
                        aria-label={t("geographic.municipalOnlyOf").replace("{name}", overlay.name)}
                        title={t("geographic.municipalOnlyOf").replace("{name}", overlay.name)}
                        data-testid={`geographic-overlay-municipal-only-${overlay.layerId}`}
                        onClick={() => onMunicipalOnly(overlay.layerId, !municipalOnlyLayerIds.has(overlay.layerId))}
                      >
                        <FilterIcon />
                      </button>
                    ) : (
                      <span className="geographic-layer-placeholder" />
                    )}
                    <button
                      type="button"
                      className="geographic-layer-visible"
                      disabled={!canChangeOverlays}
                      aria-pressed={overlay.visible}
                      aria-label={label}
                      title={label}
                      data-testid={`geographic-overlay-visible-${overlay.layerId}`}
                      onClick={() => onOverlayVisibility(overlay.layerId, !overlay.visible)}
                    >
                      {overlay.visible ? <VisibleIcon /> : <HiddenIcon />}
                    </button>
                    <span className="geographic-layer-name" title={overlay.name}>
                      {overlay.name}
                    </span>
                    <span
                      className="geographic-overlay-meta"
                      data-testid={`geographic-overlay-meta-${overlay.layerId}`}
                    >
                      {status === "ready"
                        ? t("geographic.overlayFeatureCount").replace("{count}", formatNumber(overlay.featureCount))
                        : t(status === "loading" ? "geographic.overlayLoading" : "geographic.overlayUnavailable")}
                    </span>
                  </li>
                );
              })}
            {onAddLayer ? (
              <li className="geographic-layer-add">
                <button type="button" data-testid="geographic-add-layer" onClick={onAddLayer}>
                  <AddIcon />
                  {t("geographic.addLayer")}
                </button>
              </li>
            ) : null}
            {onImportMunicipalProperty ? (
              <li className="geographic-layer-add">
                <button
                  type="button"
                  data-testid="geographic-import-municipal-property"
                  onClick={onImportMunicipalProperty}
                >
                  <AddIcon />
                  {t("geographic.importMunicipalProperty")}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </>
  );
}
