import type { GeographicColor, GeographicLegendEntry, HallGeoJsonFeature, HallGeoJsonFeatureKind } from "@hall/domain";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ColorPicker, type ColorPickerPreset } from "@/components/ui/color-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import {
  CenterOnFeatureIcon,
  DeleteIcon,
  DragHandleIcon,
  EditIcon,
  HiddenIcon,
  LockIcon,
  MoreIcon,
  PointerIcon,
  RulerIcon,
  VisibleIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { GeographicLegendEditor } from "./GeographicLegend";
import { geographicFeatureKindPolicy, geographicFeatureKinds } from "./geographicFeatureKindPolicy";
import type { GeographicDrawTool } from "./useGeographicMapRuntime";
import { useGeographicPanelSize } from "./useGeographicPanelSize";

interface GeographicCompositionEditorProps {
  readOnly?: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  drawTool: GeographicDrawTool;
  features: readonly HallGeoJsonFeature[];
  selectedFeatureId: string | null;
  /** Drawing whose shape is being modified; its row carries the modification mark. */
  modifyingFeatureId: string | null;
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
  onFitFeature(id: string): void;
  onColor(id: string, color: GeographicColor): void;
  onDelete(id: string): void;
  measuredDrawingIds: ReadonlySet<string>;
  onDrawingMeasures(id: string, visible: boolean): void;
  onToggleModifying(id: string): void;
  legend: readonly GeographicLegendEntry[];
  onLegend(entries: GeographicLegendEntry[]): void;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
}

