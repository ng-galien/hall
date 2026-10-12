import type {
  GeographicColor,
  GeographicLegendEntry,
  GeographicLineArrows,
  HallGeoJsonFeature,
  HallGeoJsonFeatureKind,
} from "@hall/domain";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useState } from "react";
import type { ColorPickerPreset } from "@/components/ui/color-picker";
import { InlineRenameField } from "@/components/ui/inline-rename-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CenterOnFeatureIcon, DragHandleIcon, PointerIcon, RulerIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { DrawingActionsMenu, DrawingColorControl } from "./GeographicDrawingControls";
import { GeographicLegendEditor } from "./GeographicLegend";
import { GeographicPanelHeader } from "./GeographicPanelHeader";
import {
  geographicDrawingName,
  geographicFeatureKindPolicy,
  geographicFeatureKinds,
} from "./geographicFeatureKindPolicy";
import type { GeographicDrawTool } from "./useGeographicMapRuntime";
import { useGeographicPanelSize } from "./useGeographicPanelSize";

interface GeographicCompositionEditorProps {
  readOnly?: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
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
  onArrows(id: string, arrows: GeographicLineArrows): void;
  onMoveFeature(sourceId: string, targetId: string): void;
  measuredDrawingIds: ReadonlySet<string>;
  onDrawingMeasures(id: string, visible: boolean): void;
  onToggleModifying(id: string): void;
  legend: readonly GeographicLegendEntry[];
  legendColorPresets?: ColorPickerPreset[];
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
  onArrows,
  onMoveFeature,
  measuredDrawingIds,
  onDrawingMeasures,
  onToggleModifying,
  legend,
  legendColorPresets = [],
  onLegend,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: GeographicCompositionEditorProps) {
  const { t } = useI18n();
  const sizeStyle = useGeographicPanelSize(panelRef);
  const tools: Array<{ mode: GeographicDrawTool; icon: typeof PointerIcon; label: string }> = [
    { mode: "select", icon: PointerIcon, label: t("geographic.drawSelect") },
    ...geographicFeatureKinds.map((kind) => ({
      mode: kind,
      icon: geographicFeatureKindPolicy[kind].Icon,
      label: t(geographicFeatureKindPolicy[kind].drawLabelKey),
    })),
  ];
  const [draggedFeatureId, setDraggedFeatureId] = useState<string | null>(null);
  const [dropTargetFeatureId, setDropTargetFeatureId] = useState<string | null>(null);
  if (readOnly) {
    return (
      <div
        ref={panelRef as React.RefObject<HTMLDivElement | null>}
        className="geographic-composition"
        data-testid="geographic-composition"
        style={{ ...style, ...sizeStyle }}
      >
        <GeographicPanelHeader
          testId="geographic-composition-drag"
          drag={{ onPointerDown, onPointerMove, onPointerUp }}
        >
          <span className="geographic-panel-title">
            {t("geographic.modeDraw")}
            {features.length ? <span className="geographic-composition-tab-count">{features.length}</span> : null}
          </span>
        </GeographicPanelHeader>
        <ul className="geographic-composition-list" aria-label={t("geographic.compositionFeatures")}>
          {features.length === 0 ? (
            <li className="geographic-composition-empty">{t("geographic.compositionEmpty")}</li>
          ) : (
            features.map((feature, index) => {
              const Icon = geographicFeatureKindPolicy[feature.properties.kind].Icon;
              const label = geographicDrawingName(feature, index, featureKindLabels);
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
      ref={panelRef as React.RefObject<HTMLDivElement | null>}
      className="geographic-composition"
      data-testid="geographic-composition"
      style={{ ...style, ...sizeStyle }}
    >
      <Tabs className="geographic-panel-tabs" defaultValue="elements">
        <GeographicPanelHeader
          testId="geographic-composition-drag"
          drag={{ onPointerDown, onPointerMove, onPointerUp }}
        >
          <TabsList className="geographic-panel-tab-list" aria-label={t("geographic.composition")}>
            <TabsTrigger value="elements" data-testid="geographic-composition-tab-elements">
              {t("geographic.modeDraw")}
              {features.length ? <span className="geographic-composition-tab-count">{features.length}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="legend" data-testid="geographic-composition-tab-legend">
              {t("geographic.legend")}
              {legend.length ? <span className="geographic-composition-tab-count">{legend.length}</span> : null}
            </TabsTrigger>
          </TabsList>
        </GeographicPanelHeader>
        <TabsContent
          value="elements"
          className="geographic-composition-tab"
          data-testid="geographic-composition-panel-elements"
        >
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
                const name = geographicDrawingName(feature, index, featureKindLabels);
                const visible = feature.properties.visible !== false;
                const color = policy.color(feature.properties.style);
                return (
                  <li
                    key={feature.id}
                    className={`geographic-composition-feature${selected ? " geographic-composition-feature-selected" : ""}${modifying ? " geographic-composition-feature-modifying" : ""}${draggedFeatureId === feature.id ? " geographic-composition-feature-dragging" : ""}${dropTargetFeatureId === feature.id && draggedFeatureId !== feature.id ? " geographic-composition-feature-drop-target" : ""}`}
                    data-testid={`geographic-composition-feature-${feature.id}`}
                    data-modifying={modifying}
                    data-hidden={!visible}
                    aria-description={modifying ? t("geographic.shape.modifyingRow") : undefined}
                    onDragOver={(event) => {
                      if (!draggedFeatureId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetFeatureId(feature.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedFeatureId) onMoveFeature(draggedFeatureId, feature.id);
                      setDraggedFeatureId(null);
                      setDropTargetFeatureId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="geographic-composition-feature-drag"
                      draggable
                      data-testid={`geographic-composition-feature-drag-${feature.id}`}
                      aria-label={t("geographic.featureDrag").replace("{name}", name)}
                      title={t("geographic.featureDrag").replace("{name}", name)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", feature.id);
                        setDraggedFeatureId(feature.id);
                      }}
                      onDragEnd={() => {
                        setDraggedFeatureId(null);
                        setDropTargetFeatureId(null);
                      }}
                    >
                      <DragHandleIcon />
                    </button>
                    <button
                      type="button"
                      className="geographic-composition-feature-select"
                      aria-pressed={selected}
                      aria-label={name}
                      onClick={() => onSelect(feature.id)}
                    >
                      <Icon />
                    </button>
                    <InlineRenameField
                      value={name}
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
                        title={visible ? undefined : t("geographic.drawing.hidden")}
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
                        {name}
                      </button>
                    </InlineRenameField>
                    <button
                      type="button"
                      className="geographic-composition-feature-fit"
                      data-testid={`geographic-composition-feature-fit-${feature.id}`}
                      aria-label={t("geographic.fitFeature").replace("{name}", name)}
                      title={t("geographic.fitFeature").replace("{name}", name)}
                      onClick={() => onFitFeature(feature.id)}
                    >
                      <CenterOnFeatureIcon />
                    </button>
                    <DrawingColorControl
                      name={name}
                      color={color}
                      presets={colorPresets}
                      legendPresets={legendColorPresets}
                      className="geographic-composition-feature-color"
                      onChange={(nextColor) => onColor(feature.id, nextColor)}
                    />
                    <DrawingActionsMenu
                      name={name}
                      className="geographic-composition-feature-menu"
                      testId={(part) => `geographic-composition-feature-${part}-${feature.id}`}
                      kind={feature.properties.kind}
                      visible={visible}
                      onVisibility={(next) => onVisibility(feature.id, next)}
                      modifying={modifying}
                      onToggleModifying={() => onToggleModifying(feature.id)}
                      measuresActive={measuredDrawingIds.has(feature.id)}
                      onMeasures={(active) => onDrawingMeasures(feature.id, active)}
                      arrows={feature.properties.kind === "line" ? feature.properties.style.arrows : undefined}
                      onArrows={(arrows) => onArrows(feature.id, arrows)}
                      onDelete={() => onDelete(feature.id)}
                    />
                  </li>
                );
              })
            )}
          </ul>
        </TabsContent>
        <TabsContent
          value="legend"
          className="geographic-composition-tab"
          data-testid="geographic-composition-panel-legend"
        >
          <GeographicLegendEditor entries={legend} presets={colorPresets} onChange={onLegend} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
