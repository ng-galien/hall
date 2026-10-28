import type { GeographicFeatureNote, SirenEntity } from "@hall/api-contract";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { EditorImageUpload } from "../../components/editor/imageTransfer";
import { CenterOnFeatureIcon, CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { InlineResourceContent } from "../resources/InlineResourceContent";
import {
  canCreateGeographicFeatureNote,
  createGeographicDrawnElementNote,
  readGeographicDrawnElementNotes,
} from "./geographicLayersApi";
import { escapeBelongsToTarget, useAutomaticGeographicNote } from "./useGeographicFeatureCard";
import { useGeographicPanelSize } from "./useGeographicPanelSize";

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
        if (current)
          setNotes((state) => [
            ...loaded,
            ...(state ?? []).filter(({ key }) => !loaded.some((note) => note.key === key)),
          ]);
      },
      (failure: unknown) => onError(apiErrorCode(failure)),
    );
    return () => {
      current = false;
    };
  }, [map, onError]);
  const create = useCallback(
    async (elementId: string, beforeCreate: () => Promise<boolean>) => {
      if (!map) return false;
      setCreating(true);
      try {
        if (!(await beforeCreate())) return false;
        const created = await createGeographicDrawnElementNote(map, elementId);
        setNotes((state) => [...(state ?? []).filter(({ key }) => key !== created.key), created]);
        return true;
      } catch (failure) {
        onError(apiErrorCode(failure));
        return false;
      } finally {
        setCreating(false);
      }
    },
    [map, onError],
  );
  return { notes, creating, canCreate: canCreateGeographicFeatureNote(map), create };
}

/**
 * Card of a selected drawn element: label, nature, centre action, shape modification and its rich-text note; read-only
 * for a reader, with the measures of the drawing and its note without editing actions.
 */
// @implements-requirement HALL-FR-DOC-430
// @implements-requirement HALL-FR-DOC-450
// @implements-requirement HALL-FR-WSP-460
export function GeographicDrawnElementCard({
  label,
  kindLabel,
  kindIcon,
  actions,
  hidden = false,
  note,
  loading,
  canCreateNote,
  creatingNote,
  mapElement,
  modifying,
  onStopModifying,
  onCreateNote,
  onCenter,
  onClose,
  readOnly = false,
  measures,
  uploadPhoto,
}: {
  /** Imports a photo of the drawing as a file at the map's location; its note then shows it. */
  uploadPhoto?: EditorImageUpload;
  readOnly?: boolean;
  measures?: ReactNode;
  label: string;
  kindLabel: string;
  /** Geometry icon shown before the label; the nature itself is only announced to assistive technologies. */
  kindIcon: ReactNode;
  /** The drawing's color and actions menu, the same as its Composition row. */
  actions?: ReactNode;
  /** A hidden drawing shows its name struck through, as in Composition. */
  hidden?: boolean;
  note: GeographicFeatureNote | null;
  loading: boolean;
  canCreateNote: boolean;
  creatingNote: boolean;
  mapElement: HTMLElement | null;
  /** True while the shape of this drawing is being modified. */
  modifying: boolean;
  onStopModifying?(): void;
  onCreateNote?(): void;
  onCenter(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLElement | null>(null);
  const sizeStyle = useGeographicPanelSize(cardRef, "card");
  useAutomaticGeographicNote(!readOnly && !loading && !note && canCreateNote && !creatingNote, onCreateNote);
  useEffect(() => {
    const leaveOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeBelongsToTarget(event.target, mapElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (modifying) onStopModifying?.();
      else onClose();
    };
    window.addEventListener("keydown", leaveOnEscape, { capture: true });
    return () => window.removeEventListener("keydown", leaveOnEscape, { capture: true });
  }, [mapElement, modifying, onClose, onStopModifying]);
  return (
    <section
      ref={cardRef}
      className="geographic-feature-card geographic-feature-card-resizable"
      data-testid="geographic-drawn-element-card"
      style={sizeStyle}
      aria-label={label}
      contentEditable={readOnly ? false : undefined}
    >
      <header className="geographic-feature-card-header">
        <span className="geographic-feature-card-kind" role="img" aria-label={kindLabel} title={kindLabel}>
          {kindIcon}
        </span>
        <div className="geographic-feature-card-title">
          <h2
            data-testid="geographic-drawn-element-card-title"
            data-hidden={hidden}
            title={hidden ? t("geographic.drawing.hidden") : undefined}
          >
            {label}
          </h2>
        </div>
        {actions}
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
        {measures}
        {readOnly ? null : (
          <div
            className={`geographic-drawn-element-shape${modifying ? " geographic-drawn-element-shape-modifying" : ""}`}
            data-testid="geographic-drawn-element-shape"
            data-modifying={modifying}
          >
            {modifying ? (
              <p className="geographic-feature-card-muted" aria-live="polite">
                {t("geographic.shape.modifyingHint")}
              </p>
            ) : null}
          </div>
        )}
        <div className="geographic-feature-card-note" data-testid="geographic-drawn-element-card-note">
          {loading || creatingNote ? (
            <p className="geographic-feature-card-muted">{t("common.loading")}</p>
          ) : note ? (
            <InlineResourceContent
              key={note.noteId}
              resourceId={note.noteId}
              heading={t("geographicFeature.note")}
              compact={readOnly}
              readOnly={readOnly}
              uploadPhoto={uploadPhoto}
            />
          ) : (
            <p className="geographic-feature-card-muted">{t("geographicFeature.noNote")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
