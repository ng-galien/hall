import type { GeographicColor, GeographicResourceData, HallGeoJsonFeatureKind } from "@hall/domain";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ColorPicker, type ColorPickerPreset } from "@/components/ui/color-picker";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import {
  DeleteIcon,
  DragHandleIcon,
  FitBoundsIcon,
  HiddenIcon,
  PointerIcon,
  VisibleIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { geographicFeatureKindPolicy, geographicFeatureKinds } from "./geographicFeatureKindPolicy";
import type { GeographicDrawTool } from "./useGeographicMapRuntime";

interface GeographicCompositionEditorProps {
  panelRef: React.RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  drawTool: GeographicDrawTool;
  features: GeographicResourceData["hallLayer"]["features"];
  selectedFeatureId: string | null;
  editingFeatureId: string | null;
  renameArmedFeatureId: string | null;
  featureKindLabels: Record<HallGeoJsonFeatureKind, string>;
  colorPresets: ColorPickerPreset[];
  onDrawTool(tool: GeographicDrawTool): void;
  onSelect(id: string): void;
  onEditingFeature(id: string | null): void;
  onRenameArmedFeature(id: string | null): void;
  onRename(id: string, label: string): Promise<boolean>;
  onVisibility(id: string, visible: boolean): void;
  onColor(id: string, color: GeographicColor): void;
  onDelete(): void;
  onFit(): void;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
}

/** Renders and coordinates feature composition controls independently of OpenLayers. */
export function GeographicCompositionEditor({
  panelRef,
  style,
  drawTool,
  features,
  selectedFeatureId,
  editingFeatureId,
  renameArmedFeatureId,
  featureKindLabels,
  colorPresets,
  onDrawTool,
  onSelect,
  onEditingFeature,
  onRenameArmedFeature,
  onRename,
  onVisibility,
  onColor,
  onDelete,
  onFit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: GeographicCompositionEditorProps) {
  const { t } = useI18n();
  const tools: Array<{ mode: GeographicDrawTool; icon: typeof PointerIcon; label: string }> = [
    { mode: "select", icon: PointerIcon, label: t("geographic.drawSelect") },
    ...geographicFeatureKinds.map((kind) => ({
      mode: kind,
      icon: geographicFeatureKindPolicy[kind].Icon,
      label: t(geographicFeatureKindPolicy[kind].drawLabelKey),
    })),
  ];
  return (
    <div ref={panelRef} className="geographic-composition" data-testid="geographic-composition" style={style}>
      <div
        className="geographic-composition-header"
        data-testid="geographic-composition-drag"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
            onClick={() => onDrawTool(mode)}
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
          disabled={features.length === 0}
          onClick={onFit}
        >
          <FitBoundsIcon />
        </button>
      </div>
      <ul className="geographic-composition-list" aria-label={t("geographic.compositionFeatures")}>
        {features.length === 0 ? (
          <li className="geographic-composition-empty">{t("geographic.compositionEmpty")}</li>
        ) : (
          features.map((feature, index) => {
            const policy = geographicFeatureKindPolicy[feature.properties.kind];
            const Icon = policy.Icon;
            const selected = selectedFeatureId === feature.id;
            const fallbackName = `${featureKindLabels[feature.properties.kind]} ${index + 1}`;
            const visible = feature.properties.visible !== false;
            const color = policy.color(feature.properties.style);
            return (
              <li
                key={feature.id}
                className={`geographic-composition-feature${selected ? " geographic-composition-feature-selected" : ""}`}
                data-testid={`geographic-composition-feature-${feature.id}`}
              >
                <button
                  type="button"
                  className="geographic-composition-feature-select"
                  aria-pressed={selected}
                  aria-label={feature.properties.label ?? fallbackName}
                  onClick={() => onSelect(feature.id)}
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
                  title={t("geographic.featureVisible").replace("{name}", feature.properties.label ?? fallbackName)}
                  onClick={() => onVisibility(feature.id, !visible)}
                >
                  {visible ? <VisibleIcon /> : <HiddenIcon />}
                </button>
                <InlineRenameField
                  value={feature.properties.label ?? fallbackName}
                  editing={selected && editingFeatureId === feature.id}
                  onEditingChange={(editing) => {
                    if (!editing) {
                      onEditingFeature(null);
                      onRenameArmedFeature(null);
                    }
                  }}
                  onCommit={(label) => onRename(feature.id, label)}
                  label={t("geographic.featureLabel")}
                  className="geographic-composition-feature-input"
                  testId={`geographic-composition-feature-name-${feature.id}`}
                >
                  <button
                    type="button"
                    className="geographic-composition-feature-name"
                    onClick={() => {
                      if (selected && renameArmedFeatureId === feature.id) {
                        onEditingFeature(feature.id);
                        onRenameArmedFeature(null);
                      } else {
                        onSelect(feature.id);
                        onRenameArmedFeature(feature.id);
                      }
                    }}
                  >
                    {feature.properties.label ?? fallbackName}
                  </button>
                </InlineRenameField>
                <ColorPicker
                  className="geographic-composition-feature-color"
                  value={color}
                  presets={colorPresets}
                  ariaLabel={t("geographic.featureColor").replace("{name}", feature.properties.label ?? fallbackName)}
                  customLabel={t("geographic.color.custom")}
                  onValueChange={(nextColor) => onColor(feature.id, nextColor as GeographicColor)}
                />
                {selected ? (
                  <button
                    type="button"
                    className="geographic-composition-feature-delete"
                    aria-label={t("geographic.deleteFeature")}
                    title={t("geographic.deleteFeature")}
                    onClick={onDelete}
                  >
                    <DeleteIcon />
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
