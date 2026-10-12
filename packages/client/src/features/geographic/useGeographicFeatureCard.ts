import type { GeographicFeatureNote } from "@hall/api-contract";
import type OlMap from "ol/Map";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { escapeOwnedByControl } from "./geographicEscape";
import {
  canCreateGeographicFeatureNote,
  createGeographicFeatureNote,
  type MunicipalPropertyState,
  readGeographicFeatureNotes,
  readMunicipalProperty,
} from "./geographicLayersApi";
import type { GeographicFeatureDescription, GeographicFeatureSelection } from "./useGeographicOverlays";

/** Escape belongs to a field, an editor, a menu, or a dialog opened above the map, not to the dialog holding it. */
export function escapeBelongsToTarget(target: EventTarget | null, mapElement: HTMLElement | null): boolean {
  if (escapeOwnedByControl(target)) return true;
  if (!(target instanceof Element)) return false;
  const dialog = target.closest("[role='dialog']");
  return dialog !== null && !(mapElement && dialog.contains(mapElement));
}

/** Selection, municipal property list and display filter shared by the map, the Couches menu and the card. */
// @implements-requirement HALL-FR-DOC-380
// @implements-requirement HALL-FR-DOC-400
export function useGeographicFeatureState(mapId: string) {
  const [selection, setSelection] = useState<GeographicFeatureSelection | null>(null);
  const [municipal, setMunicipal] = useState<MunicipalPropertyState | null>(null);
  const [municipalOnlyLayerIds, setMunicipalOnlyLayerIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let current = true;
    readMunicipalProperty(mapId).then(
      (state) => {
        if (current) setMunicipal(state);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [mapId]);

  const municipalParcelIds = useMemo<ReadonlySet<string>>(() => new Set(municipal?.data.parcelIds ?? []), [municipal]);
  const setMunicipalOnly = useCallback((layerId: string, enabled: boolean) => {
    setMunicipalOnlyLayerIds((current) => {
      const next = new Set(current);
      if (enabled) next.add(layerId);
      else next.delete(layerId);
      return next;
    });
  }, []);

  return {
    selection,
    setSelection,
    municipal,
    setMunicipal,
    municipalParcelIds,
    municipalOnlyLayerIds,
    setMunicipalOnly,
    styleInputs: { municipalParcelIds, municipalOnlyLayerIds, selection },
  };
}

/** Opens the card on a data-layer feature click in map mode and closes it on an empty click or Escape. */
// @implements-requirement HALL-FR-DOC-380
export function useGeographicFeaturePicking(
  map: OlMap | null,
  enabled: boolean,
  pickFeature: (pixel: number[]) => GeographicFeatureSelection | null,
  selection: GeographicFeatureSelection | null,
  onSelect: (selection: GeographicFeatureSelection | null) => void,
) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => {
    if (!map) return;
    const listener = (event: { pixel: number[] }) => {
      if (!enabledRef.current) return;
      onSelect(pickFeature(event.pixel));
    };
    map.on("singleclick", listener);
    return () => map.un("singleclick", listener);
  }, [map, onSelect, pickFeature]);

  useEffect(() => {
    if (!enabled) onSelect(null);
  }, [enabled, onSelect]);

  useEffect(() => {
    if (!selection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeBelongsToTarget(event.target, map?.getTargetElement() ?? null)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onSelect(null);
    };
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => window.removeEventListener("keydown", closeOnEscape, { capture: true });
  }, [map, selection, onSelect]);
}

/** The note of the described feature, read through the layer and created on demand. */
// @implements-requirement HALL-FR-DOC-390
export function useGeographicFeatureNote(
  feature: GeographicFeatureDescription | null,
  onError: (error: ApiErrorCode | null) => void,
) {
  const [notesByLayer, setNotesByLayer] = useState<Record<string, GeographicFeatureNote[]>>({});
  const [creating, setCreating] = useState(false);
  const layer = feature?.layer ?? null;
  const layerId = feature?.layerId ?? null;
  const keyed = Boolean(feature?.key) && feature?.featureKey.kind !== "none";

  useEffect(() => {
    if (!layer || !layerId || !keyed) return;
    let current = true;
    readGeographicFeatureNotes(layer).then(
      (notes) => {
        if (current)
          setNotesByLayer((state) => ({
            ...state,
            [layerId]: [
              ...notes,
              ...(state[layerId] ?? []).filter(({ key }) => !notes.some((note) => note.key === key)),
            ],
          }));
      },
      (failure: unknown) => onError(apiErrorCode(failure)),
    );
    return () => {
      current = false;
    };
  }, [layer, layerId, keyed, onError]);

  const notes = layerId ? notesByLayer[layerId] : undefined;
  const note = feature?.key ? (notes?.find((candidate) => candidate.key === feature.key) ?? null) : null;
  const create = async () => {
    if (!feature || !layerId) return;
    setCreating(true);
    try {
      const created = await createGeographicFeatureNote(feature.layer, feature.position);
      setNotesByLayer((state) => ({ ...state, [layerId]: [...(state[layerId] ?? []), created] }));
    } catch (failure) {
      onError(apiErrorCode(failure));
    } finally {
      setCreating(false);
    }
  };
  return {
    note,
    loading: keyed && notes === undefined,
    canCreate: canCreateGeographicFeatureNote(layer),
    creating,
    create,
  };
}

/** Prepare a missing note once per mounted card, after its read has completed. Never creates for a reader. */
export function useAutomaticGeographicNote(ready: boolean, onCreate?: () => void) {
  const attempted = useRef(false);
  useEffect(() => {
    if (!ready || !onCreate || attempted.current) return;
    attempted.current = true;
    void onCreate();
  }, [ready, onCreate]);
}
