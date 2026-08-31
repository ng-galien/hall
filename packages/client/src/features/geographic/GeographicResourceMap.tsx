import type {
  GeographicLayer,
  GeographicLayerId,
  GeographicColor,
  GeographicResource,
  GeographicResourceData,
  HallGeoJsonFeatureCollection,
} from "@hall/domain";
import { geographicLayerOptions } from "@hall/domain";
import { fromString } from "ol/color";
import { defaults as defaultControls } from "ol/control/defaults";
import type { FeatureLike } from "ol/Feature";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OlMap from "ol/Map";
import { fromLonLat, toLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import View from "ol/View";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "ol/ol.css";
import { Button } from "@/components/ui/button";
import { ColorPicker, type ColorPickerPreset } from "@/components/ui/color-picker";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import {
  AreaIcon,
  DeleteIcon,
  DragHandleIcon,
  EditIcon,
  FitBoundsIcon,
  HiddenIcon,
  LayersIcon,
  LineIcon,
  LocationIcon,
  MapIcon,
  PointerIcon,
  VisibleIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { useSaveStatusStore } from "../../pages/workspace/saveStatusStore";
import { ApiError, type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren, updateGeographicResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";

type WorkspaceMode = "map" | "draw";
type DrawTool = "select" | "marker" | "line" | "area";
type CompositionLayout = { left: number; top: number; width: number; height: number };

const geoJson = new GeoJSON();
const IGN_ATTRIBUTION = "© IGN - Licence Ouverte 2.0";
const GEOGRAPHIC_SAVE_DEBOUNCE_MS = 1_500;

function compositionLayoutStorageKey(resourceId: string): string {
  return `hall.workspace.geographic.composition.${resourceId}`;
}

function storedCompositionLayout(resourceId: string): CompositionLayout | null {
  try {
    const value = JSON.parse(localStorage.getItem(compositionLayoutStorageKey(resourceId)) ?? "null") as Partial<CompositionLayout> | null;
    if (
      value &&
      Number.isFinite(value.left) &&
      Number.isFinite(value.top) &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      Number(value.width) > 0 &&
      Number(value.height) > 0
    ) {
      return {
        left: Math.max(0, Number(value.left)),
        top: Math.max(0, Number(value.top)),
        width: Number(value.width),
        height: Number(value.height),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function persistCompositionLayout(resourceId: string, layout: CompositionLayout): void {
  try {
    localStorage.setItem(compositionLayoutStorageKey(resourceId), JSON.stringify(layout));
  } catch {
    return;
  }
}

function wmtsUrl(layer: GeographicLayerId): string {
  const format = layer === "ORTHOIMAGERY.ORTHOPHOTOS" ? "image/jpeg" : "image/png";
  return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(layer)}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`;
}

function completeLayers(layers: GeographicLayer[]): GeographicLayer[] {
  const completed = [...layers];
  for (const { id } of geographicLayerOptions) {
    if (!completed.some((layer) => layer.id === id)) completed.push({ id, visible: false, opacity: 1 });
  }
  return completed;
}

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function featureColor(color: string): string {
  return color;
}

function colorWithOpacity(color: string, opacity: number): number[] {
  const parsed = [...fromString(color)];
  parsed[3] = opacity;
  return parsed;
}

function featureStyle(feature: FeatureLike, fallbackLabel?: string): Style {
  if (!(feature instanceof Feature)) return new Style();
  const properties = feature.get("style") as Record<string, unknown> | undefined;
  if (feature.get("visible") === false) return new Style({});
  const label = (feature.get("label") as string | null | undefined) ?? fallbackLabel;
  const kind = feature.get("kind") as "marker" | "line" | "area" | undefined;
  const text = label
    ? new Text({
        text: label,
        offsetY: -18,
        fill: new Fill({ color: cssToken("--hall-color-text") }),
        stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 3 }),
      })
    : undefined;
  if (kind === "marker") {
    const sizes = { small: 5, medium: 7, large: 9 };
    const color = featureColor(String(properties?.color ?? "blue"));
    return new Style({
      image: new CircleStyle({
        radius: sizes[(properties?.size as keyof typeof sizes) ?? "medium"],
        fill: new Fill({ color }),
        stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 2 }),
      }),
      text,
    });
  }
  if (kind === "area") {
    const strokeColor = featureColor(String(properties?.strokeColor ?? "blue"));
    const fillColor = featureColor(String(properties?.fillColor ?? "blue"));
    return new Style({
      stroke: new Stroke({ color: strokeColor, width: Number(properties?.strokeWidth ?? 2) }),
      fill: new Fill({ color: colorWithOpacity(fillColor, Number(properties?.fillOpacity ?? 0.2)) }),
      text,
    });
  }
  return new Style({
    stroke: new Stroke({
      color: featureColor(String(properties?.color ?? "blue")),
      width: Number(properties?.width ?? 3),
    }),
    text,
  });
}

function initialProperties(mode: Exclude<DrawTool, "select">, label: string) {
  const color = cssToken("--hall-color-brand") as GeographicColor;
  if (mode === "marker")
    return { kind: "marker", visible: true, label, style: { color, size: "medium" } };
  if (mode === "line") return { kind: "line", visible: true, label, style: { color, width: 3 } };
  return {
    kind: "area",
    visible: true,
    label,
    style: { fillColor: color, strokeColor: color, strokeWidth: 2, fillOpacity: 0.2 },
  };
}

function serializeHallLayer(source: VectorSource<Feature<Geometry>>): HallGeoJsonFeatureCollection {
  return geoJson.writeFeaturesObject(source.getFeatures(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 7,
  }) as HallGeoJsonFeatureCollection;
}

export function GeographicResourceMap({
  resource,
  data,
  canUpdate,
  autosaveEnabled = true,
  onError,
  onRegisterFlush,
  embedded = false,
}: {
  resource: GeographicResource;
  data: GeographicResourceData;
  canUpdate: boolean;
  autosaveEnabled?: boolean;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const vectorSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const selectRef = useRef<Select | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const compositionPanelRef = useRef<HTMLDivElement | null>(null);
  const compositionDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const tileLayersRef = useRef(new globalThis.Map<GeographicLayerId, TileLayer<XYZ>>());
  const latestDraftRef = useRef<GeographicResourceData>(data);
  const latestVersionRef = useRef(resource.version);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const conflictRef = useRef(false);
  const autosaveEnabledRef = useRef(autosaveEnabled);
  const savedSignatureRef = useRef(JSON.stringify({ ...data, layers: completeLayers(data.layers) }));
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const [draft, setDraft] = useState<GeographicResourceData>(() => ({ ...data, layers: completeLayers(data.layers) }));
  const [savedSignature, setSavedSignature] = useState(() =>
    JSON.stringify({ ...data, layers: completeLayers(data.layers) }),
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("map");
  const [drawTool, setDrawTool] = useState<DrawTool>("select");
  const [hallLayerVisible, setHallLayerVisible] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [draggedLayerId, setDraggedLayerId] = useState<GeographicLayerId | null>(null);
  const [dropTargetLayerId, setDropTargetLayerId] = useState<GeographicLayerId | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<Feature<Geometry> | null>(null);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [renameArmedFeatureId, setRenameArmedFeatureId] = useState<string | null>(null);
  const [compositionLayout, setCompositionLayout] = useState<CompositionLayout | null>(() =>
    storedCompositionLayout(resource.id),
  );
  const [conflict, setConflict] = useState(false);

  const draftSignature = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = draftSignature !== savedSignature;
  autosaveEnabledRef.current = autosaveEnabled;

  const updateDraft = useCallback((update: (current: GeographicResourceData) => GeographicResourceData) => {
    const next = update(latestDraftRef.current);
    latestDraftRef.current = next;
    setDraft(next);
    return next;
  }, []);

  const updateCompositionLayout = useCallback(
    (update: (current: CompositionLayout | null) => CompositionLayout) => {
      setCompositionLayout((current) => {
        const next = update(current);
        persistCompositionLayout(resource.id, next);
        return next;
      });
    },
    [resource.id],
  );

  const syncHallLayer = useCallback(() => {
    const source = vectorSourceRef.current;
    if (!source) return;
    updateDraft((current) => ({ ...current, hallLayer: serializeHallLayer(source) }));
  }, [updateDraft]);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    latestVersionRef.current = resource.version;
  }, [resource.version]);

  useEffect(() => {
    setCompositionLayout(storedCompositionLayout(resource.id));
  }, [resource.id]);

  useEffect(() => {
    if (workspaceMode !== "draw") return;
    const panel = compositionPanelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const captureLayout = () => {
      const panelRect = panel.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const width = Math.min(panelRect.width, containerRect.width);
      const height = Math.min(panelRect.height, containerRect.height);
      updateCompositionLayout((current) => {
        const left = Math.max(0, Math.min(current?.left ?? panelRect.left - containerRect.left, containerRect.width - width));
        const top = Math.max(0, Math.min(current?.top ?? panelRect.top - containerRect.top, containerRect.height - height));
        const next = { left, top, width, height };
        return current &&
          current.left === next.left &&
          current.top === next.top &&
          current.width === next.width &&
          current.height === next.height
          ? current
          : next;
      });
    };
    captureLayout();
    const observer = new ResizeObserver(captureLayout);
    observer.observe(panel);
    observer.observe(container);
    return () => observer.disconnect();
  }, [resource.id, updateCompositionLayout, workspaceMode]);

  useEffect(() => {
    if (!mapElementRef.current) return;
    const normalizedLayers = completeLayers(data.layers);
    const center =
      data.view.kind === "center"
        ? data.view.center
        : [(data.view.extent[0] + data.view.extent[2]) / 2, (data.view.extent[1] + data.view.extent[3]) / 2];
    const view = new View({ center: fromLonLat(center), zoom: data.view.zoom, minZoom: 0, maxZoom: 22 });
    const tileLayers = new globalThis.Map<GeographicLayerId, TileLayer<XYZ>>();
    const mapLayers = normalizedLayers.map((layer, index) => {
      const tileLayer = new TileLayer({
        source: new XYZ({ url: wmtsUrl(layer.id), crossOrigin: "anonymous", attributions: IGN_ATTRIBUTION }),
        visible: layer.visible,
        opacity: layer.opacity,
        zIndex: index,
      });
      tileLayers.set(layer.id, tileLayer);
      return tileLayer;
    });
    const vectorSource = new VectorSource<Feature<Geometry>>({
      features: geoJson.readFeatures(data.hallLayer, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
    });
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        const kind = feature.get("kind") as "marker" | "line" | "area" | undefined;
        const index = Math.max(0, vectorSource.getFeatures().indexOf(feature as Feature<Geometry>));
        const fallbackLabel = kind
          ? `${t(
              kind === "marker"
                ? "geographic.featureMarker"
                : kind === "line"
                  ? "geographic.featureLine"
                  : "geographic.featureArea",
            )} ${index + 1}`
          : undefined;
        return featureStyle(feature, fallbackLabel);
      },
      zIndex: 100,
      visible: true,
    });
    const map = new OlMap({
      target: mapElementRef.current,
      layers: [...mapLayers, vectorLayer],
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
      setEditingFeatureId(null);
      setRenameArmedFeatureId(null);
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
    tileLayersRef.current = tileLayers;
    let resizeObserver: ResizeObserver | null = null;
    if (embedded) {
      const fitEmbeddedExtent = () => {
        map.updateSize();
        const size = map.getSize();
        if (!size || vectorSource.isEmpty()) return;
        const extent = vectorSource.getExtent();
        if (!extent) return;
        map.getView().fit(extent, {
          size,
          padding: [24, 24, 24, 24],
          maxZoom: 18,
        });
      };
      window.requestAnimationFrame(fitEmbeddedExtent);
      resizeObserver = new ResizeObserver(fitEmbeddedExtent);
      resizeObserver.observe(mapElementRef.current);
    }
    return () => {
      resizeObserver?.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
      vectorSourceRef.current = null;
      vectorLayerRef.current = null;
      selectRef.current = null;
      modifyRef.current = null;
      tileLayersRef.current = new globalThis.Map();
    };
  }, [canUpdate, data.hallLayer, data.layers, data.view, embedded, syncHallLayer, t, updateDraft]);

  useEffect(() => {
    const map = mapRef.current;
    const source = vectorSourceRef.current;
    if (!map || !source || !canUpdate || workspaceMode !== "draw" || drawTool === "select") return;
    const type = drawTool === "marker" ? "Point" : drawTool === "line" ? "LineString" : "Polygon";
    const draw = new Draw({ source, type });
    draw.on("drawend", (event) => {
      event.feature.setId(crypto.randomUUID());
      const existingCount = latestDraftRef.current.hallLayer.features.filter(
        (feature) => feature.properties.kind === drawTool,
      ).length;
      const kindLabel = t(
        drawTool === "marker"
          ? "geographic.featureMarker"
          : drawTool === "line"
            ? "geographic.featureLine"
            : "geographic.featureArea",
      );
      event.feature.setProperties(initialProperties(drawTool, `${kindLabel} ${existingCount + 1}`));
      window.setTimeout(() => {
        syncHallLayer();
        selectRef.current?.getFeatures().clear();
        selectRef.current?.getFeatures().push(event.feature);
        setSelectedFeature(event.feature);
        setEditingFeatureId(String(event.feature.getId()));
        setRenameArmedFeatureId(null);
        setDrawTool("select");
      }, 0);
    });
    map.addInteraction(draw);
    return () => {
      map.removeInteraction(draw);
    };
  }, [canUpdate, drawTool, syncHallLayer, t, workspaceMode]);

  useEffect(() => {
    const editingSelection = canUpdate && workspaceMode === "draw" && drawTool === "select";
    selectRef.current?.setActive(editingSelection);
    modifyRef.current?.setActive(editingSelection);
    if (!editingSelection) {
      selectRef.current?.getFeatures().clear();
      setSelectedFeature(null);
      setEditingFeatureId(null);
      setRenameArmedFeatureId(null);
    }
  }, [canUpdate, drawTool, workspaceMode]);

  useEffect(() => {
    vectorLayerRef.current?.setVisible(hallLayerVisible);
  }, [hallLayerVisible]);

  useEffect(() => {
    draft.layers.forEach((layer, index) => {
      const tileLayer = tileLayersRef.current.get(layer.id);
      tileLayer?.setVisible(layer.visible);
      tileLayer?.setOpacity(layer.opacity);
      tileLayer?.setZIndex(index);
    });
  }, [draft.layers]);

  const save = useCallback(() => {
    if (!canUpdate) return Promise.resolve(true);
    if (conflictRef.current) return Promise.resolve(false);
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = async () => {
      while (true) {
        const payload = latestDraftRef.current;
        const signature = JSON.stringify(payload);
        if (signature === savedSignatureRef.current) {
          await useResourcesStore.getState().load();
          setSaveStatus("saved");
          return true;
        }
        onError(null);
        setSaveStatus("saving");
        try {
          const updated = await updateGeographicResource(resource.id, {
            view: payload.view,
            layers: payload.layers,
            hallLayer: payload.hallLayer,
            expectedVersion: latestVersionRef.current,
          });
          latestVersionRef.current = updated.version;
          savedSignatureRef.current = signature;
          setSavedSignature(signature);
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 409) {
            const latest = await getResourceDetailsSiren(resource.id).catch(() => null);
            if (latest?.data.resource.kind === "geographic") latestVersionRef.current = latest.data.resource.version;
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
  const setLayerVisibility = (id: GeographicLayerId, visible: boolean) => {
    const currentlyVisible = draft.layers.filter((layer) => layer.visible && layer.opacity > 0);
    if (!visible && currentlyVisible.length === 1 && currentlyVisible[0]?.id === id) return;
    updateLayers(draft.layers.map((layer) => (layer.id === id ? { ...layer, visible } : layer)));
  };
  const moveLayer = (sourceId: GeographicLayerId, targetId: GeographicLayerId) => {
    if (sourceId === targetId) return;
    const displayedLayers = [...draft.layers].reverse();
    const sourceIndex = displayedLayers.findIndex(({ id }) => id === sourceId);
    const targetIndex = displayedLayers.findIndex(({ id }) => id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = displayedLayers.splice(sourceIndex, 1);
    if (!moved) return;
    displayedLayers.splice(targetIndex, 0, moved);
    updateLayers(displayedLayers.reverse());
  };
  const deleteSelected = () => {
    if (!selectedFeature) return;
    vectorSourceRef.current?.removeFeature(selectedFeature);
    selectRef.current?.getFeatures().clear();
    setSelectedFeature(null);
    setEditingFeatureId(null);
    setRenameArmedFeatureId(null);
    syncHallLayer();
  };
  const renameFeature = async (id: string, label: string) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    const source = vectorSourceRef.current;
    if (!feature || !source) return false;
    feature.set("label", label);
    feature.changed();
    setSelectedFeature(feature);
    const nextDraft = { ...latestDraftRef.current, hallLayer: serializeHallLayer(source) };
    latestDraftRef.current = nextDraft;
    setDraft(nextDraft);
    return save();
  };
  const setFeatureVisibility = (id: string, visible: boolean) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    feature.set("visible", visible);
    feature.changed();
    if (!visible && selectedFeature?.getId() === id) {
      selectRef.current?.getFeatures().clear();
      setSelectedFeature(null);
      setEditingFeatureId(null);
      setRenameArmedFeatureId(null);
    }
    syncHallLayer();
  };
  const setFeatureColor = (id: string, color: GeographicColor) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    const kind = feature.get("kind") as "marker" | "line" | "area";
    const style = feature.get("style") as Record<string, unknown>;
    feature.set(
      "style",
      kind === "area" ? { ...style, fillColor: color, strokeColor: color } : { ...style, color },
    );
    feature.changed();
    syncHallLayer();
  };
  const retryConflict = () => {
    conflictRef.current = false;
    setConflict(false);
    void save();
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
    map.getView().fit(extent, {
      size,
      padding: [48, 48, 48, 48],
      maxZoom: 18,
      duration: 250,
    });
  };

  const changeWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    setDrawTool("select");
  };

  const selectFeature = (id: string) => {
    const feature = vectorSourceRef.current?.getFeatureById(id);
    if (!feature) return;
    setDrawTool("select");
    selectRef.current?.getFeatures().clear();
    selectRef.current?.getFeatures().push(feature);
    setSelectedFeature(feature);
    setEditingFeatureId(null);
    setRenameArmedFeatureId(null);
  };

  const startCompositionDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !compositionPanelRef.current) return;
    const panelRect = compositionPanelRef.current.getBoundingClientRect();
    const resourceRect = compositionPanelRef.current.parentElement?.getBoundingClientRect();
    if (!resourceRect) return;
    compositionDragOffsetRef.current = { x: event.clientX - panelRect.left, y: event.clientY - panelRect.top };
    updateCompositionLayout(() => ({
      left: panelRect.left - resourceRect.left,
      top: panelRect.top - resourceRect.top,
      width: panelRect.width,
      height: panelRect.height,
    }));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveComposition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = compositionDragOffsetRef.current;
    const panel = compositionPanelRef.current;
    const resource = panel?.parentElement;
    if (!offset || !panel || !resource) return;
    const resourceRect = resource.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    updateCompositionLayout((current) => ({
      left: Math.max(0, Math.min(event.clientX - resourceRect.left - offset.x, resourceRect.width - panelRect.width)),
      top: Math.max(0, Math.min(event.clientY - resourceRect.top - offset.y, resourceRect.height - panelRect.height)),
      width: current?.width ?? panelRect.width,
      height: current?.height ?? panelRect.height,
    }));
  };

  const stopCompositionDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    compositionDragOffsetRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const tools: Array<{ mode: DrawTool; icon: typeof PointerIcon; label: string }> = [
    { mode: "select", icon: PointerIcon, label: t("geographic.drawSelect") },
    { mode: "marker", icon: LocationIcon, label: t("geographic.drawMarker") },
    { mode: "line", icon: LineIcon, label: t("geographic.drawLine") },
    { mode: "area", icon: AreaIcon, label: t("geographic.drawArea") },
  ];

  const featureKindLabels = {
    marker: t("geographic.featureMarker"),
    line: t("geographic.featureLine"),
    area: t("geographic.featureArea"),
  };

  const featureIcons = { marker: LocationIcon, line: LineIcon, area: AreaIcon };
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
  const selectedFeatureId = selectedFeature ? String(selectedFeature.getId()) : null;
  const compositionStyle = compositionLayout
    ? ({
        left: compositionLayout.left,
        top: compositionLayout.top,
        width: compositionLayout.width,
        height: compositionLayout.height,
      } satisfies CSSProperties)
    : undefined;

  if (embedded) {
    return (
      <div className="geographic-resource" data-testid="geographic-resource-map" data-geographic-mode="embedded">
        <div ref={mapElementRef} className="geographic-map" />
      </div>
    );
  }

  return (
    <div className="geographic-resource" data-testid="geographic-resource-map">
      <div ref={mapElementRef} className="geographic-map" />
      <div className="geographic-mode-switch" role="group" aria-label={t("geographic.mode") }>
        <button
          type="button"
          className={workspaceMode === "map" ? "geographic-mode-active" : ""}
          data-testid="geographic-mode-map"
          aria-pressed={workspaceMode === "map"}
          onClick={() => changeWorkspaceMode("map")}
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
          onClick={() => changeWorkspaceMode("draw")}
        >
          <EditIcon />
          <span>{t("geographic.modeDraw")}</span>
        </button>
      </div>
      <div className="geographic-zoom-tools" role="group" aria-label={t("geographic.zoomControls")}>
        <button
          type="button"
          data-testid="geographic-zoom-in"
          aria-label={t("geographic.zoomIn")}
          title={t("geographic.zoomIn")}
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        <button
          type="button"
          data-testid="geographic-zoom-out"
          aria-label={t("geographic.zoomOut")}
          title={t("geographic.zoomOut")}
          onClick={() => changeZoom(-1)}
        >
          −
        </button>
      </div>
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
          <div className="geographic-layers-panel">
            <div
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
                onClick={() => changeWorkspaceMode(workspaceMode === "draw" ? "map" : "draw")}
              >
                <EditIcon />
              </button>
              <button
                type="button"
                className="geographic-layer-visible"
                aria-pressed={hallLayerVisible}
                aria-label={t("geographic.layerVisible").replace("{name}", t("geographic.drawingLayer"))}
                title={t("geographic.layerVisible").replace("{name}", t("geographic.drawingLayer"))}
                onClick={() => setHallLayerVisible((visible) => !visible)}
              >
                {hallLayerVisible ? <VisibleIcon /> : <HiddenIcon />}
              </button>
              <span className="geographic-layer-name">{t("geographic.drawingLayer")}</span>
              <span />
            </div>
            {[...draft.layers].reverse().map((layer) => {
              const name = geographicLayerOptions.find(({ id }) => id === layer.id)?.title ?? layer.id;
              return (
                <div
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
                    if (draggedLayerId) moveLayer(draggedLayerId, layer.id);
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
                    onClick={() => setLayerVisibility(layer.id, !layer.visible)}
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
                    onChange={(event) =>
                      updateLayers(
                        draft.layers.map((candidate) =>
                          candidate.id === layer.id
                            ? { ...candidate, opacity: Number(event.currentTarget.value) }
                            : candidate,
                        ),
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {workspaceMode === "draw" && canUpdate ? (
        <div
          ref={compositionPanelRef}
          className="geographic-composition"
          data-testid="geographic-composition"
          style={compositionStyle}
        >
          <div
            className="geographic-composition-header"
            data-testid="geographic-composition-drag"
            onPointerDown={startCompositionDrag}
            onPointerMove={moveComposition}
            onPointerUp={stopCompositionDrag}
            onPointerCancel={stopCompositionDrag}
          >
            <DragHandleIcon />
            <span>{t("geographic.composition")}</span>
          </div>
          <div className="geographic-composition-tools" role="toolbar" aria-label={t("geographic.compositionTools")}>
            {tools.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                className={drawTool === mode ? "geographic-tool-active" : ""}
                data-testid={`geographic-tool-${mode}`}
                aria-label={label}
                title={label}
                aria-pressed={drawTool === mode}
                onClick={() => setDrawTool(mode)}
              >
                <Icon />
              </button>
            ))}
            <button
              type="button"
              className="geographic-composition-fit"
              data-testid="geographic-composition-fit"
              aria-label={t("geographic.fitComposition")}
              title={t("geographic.fitComposition")}
              disabled={draft.hallLayer.features.length === 0}
              onClick={fitComposition}
            >
              <FitBoundsIcon />
            </button>
          </div>
          <div className="geographic-composition-list" aria-label={t("geographic.compositionFeatures")}>
            {draft.hallLayer.features.length === 0 ? (
              <p>{t("geographic.compositionEmpty")}</p>
            ) : (
              draft.hallLayer.features.map((feature, index) => {
                const Icon = featureIcons[feature.properties.kind];
                const selected = selectedFeatureId === feature.id;
                const fallbackName = `${featureKindLabels[feature.properties.kind]} ${index + 1}`;
                const visible = feature.properties.visible !== false;
                const color =
                  feature.properties.kind === "area"
                    ? feature.properties.style.fillColor
                    : feature.properties.style.color;
                return (
                  <div
                    key={feature.id}
                    className={`geographic-composition-feature${selected ? " geographic-composition-feature-selected" : ""}`}
                    data-testid={`geographic-composition-feature-${feature.id}`}
                  >
                    <button
                      type="button"
                      className="geographic-composition-feature-select"
                      aria-pressed={selected}
                      aria-label={feature.properties.label ?? fallbackName}
                      onClick={() => selectFeature(feature.id)}
                    >
                      <Icon />
                    </button>
                    <button
                      type="button"
                      className="geographic-composition-feature-visible"
                      aria-pressed={visible}
                      aria-label={t("geographic.featureVisible").replace(
                        "{name}",
                        feature.properties.label ?? fallbackName,
                      )}
                      title={t("geographic.featureVisible").replace(
                        "{name}",
                        feature.properties.label ?? fallbackName,
                      )}
                      onClick={() => setFeatureVisibility(feature.id, !visible)}
                    >
                      {visible ? <VisibleIcon /> : <HiddenIcon />}
                    </button>
                    <InlineRenameField
                      value={feature.properties.label ?? fallbackName}
                      editing={selected && editingFeatureId === feature.id}
                      onEditingChange={(editing) => {
                        if (!editing) {
                          setEditingFeatureId(null);
                          setRenameArmedFeatureId(null);
                        }
                      }}
                      onCommit={(label) => renameFeature(feature.id, label)}
                      label={t("geographic.featureLabel")}
                      className="geographic-composition-feature-input"
                      testId={`geographic-composition-feature-name-${feature.id}`}
                    >
                      <button
                        type="button"
                        className="geographic-composition-feature-name"
                        onClick={() => {
                          if (selected && renameArmedFeatureId === feature.id) {
                            setEditingFeatureId(feature.id);
                            setRenameArmedFeatureId(null);
                          } else {
                            selectFeature(feature.id);
                            setRenameArmedFeatureId(feature.id);
                          }
                        }}
                      >
                        {feature.properties.label ?? fallbackName}
                      </button>
                    </InlineRenameField>
                    <ColorPicker
                      className="geographic-composition-feature-color"
                      value={color}
                      presets={featureColorPresets}
                      ariaLabel={t("geographic.featureColor").replace(
                        "{name}",
                        feature.properties.label ?? fallbackName,
                      )}
                      customLabel={t("geographic.color.custom")}
                      onValueChange={(nextColor) => setFeatureColor(feature.id, nextColor as GeographicColor)}
                    />
                    {selected ? (
                      <button
                        type="button"
                        className="geographic-composition-feature-delete"
                        aria-label={t("geographic.deleteFeature")}
                        title={t("geographic.deleteFeature")}
                        onClick={deleteSelected}
                      >
                        <DeleteIcon />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
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
