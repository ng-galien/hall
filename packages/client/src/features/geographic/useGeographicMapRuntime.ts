import type {
  GeographicColor,
  GeographicLayer,
  GeographicResourceData,
  GeographicView,
  HallGeoJsonFeatureKind,
} from "@hall/domain";
import { hallGeoJsonMeasurements } from "@hall/domain";
import Collection from "ol/Collection";
import { defaults as defaultControls } from "ol/control/defaults";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
import Translate from "ol/interaction/Translate";
import VectorLayer from "ol/layer/Vector";
import OlMap from "ol/Map";
import { toLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { useCallback, useEffect, useRef, useState } from "react";
import { geographicFeatureKindPolicy, isHallGeoJsonFeatureKind } from "./geographicFeatureKindPolicy";
import { completeGeographicLayers } from "./geographicMapModel";
import {
  createGeographicTileLayers,
  createGeographicView,
  geographicFeatureStyle,
  geographicModifiedFeatureStyle,
  geographicSelectedFeatureStyle,
  initialGeographicFeatureProperties,
  readHallFeatures,
  reconcileHallDrawingSource,
  serializeHallLayer,
  updateGeographicView,
} from "./geographicOpenLayersAdapter";

/** Plain map, Mesures panel open, or Dessin with its Composition panel. */
export type GeographicWorkspaceMode = "map" | "measure" | "draw";
/** A mode the toolbar toggles; pressing the active one returns to the plain map. */
export type GeographicPanelMode = Exclude<GeographicWorkspaceMode, "map">;
export type GeographicDrawTool = "select" | HallGeoJsonFeatureKind;

interface GeographicMapRuntimeOptions {
  resourceId: string;
  data: GeographicResourceData;
  /** Explicit navigation request; a new request can restore the same framing after a manual pan. */
  requestedView?: GeographicView;
  draftLayers: readonly GeographicLayer[];
  canUpdate: boolean;
  embedded: boolean;
  workspaceMode: GeographicWorkspaceMode;
  drawTool: GeographicDrawTool;
  hallLayerVisible: boolean;
  featureKindLabels: Record<HallGeoJsonFeatureKind, string>;
  updateDraft(update: (current: GeographicResourceData) => GeographicResourceData): GeographicResourceData;
  onDrawTool(tool: GeographicDrawTool): void;
  onSelection(featureId: string | null): void;
  onFeatureCreated(featureId: string): void;
  /** Receives the displayed centre and zoom after each move; the view is never written into the draft. */
  onViewChange(view: GeographicView): void;
}

/** Pixel tolerance of the drawing hit test, matching the vertex tolerance of the modification interaction. */
const DRAWING_HIT_TOLERANCE = 6;

const OWN_ESCAPE_SELECTOR =
  "input, textarea, select, [data-radix-popper-content-wrapper], [role='menu'], [role='listbox']";

function escapeBelongsToTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest(OWN_ESCAPE_SELECTOR) !== null;
}

// @implements-requirement HALL-FR-DOC-300
// @implements-requirement HALL-FR-DOC-450
// @implements-requirement HALL-FR-WSP-350
/**
 * Owns OpenLayers lifecycle and translates map interactions into geographic draft mutations. A click selects a
 * drawing; the modification of its shape is a distinct state of one selected drawing, controlled by its Composition flag, and only that drawing takes the drags.
 */
