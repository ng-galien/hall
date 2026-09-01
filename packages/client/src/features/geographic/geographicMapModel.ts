import {
  type GeographicLayer,
  type GeographicLayerId,
  type GeographicResourceData,
  geographicLayerOptions,
} from "@hall/domain";

export function completeGeographicLayers(layers: readonly GeographicLayer[]): GeographicLayer[] {
  const completed = [...layers];
  for (const { id } of geographicLayerOptions) {
    if (!completed.some((layer) => layer.id === id)) completed.push({ id, visible: false, opacity: 1 });
  }
  return completed;
}

export function normalizeGeographicData(data: GeographicResourceData): GeographicResourceData {
  return { ...data, layers: completeGeographicLayers(data.layers) };
}

export function geographicDataSignature(data: GeographicResourceData): string {
  return JSON.stringify(data);
}

export function setGeographicLayerVisibility(
  layers: readonly GeographicLayer[],
  id: GeographicLayerId,
  visible: boolean,
): GeographicLayer[] {
  const currentlyVisible = layers.filter((layer) => layer.visible && layer.opacity > 0);
  if (!visible && currentlyVisible.length === 1 && currentlyVisible[0]?.id === id) return [...layers];
  return layers.map((layer) => (layer.id === id ? { ...layer, visible } : layer));
}

export function reorderGeographicLayers(
  layers: readonly GeographicLayer[],
  sourceId: GeographicLayerId,
  targetId: GeographicLayerId,
): GeographicLayer[] {
  if (sourceId === targetId) return [...layers];
  const displayedLayers = [...layers].reverse();
  const sourceIndex = displayedLayers.findIndex(({ id }) => id === sourceId);
  const targetIndex = displayedLayers.findIndex(({ id }) => id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return [...layers];
  const [moved] = displayedLayers.splice(sourceIndex, 1);
  if (!moved) return [...layers];
  displayedLayers.splice(targetIndex, 0, moved);
  return displayedLayers.reverse();
}
