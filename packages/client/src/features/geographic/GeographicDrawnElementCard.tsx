import type { GeographicFeatureNote, SirenEntity } from "@hall/api-contract";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CenterOnFeatureIcon, CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { InlineResourceContent } from "../resources/InlineResourceContent";
import {
  canCreateGeographicFeatureNote,
  createGeographicDrawnElementNote,
  readGeographicDrawnElementNotes,
} from "./geographicLayersApi";
import { escapeBelongsToTarget } from "./useGeographicFeatureCard";

/** Notes of the drawn elements of a map, read through the map and created on demand. */
// @implements-requirement HALL-FR-DOC-430
export function useGeographicDrawnElementNotes(map: SirenEntity | null, onError: (error: ApiErrorCode | null) => void) {
  const [notes, setNotes] = useState<GeographicFeatureNote[] | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!map) return;
    let current = true;
    readGeographicDrawnElementNotes(map).then(
      (loaded) => {
        if (current) setNotes(loaded);
      },
      (failure: unknown) => onError(apiErrorCode(failure)),
    );
    return () => {
      current = false;
    };
  }, [map, onError]);
  const create = useCallback(
    async (elementId: string, beforeCreate: () => Promise<boolean>) => {
      if (!map) return;
      setCreating(true);
      try {
        if (!(await beforeCreate())) return;
        const created = await createGeographicDrawnElementNote(map, elementId);
        setNotes((state) => [...(state ?? []).filter(({ key }) => key !== created.key), created]);
      } catch (failure) {
        onError(apiErrorCode(failure));
      } finally {
        setCreating(false);
      }
    },
    [map, onError],
  );
  return { notes, creating, canCreate: canCreateGeographicFeatureNote(map), create };
}

/** Card of a selected drawn element: label, nature, centre action and its rich-text note. */
// @implements-requirement HALL-FR-DOC-430
export function GeographicDrawnElementCard({
  label,
  kindLabel,
  note,
  loading,
  canCreateNote,
  creatingNote,
  mapElement,
  onCreateNote,
  onCenter,
  onClose,
}: {
  label: string;
  kindLabel: string;
  note: GeographicFeatureNote | null;
  loading: boolean;
  canCreateNote: boolean;
  creatingNote: boolean;
  mapElement: HTMLElement | null;
  onCreateNote(): void;
  onCenter(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeBelongsToTarget(event.target, mapElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => window.removeEventListener("keydown", closeOnEscape, { capture: true });
  }, [mapElement, onClose]);
  return (
    <section className="geographic-feature-card" data-testid="geographic-drawn-element-card" aria-label={label}>
      <header className="geographic-feature-card-header">
        <div className="geographic-feature-card-title">
          <h2 data-testid="geographic-drawn-element-card-title">{label}</h2>
          <span>{kindLabel}</span>
        </div>
        <button
          type="button"
          className="geographic-feature-card-icon"
          data-testid="geographic-drawn-element-card-center"
          aria-label={t("geographicFeature.center")}
          title={t("geographicFeature.center")}
          onClick={onCenter}
        >
          <CenterOnFeatureIcon />
        </button>
        <button
          type="button"
          className="geographic-feature-card-icon"
          data-testid="geographic-drawn-element-card-close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="geographic-feature-card-body">
        <div className="geographic-feature-card-note" data-testid="geographic-drawn-element-card-note">
          {loading ? (
            <p className="geographic-feature-card-muted">{t("common.loading")}</p>
          ) : note ? (
            <InlineResourceContent key={note.noteId} resourceId={note.noteId} heading={t("geographicFeature.note")} />
          ) : canCreateNote ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={creatingNote}
              data-testid="geographic-drawn-element-note-create"
              onClick={onCreateNote}
            >
              {t("geographicFeature.addNote")}
            </Button>
          ) : (
            <p className="geographic-feature-card-muted">{t("geographicFeature.noNote")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