export function useGeographicMapRuntime({
  resourceId,
  data,
  requestedView,
  draftLayers,
  canUpdate,
  embedded,
  workspaceMode,
  drawTool,
  hallLayerVisible,
  featureKindLabels,
  updateDraft,
  onDrawTool,
  onSelection,
  onFeatureCreated,
  onViewChange,
}: GeographicMapRuntimeOptions) {
  const initialDataRef = useRef(data);
  initialDataRef.current = data;
  const initialRequestedViewRef = useRef(requestedView);
  initialRequestedViewRef.current = requestedView;
  const featureKindLabelsRef = useRef(featureKindLabels);
  const activeResourceRef = useRef(resourceId);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const retainedViewRef = useRef<GeographicView | null>(null);
  const incomingViewRef = useRef({ signature: JSON.stringify(data.view), request: requestedView });
  const vectorSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const selectRef = useRef<Select | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const translateRef = useRef<Translate | null>(null);
  const modifiedFeaturesRef = useRef(new Collection<Feature<Geometry>>());
  const modifyingIdRef = useRef<string | null>(null);
  const retainedSelectionRef = useRef<{ selected: string | null; modifying: string | null }>({
    selected: null,
    modifying: null,
  });
  const tileLayersRef = useRef(createGeographicTileLayers([]).byId);
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry> | null>(null);
  const [modifyingFeatureId, setModifyingFeatureId] = useState<string | null>(null);
  const [openLayersMap, setOpenLayersMap] = useState<OlMap | null>(null);
  const [drawingSource, setDrawingSource] = useState<VectorSource<Feature<Geometry>> | null>(null);

  const setModifying = useCallback((feature: Feature<Geometry> | null) => {
    const previousId = modifyingIdRef.current;
    const modified = modifiedFeaturesRef.current;
    const previous = modified.item(0);
    modified.clear();
    if (feature) modified.push(feature);
    modifyingIdRef.current = feature ? String(feature.getId()) : null;
    modifyRef.current?.setActive(feature !== null);
    translateRef.current?.setActive(feature !== null);
    previous?.changed();
    feature?.changed();
    if (previousId !== modifyingIdRef.current) setModifyingFeatureId(modifyingIdRef.current);
  }, []);

  const clearSelection = useCallback(() => {
    setModifying(null);
    selectRef.current?.getFeatures().clear();
    setSelectedFeature(null);
    onSelection(null);
  }, [onSelection, setModifying]);

  const syncHallLayer = useCallback(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    updateDraft((current) => ({
      ...current,
      hallLayer: {
        ...current.hallLayer,
        type: "FeatureCollection",
        features: [...serializeHallLayer(source).features, ...hallGeoJsonMeasurements(current.hallLayer)],
      },
    }));
  }, [updateDraft]);

  useEffect(() => {
    const target = mapElementRef.current;
    if (!target) return;
    if (activeResourceRef.current !== resourceId) {
      retainedViewRef.current = null;
      retainedSelectionRef.current = { selected: null, modifying: null };
      activeResourceRef.current = resourceId;
    }
    const initialData = initialDataRef.current;
    incomingViewRef.current = {
      signature: JSON.stringify(initialData.view),
      request: initialRequestedViewRef.current,
    };
    const normalizedLayers = completeGeographicLayers(initialData.layers);
    const view = createGeographicView(retainedViewRef.current ?? initialData.view);
    const tileLayers = createGeographicTileLayers(normalizedLayers);
    const vectorSource = new VectorSource<Feature<Geometry>>({ features: readHallFeatures(initialData.hallLayer) });
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature, resolution) => {
        const kind = feature.get("kind");
        const index = Math.max(0, vectorSource.getFeatures().indexOf(feature as Feature<Geometry>));
        if (!isHallGeoJsonFeatureKind(kind)) return geographicFeatureStyle(feature, undefined, resolution);
        return geographicFeatureStyle(feature, `${featureKindLabelsRef.current[kind]} ${index + 1}`, resolution);
      },
      zIndex: 100,
      visible: true,
    });
    const map = new OlMap({
      target,
      layers: [...tileLayers.ordered, vectorLayer],
      view,
      controls: embedded ? [] : defaultControls({ zoom: false }),
      interactions: embedded ? [] : undefined,
    });
    const select = new Select({
      layers: [vectorLayer],
      style: (feature, resolution) =>
        feature.getId() !== undefined && String(feature.getId()) === modifyingIdRef.current
          ? geographicModifiedFeatureStyle(feature, resolution)
          : geographicSelectedFeatureStyle(feature, resolution),
      hitTolerance: DRAWING_HIT_TOLERANCE,
    });
    const modify = new Modify({ features: modifiedFeaturesRef.current });
    const translate = new Translate({ features: modifiedFeaturesRef.current, hitTolerance: DRAWING_HIT_TOLERANCE });
    select.setActive(false);
    modify.setActive(false);
    translate.setActive(false);
    map.addInteraction(select);
    map.addInteraction(translate);
    map.addInteraction(modify);
    select.on("select", (event) => {
      const feature = (event.selected[0] as Feature<Geometry> | undefined) ?? null;
      if (!feature || String(feature.getId()) !== modifyingIdRef.current) setModifying(null);
      setSelectedFeature(feature);
      onSelection(feature ? String(feature.getId()) : null);
    });
    modify.on("modifyend", syncHallLayer);
    translate.on("translateend", syncHallLayer);
    map.on("moveend", () => {
      if (embedded) return;
      const projectedCenter = view.getCenter();
      if (!projectedCenter) return;
      const position = toLonLat(projectedCenter);
      onViewChangeRef.current({
        kind: "center",
        center: [position[0], position[1]],
        zoom: view.getZoom() ?? initialData.view.zoom,
      });
    });
    mapRef.current = map;
    setOpenLayersMap(map);
    setDrawingSource(vectorSource);
    vectorSourceRef.current = vectorSource;
    vectorLayerRef.current = vectorLayer;
    selectRef.current = select;
    modifyRef.current = modify;
    translateRef.current = translate;
    tileLayersRef.current = tileLayers.byId;
    const retained = retainedSelectionRef.current;
    const retainedFeature = retained.selected ? vectorSource.getFeatureById(retained.selected) : null;
    if (retainedFeature) select.getFeatures().push(retainedFeature);
    setSelectedFeature(retainedFeature ?? null);
    if (retainedFeature && retained.modifying === retained.selected) setModifying(retainedFeature);
    let resizeObserver: ResizeObserver | null = null;
    if (embedded) {
      const fitEmbeddedExtent = () => {
        map.updateSize();
        const size = map.getSize();
        if (!size || vectorSource.isEmpty()) return;
        const extent = vectorSource.getExtent();
        if (!extent) return;
        map.getView().fit(extent, { size, padding: [24, 24, 24, 24], maxZoom: 18 });
      };
      window.requestAnimationFrame(fitEmbeddedExtent);
      resizeObserver = new ResizeObserver(fitEmbeddedExtent);
      resizeObserver.observe(target);
    }
    return () => {
      const projectedCenter = view.getCenter();
      if (projectedCenter) {
        const [longitude, latitude] = toLonLat(projectedCenter);
        retainedViewRef.current = {
          kind: "center",
          center: [longitude, latitude],
          zoom: view.getZoom() ?? initialData.view.zoom,
        };
      }
      retainedSelectionRef.current = {
        selected: select.getFeatures().item(0)?.getId()?.toString() ?? null,
        modifying: modifyingIdRef.current,
      };
      resizeObserver?.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
      setOpenLayersMap(null);
      vectorSourceRef.current = null;
      setDrawingSource(null);
      vectorLayerRef.current = null;
      selectRef.current = null;
      modifyRef.current = null;
      translateRef.current = null;
      modifiedFeaturesRef.current.clear();
      modifyingIdRef.current = null;
      setModifyingFeatureId(null);
      tileLayersRef.current = createGeographicTileLayers([]).byId;
    };
  }, [resourceId, embedded, onSelection, setModifying, syncHallLayer]);

  // URL/history framing is authoritative, but an unchanged saved view must not undo a user's pan or zoom.
  // @implements-requirement HALL-FR-WSP-330
  useEffect(() => {
    if (!openLayersMap || mapRef.current !== openLayersMap || embedded) return;
    const signature = JSON.stringify(data.view);
    const previous = incomingViewRef.current;
    if (signature === previous.signature && requestedView === previous.request) return;
    incomingViewRef.current = { signature, request: requestedView };
    const view = openLayersMap.getView();
    updateGeographicView(view, data.view);
    const center = view.getCenter();
    if (center) {
      const [longitude, latitude] = toLonLat(center);
      onViewChangeRef.current({
        kind: "center",
        center: [longitude, latitude],
        zoom: view.getZoom() ?? data.view.zoom,
      });
    }
  }, [data.view, requestedView, openLayersMap, embedded]);

  // Drawing mutations keep the map, XYZ sources and their parent-tile caches alive.
  // Adopt an external replacement in place so selection and modification retain feature identity.
  useEffect(() => {
    const source = vectorSourceRef.current;
    if (!source || !openLayersMap || mapRef.current !== openLayersMap) return;
    const ids = reconcileHallDrawingSource(source, data.hallLayer);
    const selected = selectRef.current?.getFeatures().item(0);
    if (selected && !ids.has(String(selected.getId()))) clearSelection();
    else if (modifyingIdRef.current && !ids.has(modifyingIdRef.current)) setModifying(null);
  }, [data.hallLayer, openLayersMap, clearSelection, setModifying]);

  useEffect(() => {
    featureKindLabelsRef.current = featureKindLabels;
    vectorLayerRef.current?.changed();
  }, [featureKindLabels]);

  useEffect(() => {
    const map = openLayersMap;
    const source = vectorSourceRef.current;
    if (!map || !source || !canUpdate || workspaceMode !== "draw" || drawTool === "select") return;
    const draw = new Draw({ source, type: geographicFeatureKindPolicy[drawTool].drawType });
    let drawing = false;
    draw.on("drawstart", () => {
      drawing = true;
    });
    draw.on("drawabort", () => {
      drawing = false;
    });
    const cancelDrawingOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !drawing || escapeBelongsToTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      draw.abortDrawing();
    };
    window.addEventListener("keydown", cancelDrawingOnEscape, { capture: true });
    draw.on("drawend", (event) => {
      drawing = false;
      event.feature.setId(crypto.randomUUID());
      const existingCount = source
        .getFeatures()
        .filter((feature) => feature !== event.feature && feature.get("kind") === drawTool).length;
      event.feature.setProperties(
        initialGeographicFeatureProperties(drawTool, `${featureKindLabels[drawTool]} ${existingCount + 1}`),
      );
      window.setTimeout(() => {
        syncHallLayer();
        selectRef.current?.getFeatures().clear();
        selectRef.current?.getFeatures().push(event.feature);
        setSelectedFeature(event.feature);
        const featureId = String(event.feature.getId());
        onFeatureCreated(featureId);
        onDrawTool("select");
      }, 0);
    });
    map.addInteraction(draw);
    return () => {
      window.removeEventListener("keydown", cancelDrawingOnEscape, { capture: true });
      map.removeInteraction(draw);
    };
  }, [
    canUpdate,
    drawTool,
    featureKindLabels,
    onDrawTool,
    onFeatureCreated,
    syncHallLayer,
    workspaceMode,
    openLayersMap,
  ]);

  useEffect(() => {
    if (!openLayersMap) return;
    const active = canUpdate && workspaceMode === "draw" && drawTool === "select";
    selectRef.current?.setActive(active);
    if (!active) clearSelection();
  }, [canUpdate, clearSelection, drawTool, workspaceMode, openLayersMap]);

  const drawingFeatureAt = useCallback((pixel: number[]): Feature<Geometry> | null => {
    const map = mapRef.current;
    const layer = vectorLayerRef.current;
    if (!map || !layer) return null;
    let found: Feature<Geometry> | null = null;
    map.forEachFeatureAtPixel(
      pixel,
      (feature) => {
        found = feature as Feature<Geometry>;
        return true;
      },
      { layerFilter: (candidate) => candidate === layer, hitTolerance: DRAWING_HIT_TOLERANCE },
    );
    return found;
  }, []);

  useEffect(() => {
    if (openLayersMap) vectorLayerRef.current?.setVisible(hallLayerVisible);
  }, [hallLayerVisible, openLayersMap]);

  useEffect(() => {
    if (!openLayersMap) return;
    draftLayers.forEach((layer, index) => {
      const tileLayer = tileLayersRef.current.get(layer.id);
      tileLayer?.setVisible(layer.visible);
      tileLayer?.setOpacity(layer.opacity);
      tileLayer?.setZIndex(index);
    });
  }, [draftLayers, openLayersMap]);

  const drawingIdAt = (pixel: number[]): string | null => {
    const feature = drawingFeatureAt(pixel);
    return feature ? String(feature.getId()) : null;
  };

  const startModifying = (id: string) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    selectFeature(id);
    setModifying(feature);
  };

  const stopModifying = () => setModifying(null);

  const selectFeature = (id: string) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    if (id !== modifyingIdRef.current) setModifying(null);
    onDrawTool("select");
    selectRef.current?.getFeatures().clear();
    selectRef.current?.getFeatures().push(feature);
    setSelectedFeature(feature);
    onSelection(id);
  };

  const deleteSelected = (id?: string) => {
    const feature = id ? vectorSourceRef.current?.getFeatureById(id) : selectedFeature;
    if (!feature) return;
    vectorSourceRef.current?.removeFeature(feature);
    if (feature === selectedFeature) clearSelection();
    syncHallLayer();
  };

  const renameFeature = (id: string, label: string): boolean => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return false;
    feature.set("label", label);
    feature.changed();
    setSelectedFeature(feature);
    syncHallLayer();
    return true;
  };

  const setFeatureVisibility = (id: string, visible: boolean) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    feature.set("visible", visible);
    feature.changed();
    if (!visible && selectedFeature?.getId() === id) clearSelection();
    syncHallLayer();
  };

  const setFeatureColor = (id: string, color: GeographicColor) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    const kind = feature.get("kind");
    if (!isHallGeoJsonFeatureKind(kind)) return;
    const style = feature.get("style") as Record<string, unknown>;
    feature.set("style", geographicFeatureKindPolicy[kind].recolor(style, color));
    feature.changed();
    syncHallLayer();
  };

  const setFeatureArrows = (id: string, arrows: "none" | "forward" | "backward" | "both") => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (feature?.get("kind") !== "line") return;
    feature.set("style", { ...feature.get("style"), arrows });
    feature.changed();
    syncHallLayer();
  };

  const changeZoom = (delta: number) => {
    const view = mapRef.current?.getView();
    const zoom = view?.getZoom();
    if (!view || zoom === undefined) return;
    view.animate({ zoom: zoom + delta, duration: 150 });
  };

  const fitComposition = () => {
    const map = mapRef.current;
    const source = vectorSourceRef.current;
    const size = map?.getSize();
    if (!map || !source || !size || source.isEmpty()) return;
    const extent = source.getExtent();
    if (!extent) return;
    map.getView().fit(extent, { size, padding: [48, 48, 48, 48], maxZoom: 18, duration: 250 });
  };

  const fitFeature = (id: string) => {
    const map = mapRef.current;
    const feature = vectorSourceRef.current?.getFeatureById(id);
    const extent = feature?.getGeometry()?.getExtent();
    const size = map?.getSize();
    if (!map || !extent || !size) return;
    map.getView().fit(extent, { size, padding: [48, 48, 48, 48], maxZoom: 18, duration: 250 });
  };

  return {
    mapElementRef,
    map: openLayersMap,
    drawingSource,
    selectedFeatureId: selectedFeature ? String(selectedFeature.getId()) : null,
    modifyingFeatureId,
    startModifying,
    stopModifying,
    drawingIdAt,
    selectFeature,
    clearSelection,
    deleteSelected,
    renameFeature,
    setFeatureVisibility,
    setFeatureColor,
    setFeatureArrows,
    changeZoom,
    fitComposition,
    fitFeature,
  };
}
