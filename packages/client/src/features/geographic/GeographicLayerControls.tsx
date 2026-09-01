import type { GeographicLayer, GeographicLayerId } from "@hall/domain";
import { geographicLayerOptions } from "@hall/domain";
import { useState } from "react";
import { DragHandleIcon, EditIcon, HiddenIcon, LayersIcon, MapIcon, VisibleIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import type { GeographicWorkspaceMode } from "./useGeographicMapRuntime";

interface GeographicLayerControlsProps {
  workspaceMode: GeographicWorkspaceMode;
  canUpdate: boolean;
  hallLayerVisible: boolean;
  layers: readonly GeographicLayer[];
  onWorkspaceMode(mode: GeographicWorkspaceMode): void;
  onHallLayerVisible(visible: boolean): void;
  onLayerVisibility(id: GeographicLayerId, visible: boolean): void;
  onLayerOpacity(id: GeographicLayerId, opacity: number): void;
  onMoveLayer(sourceId: GeographicLayerId, targetId: GeographicLayerId): void;
  onZoom(delta: number): void;
}

/** Owns the base-layer controls and their transient drag/drop state. */
export function GeographicLayerControls({
  workspaceMode,
  canUpdate,
  hallLayerVisible,
  layers,
  onWorkspaceMode,
  onHallLayerVisible,
  onLayerVisibility,
  onLayerOpacity,
  onMoveLayer,
  onZoom,
}: GeographicLayerControlsProps) {
  const { t } = useI18n();
  const [layersOpen, setLayersOpen] = useState(false);
  const [draggedLayerId, setDraggedLayerId] = useState<GeographicLayerId | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<GeographicLayerId | null>(null);

  return (
    <>
      <fieldset className="geographic-mode-switch">
        <legend className="sr-only">{t("geographic.mode")}</legend>
        <button
          type="button"
          className={workspaceMode === "map" ? "geographic-mode-active" : ""}
          data-testid="geographic-mode-map"
          aria-pressed={workspaceMode === "map"}
          onClick={() => onWorkspaceMode("map")}
        >
          <MapIcon />
          <span>{t("geographic.modeMap")}</span>
        </button>
        <button
          type="button"
          className={workspaceMode === "draw" ? "geographic-mode-active" : ""}
          data-testid="geographic-mode-draw"
          aria-pressed={workspaceMode === "draw"}
          disabled={!canUpdate}
          onClick={() => onWorkspaceMode("draw")}
        >
          <EditIcon />
          <span>{t("geographic.modeDraw")}</span>
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
                onClick={() => onWorkspaceMode(workspaceMode === "draw" ? "map" : "draw")}
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
          </ul>
        ) : null}
      </div>
    </>
  );
}
