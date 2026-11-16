import type { GeographicColor, GeographicLegendEntry } from "@hall/domain";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ColorPicker, type ColorPickerPreset } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { DeleteIcon, ListBulletedIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCrowdedLabels } from "./useCrowdedLabels";

// @implements-requirement HALL-FR-DOC-530
// biome-ignore-start lint/suspicious/noArrayIndexKey: ordered value pairs have no identity; label changes intentionally remount the input.
export function GeographicLegend({
  entries,
  actions,
}: {
  entries: readonly GeographicLegendEntry[];
  /** « Enregistrer ce cadrage », beside the button of the legend, by its icon only when `iconOnly`. */
  actions?: (iconOnly: boolean) => ReactNode;
}) {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const [open, setOpen] = useState(!phone);
  const contentId = useId();
  const [controls, setControls] = useState<HTMLDivElement | null>(null);
  const legendLabel = t("geographic.legend");
  const iconOnly = useCrowdedLabels(controls, actions ? `${legendLabel}\nactions` : legendLabel);
  const iconOnlyAttribute = iconOnly ? "true" : undefined;
  if (!entries.length)
    return actions ? (
      <div ref={setControls} className="geographic-legend-controls" data-icon-only={iconOnlyAttribute}>
        {actions(iconOnly)}
      </div>
    ) : null;
  return (
    <aside className="geographic-legend" data-testid="geographic-legend">
      <div ref={setControls} className="geographic-legend-controls" data-icon-only={iconOnlyAttribute}>
        <Button
          type="button"
          variant="plain"
          data-testid="geographic-legend-toggle"
          size={iconOnly ? "icon" : "default"}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={iconOnly ? legendLabel : undefined}
          title={iconOnly ? legendLabel : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <ListBulletedIcon />
          {iconOnly ? null : <span>{legendLabel}</span>}
        </Button>
        {actions?.(iconOnly)}
      </div>
      <div id={contentId} className="geographic-legend-content" data-testid="geographic-legend-content" hidden={!open}>
        <ul data-layout-flow>
          {entries.map(({ color, label }, index) => (
            <li key={`${index}:${color}:${label}`}>
              <span className="geographic-legend-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
// biome-ignore-end lint/suspicious/noArrayIndexKey: ordered value pairs have no identity; label changes intentionally remount the input.

// @implements-requirement HALL-FR-DOC-530
// biome-ignore-start lint/suspicious/noArrayIndexKey: ordered value pairs have no identity; label changes intentionally remount the input.
export function GeographicLegendEditor({
  entries,
  presets,
  onChange,
}: {
  entries: readonly GeographicLegendEntry[];
  presets: ColorPickerPreset[];
  onChange(entries: GeographicLegendEntry[]): void;
}) {
  const { t } = useI18n();
  const change = (index: number, entry: GeographicLegendEntry) =>
    onChange(entries.map((previous, at) => (at === index ? entry : previous)));
  return (
    <div className="geographic-legend-editor" data-testid="geographic-legend-editor">
      <div className="geographic-legend-editor-entries">
        {entries.map((entry, index) => (
          <div className="geographic-legend-editor-row" key={`${index}:${entry.label}`}>
            <ColorPicker
              value={entry.color}
              presets={presets}
              ariaLabel={t("geographic.featureColor", { name: entry.label })}
              customLabel={t("geographic.color.custom")}
              onValueChange={(color) => change(index, { ...entry, color: color as GeographicColor })}
            />
            <Input
              defaultValue={entry.label}
              maxLength={160}
              aria-label={t("geographic.legend.label")}
              data-testid={`geographic-legend-label-${index}`}
              onBlur={(event) => {
                const label = event.currentTarget.value.trim();
                if (label) change(index, { ...entry, label });
                else event.currentTarget.value = entry.label;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <Button
              size="icon"
              variant="plain"
              aria-label={t("geographic.legend.remove")}
              data-testid={`geographic-legend-remove-${index}`}
              onClick={() => onChange(entries.filter((_, at) => at !== index))}
            >
              <DeleteIcon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={entries.length >= 16}
          data-testid="geographic-legend-add"
          onClick={() =>
            onChange([
              ...entries,
              {
                color: (presets[0]?.value as GeographicColor) ?? "#102a83",
                label: `${t("geographic.legend")} ${entries.length + 1}`,
              },
            ])
          }
        >
          {t("geographic.legend.add")}
        </Button>
      </div>
    </div>
  );
}
// biome-ignore-end lint/suspicious/noArrayIndexKey: ordered value pairs have no identity; label changes intentionally remount the input.
