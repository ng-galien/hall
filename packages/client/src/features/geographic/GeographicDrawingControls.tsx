import type { GeographicColor, GeographicLineArrows, HallGeoJsonFeatureKind } from "@hall/domain";
import { ColorPicker, type ColorPickerPreset } from "@/components/ui/color-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BackIcon,
  BothDirectionsIcon,
  DeleteIcon,
  EditIcon,
  ForwardIcon,
  HiddenIcon,
  MoreIcon,
  RuleIcon,
  RulerIcon,
  VisibleIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";

/** Controls of one drawing, shared by its Composition row and its card so both act the same way. */

export function DrawingColorControl({
  name,
  color,
  presets,
  legendPresets,
  className,
  onChange,
}: {
  name: string;
  color: string;
  presets: ColorPickerPreset[];
  legendPresets: ColorPickerPreset[];
  className: string;
  onChange(color: GeographicColor): void;
}) {
  const { t } = useI18n();
  return (
    <ColorPicker
      className={className}
      value={color}
      presets={presets}
      namedPresets={{ title: t("geographic.legend"), presets: legendPresets }}
      ariaLabel={t("geographic.featureColor").replace("{name}", name)}
      customLabel={t("geographic.color.custom")}
      onValueChange={(nextColor) => onChange(nextColor as GeographicColor)}
    />
  );
}

export type DrawingMenuPart = "menu" | "visible" | "modify" | "measures" | "arrows" | "delete";

const lineArrowChoices = [
  { value: "none", Icon: RuleIcon },
  { value: "forward", Icon: ForwardIcon },
  { value: "backward", Icon: BackIcon },
  { value: "both", Icon: BothDirectionsIcon },
] as const satisfies ReadonlyArray<{ value: GeographicLineArrows; Icon: typeof RuleIcon }>;

/**
 * The less frequent actions of a drawing gathered in one menu: show or hide it, modify its shape, show its measures
 * (lines and areas), choose the arrows of a line and delete it. The row and the card keep only the drawing's name, centre and color in view.
 */
// @implements-requirement HALL-FR-DOC-490
export function DrawingActionsMenu({
  name,
  className,
  testId,
  kind,
  visible,
  onVisibility,
  modifying,
  onToggleModifying,
  measuresActive,
  onMeasures,
  arrows = "none",
  onArrows,
  onDelete,
}: {
  name: string;
  className: string;
  testId(part: DrawingMenuPart): string;
  visible: boolean;
  onVisibility(visible: boolean): void;
  modifying: boolean;
  onToggleModifying(): void;
  /** The items follow the drawing's nature: measures for a line or an area, arrows for a line. */
  kind: HallGeoJsonFeatureKind;
  measuresActive: boolean;
  onMeasures(active: boolean): void;
  arrows?: GeographicLineArrows;
  onArrows(arrows: GeographicLineArrows): void;
  onDelete(): void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={className}
          data-testid={testId("menu")}
          aria-label={t("geographic.drawingMenu").replace("{name}", name)}
          title={t("geographic.drawingMenu").replace("{name}", name)}
        >
          <MoreIcon />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="geographic-composition-actions"
        // After an action the focus does not return to the menu button, so Escape keeps acting on the map.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          data-testid={testId("visible")}
          data-state={visible ? "on" : "off"}
          onSelect={() => onVisibility(!visible)}
        >
          {visible ? <HiddenIcon /> : <VisibleIcon />}
          {t(visible ? "geographic.drawing.hide" : "geographic.drawing.show")}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={testId("modify")}
          data-state={modifying ? "on" : "off"}
          onSelect={onToggleModifying}
        >
          <EditIcon />
          {t(modifying ? "geographic.shape.stopModifying" : "geographic.shape.modify")}
        </DropdownMenuItem>
        {kind !== "marker" ? (
          <DropdownMenuItem
            data-testid={testId("measures")}
            data-state={measuresActive ? "on" : "off"}
            onSelect={() => onMeasures(!measuresActive)}
          >
            <RulerIcon />
            {t(measuresActive ? "geographic.drawing.hideMeasures" : "geographic.drawing.showMeasures")}
          </DropdownMenuItem>
        ) : null}
        {kind === "line" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("geographic.arrows")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={arrows} onValueChange={(value) => onArrows(value as GeographicLineArrows)}>
              {lineArrowChoices.map(({ value, Icon }) => (
                <DropdownMenuRadioItem key={value} value={value} data-testid={`${testId("arrows")}-${value}`}>
                  <Icon />
                  {t(`geographic.arrows.${value}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" data-testid={testId("delete")} onSelect={onDelete}>
          <DeleteIcon />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
