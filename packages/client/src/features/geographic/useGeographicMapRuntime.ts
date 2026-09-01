import type { GeographicColor, GeographicLayer, GeographicResourceData, HallGeoJsonFeatureKind } from "@hall/domain";
import { defaults as defaultControls } from "ol/control/defaults";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
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
  initialGeographicFeatureProperties,
  readHallFeatures,
  serializeHallLayer,
} from "./geographicOpenLayersAdapter";

export type GeographicWorkspaceMode = "map" | "draw";
export type GeographicDrawTool = "select" | HallGeoJsonFeatureKind;

interface GeographicMapRuntimeOptions {
  data: GeographicResourceData;
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
}

/** Owns OpenLayers lifecycle and translates map interactions into geographic draft mutations. */
export function useGeographicMapRuntime({
  data,
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
}: GeographicMapRuntimeOptions) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const vectorSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const selectRef = useRef<Select | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const tileLayersRef = useRef(createGeographicTileLayers([]).byId);
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry> | null>(null);

  const clearSelection = useCallback(() => {
    selectRef.current?.getFeatures().clear();
    setSelectedFeature(null);
    onSelection(null);
  }, [onSelection]);

  const syncHallLayer = useCallback(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    updateDraft((current) => ({ ...current, hallLayer: serializeHallLayer(source) }));
  }, [updateDraft]);

  useEffect(() => {
    const target = mapElementRef.current;
    if (!target) return;
    const normalizedLayers = completeGeographicLayers(data.layers);
    const view = createGeographicView(data.view);
    const tileLayers = createGeographicTileLayers(normalizedLayers);
    const vectorSource = new VectorSource<Feature<Geometry>>({ features: readHallFeatures(data.hallLayer) });
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        const kind = feature.get("kind");
        const index = Math.max(0, vectorSource.getFeatures().indexOf(feature as Feature<Geometry>));
        if (!isHallGeoJsonFeatureKind(kind)) return geographicFeatureStyle(feature);
        return geographicFeatureStyle(feature, `${featureKindLabels[kind]} ${index + 1}`);
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
    const select = new Select({ layers: [vectorLayer] });
    const modify = new Modify({ source: vectorSource });
    select.setActive(false);
    modify.setActive(false);
    map.addInteraction(select);
    map.addInteraction(modify);
    select.on("select", (event) => {
      const feature = (event.selected[0] as Feature<Geometry> | undefined) ?? null;
      setSelectedFeature(feature);
      onSelection(feature ? String(feature.getId()) : null);
    });
    modify.on("modifyend", syncHallLayer);
    map.on("moveend", () => {
      if (embedded) return;
      const projectedCenter = view.getCenter();
      if (!projectedCenter) return;
      const position = toLonLat(projectedCenter);
      updateDraft((current) => ({
        ...current,
        view: { kind: "center", center: [position[0], position[1]], zoom: view.getZoom() ?? current.view.zoom },
      }));
    });
    mapRef.current = map;
    vectorSourceRef.current = vectorSource;
    vectorLayerRef.current = vectorLayer;
    selectRef.current = select;
    modifyRef.current = modify;
    tileLayersRef.current = tileLayers.byId;
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
      resizeObserver?.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
      vectorSourceRef.current = null;
      vectorLayerRef.current = null;
      selectRef.current = null;
      modifyRef.current = null;
      tileLayersRef.current = createGeographicTileLayers([]).byId;
    };
  }, [data.hallLayer, data.layers, data.view, embedded, featureKindLabels, onSelection, syncHallLayer, updateDraft]);

  useEffect(() => {
    const map = mapRef.current;
    const source = vectorSourceRef.current;
    if (!map || !source || !canUpdate || workspaceMode !== "draw" || drawTool === "select") return;
    const draw = new Draw({ source, type: geographicFeatureKindPolicy[drawTool].drawType });
    draw.on("drawend", (event) => {
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
      map.removeInteraction(draw);
    };
  }, [canUpdate, drawTool, featureKindLabels, onDrawTool, onFeatureCreated, syncHallLayer, workspaceMode]);

  useEffect(() => {
    const active = canUpdate && workspaceMode === "draw" && drawTool === "select";
    selectRef.current?.setActive(active);
    modifyRef.current?.setActive(active);
    if (!active) clearSelection();
  }, [canUpdate, clearSelection, drawTool, workspaceMode]);

  useEffect(() => vectorLayerRef.current?.setVisible(hallLayerVisible), [hallLayerVisible]);

  useEffect(() => {
    draftLayers.forEach((layer, index) => {
      const tileLayer = tileLayersRef.current.get(layer.id);
      tileLayer?.setVisible(layer.visible);
      tileLayer?.setOpacity(layer.opacity);
      tileLayer?.setZIndex(index);
    });
  }, [draftLayers]);

  const selectFeature = (id: string) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    onDrawTool("select");
    selectRef.current?.getFeatures().clear();
    selectRef.current?.getFeatures().push(feature);
    setSelectedFeature(feature);
    onSelection(id);
  };

  const deleteSelected = () => {
    if (!selectedFeature) return;
    vectorSourceRef.current?.removeFeature(selectedFeature);
    clearSelection();
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

  return {
    mapElementRef,
    selectedFeatureId: selectedFeature ? String(selectedFeature.getId()) : null,
    selectFeature,
    deleteSelected,
    renameFeature,
    setFeatureVisibility,
    setFeatureColor,
    changeZoom,
    fitComposition,
  };
}