/** Renders and coordinates feature composition controls independently of OpenLayers. */
export function GeographicCompositionEditor({
  readOnly = false,
  panelRef,
  style,
  drawTool,
  features,
  selectedFeatureId,
  modifyingFeatureId,
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
  onFitFeature,
  onColor,
  onDelete,
  measuredDrawingIds,
  onDrawingMeasures,
  onToggleModifying,
  legend,
  onLegend,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: GeographicCompositionEditorProps) {
  const { t } = useI18n();
  const sizeStyle = useGeographicPanelSize("composition", panelRef);
  const tools: Array<{ mode: GeographicDrawTool; icon: typeof PointerIcon; label: string }> = [
    { mode: "select", icon: PointerIcon, label: t("geographic.drawSelect") },
    ...geographicFeatureKinds.map((kind) => ({
      mode: kind,
      icon: geographicFeatureKindPolicy[kind].Icon,
      label: t(geographicFeatureKindPolicy[kind].drawLabelKey),
    })),
  ];
  if (readOnly) {
    return (
      <div
        ref={panelRef}
        className="geographic-composition"
        data-testid="geographic-composition"
        style={{ ...style, ...sizeStyle }}
      >
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
        <ul className="geographic-composition-list" aria-label={t("geographic.compositionFeatures")}>
          {features.length === 0 ? (
            <li className="geographic-composition-empty">{t("geographic.compositionEmpty")}</li>
          ) : (
            features.map((feature, index) => {
              const Icon = geographicFeatureKindPolicy[feature.properties.kind].Icon;
              const label = feature.properties.label ?? `${featureKindLabels[feature.properties.kind]} ${index + 1}`;
              return (
                <li
                  key={feature.id}
                  className="geographic-composition-feature geographic-composition-feature-readonly"
                  data-testid={`geographic-composition-feature-${feature.id}`}
                >
                  <Icon />
                  <button
                    type="button"
                    className="geographic-composition-feature-name"
                    onClick={() => onSelect(feature.id)}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    className="geographic-composition-feature-fit"
                    aria-label={t("geographic.fitFeature").replace("{name}", label)}
                    title={t("geographic.fitFeature").replace("{name}", label)}
                    onClick={() => onFitFeature(feature.id)}
                  >
                    <CenterOnFeatureIcon />
                  </button>
                  {feature.properties.kind === "marker" ? null : (
                    <button
                      type="button"
                      className="geographic-composition-feature-measures"
                      data-testid={`geographic-composition-feature-measures-${feature.id}`}
                      aria-pressed={measuredDrawingIds.has(feature.id)}
                      aria-label={t(
                        measuredDrawingIds.has(feature.id)
                          ? "geographic.measure.hideDrawing"
                          : "geographic.measure.showDrawing",
                      ).replace("{name}", label)}
                      title={t(
                        measuredDrawingIds.has(feature.id)
                          ? "geographic.measure.hideDrawing"
                          : "geographic.measure.showDrawing",
                      ).replace("{name}", label)}
                      onClick={() => onDrawingMeasures(feature.id, !measuredDrawingIds.has(feature.id))}
                    >
                      <RulerIcon />
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>
    );
  }
  return (
    <div
      ref={panelRef}
      className="geographic-composition"
      data-testid="geographic-composition"
      style={{ ...style, ...sizeStyle }}
    >
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
      </div>
      <ul className="geographic-composition-list" aria-label={t("geographic.compositionFeatures")}>
        {features.length === 0 ? (
          <li className="geographic-composition-empty">{t("geographic.compositionEmpty")}</li>
        ) : (
          features.map((feature, index) => {
            const policy = geographicFeatureKindPolicy[feature.properties.kind];
            const Icon = policy.Icon;
            const selected = selectedFeatureId === feature.id;
            const modifying = modifyingFeatureId === feature.id;
            const fallbackName = `${featureKindLabels[feature.properties.kind]} ${index + 1}`;
            const visible = feature.properties.visible !== false;
            const color = policy.color(feature.properties.style);
            return (
              <li
                key={feature.id}
                className={`geographic-composition-feature${selected ? " geographic-composition-feature-selected" : ""}${modifying ? " geographic-composition-feature-modifying" : ""}`}
                data-testid={`geographic-composition-feature-${feature.id}`}
                data-modifying={modifying}
                aria-description={modifying ? t("geographic.shape.modifyingRow") : undefined}
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
                <button
                  type="button"
                  className="geographic-composition-feature-fit"
                  data-testid={`geographic-composition-feature-fit-${feature.id}`}
                  aria-label={t("geographic.fitFeature").replace("{name}", feature.properties.label ?? fallbackName)}
                  title={t("geographic.fitFeature").replace("{name}", feature.properties.label ?? fallbackName)}
                  onClick={() => onFitFeature(feature.id)}
                >
                  <CenterOnFeatureIcon />
                </button>
                <button
                  type="button"
                  className="geographic-composition-feature-modify"
                  data-testid={`geographic-composition-feature-modify-${feature.id}`}
                  aria-pressed={modifying}
                  aria-label={t(modifying ? "geographic.shape.stopModifying" : "geographic.shape.modify")}
                  title={t(modifying ? "geographic.shape.stopModifying" : "geographic.shape.modify")}
                  onClick={() => onToggleModifying(feature.id)}
                >
                  {modifying ? <EditIcon /> : <LockIcon />}
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
                {feature.properties.kind === "marker" ? (
                  <span className="geographic-composition-feature-measure-placeholder" aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    className="geographic-composition-feature-measures"
                    data-testid={`geographic-composition-feature-measures-${feature.id}`}
                    aria-pressed={measuredDrawingIds.has(feature.id)}
                    aria-label={t(
                      measuredDrawingIds.has(feature.id)
                        ? "geographic.measure.hideDrawing"
                        : "geographic.measure.showDrawing",
                    ).replace("{name}", feature.properties.label ?? fallbackName)}
                    title={t(
                      measuredDrawingIds.has(feature.id)
                        ? "geographic.measure.hideDrawing"
                        : "geographic.measure.showDrawing",
                    ).replace("{name}", feature.properties.label ?? fallbackName)}
                    onClick={() => onDrawingMeasures(feature.id, !measuredDrawingIds.has(feature.id))}
                  >
                    <RulerIcon />
                  </button>
                )}
                <ColorPicker
                  className="geographic-composition-feature-color"
                  value={color}
                  presets={colorPresets}
                  ariaLabel={t("geographic.featureColor").replace("{name}", feature.properties.label ?? fallbackName)}
                  customLabel={t("geographic.color.custom")}
                  onValueChange={(nextColor) => onColor(feature.id, nextColor as GeographicColor)}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="geographic-composition-feature-menu"
                      data-testid={`geographic-composition-feature-menu-${feature.id}`}
                      aria-label={t("geographic.drawingMenu").replace(
                        "{name}",
                        feature.properties.label ?? fallbackName,
                      )}
                    >
                      <MoreIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="geographic-composition-actions">
                    <DropdownMenuItem
                      variant="destructive"
                      data-testid={`geographic-composition-feature-delete-${feature.id}`}
                      onSelect={() => onDelete(feature.id)}
                    >
                      <DeleteIcon />
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })
        )}
      </ul>
      <GeographicLegendEditor entries={legend} presets={colorPresets} onChange={onLegend} />
    </div>
  );
}
