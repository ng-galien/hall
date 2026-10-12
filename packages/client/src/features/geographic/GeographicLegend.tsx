import type { GeographicColor, GeographicLegendEntry } from "@hall/domain";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ColorPicker, type ColorPickerPreset } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { DeleteIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";

// @implements-requirement HALL-FR-DOC-530
export function GeographicLegend({
  entries,
  actions,
}: {
  entries: readonly GeographicLegendEntry[];
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const contentId = useId();
  if (!entries.length) return actions ?? null;
  return (
    <aside className="geographic-legend" data-testid="geographic-legend">
      <div className="geographic-legend-controls">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="geographic-legend-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
        >
          {t("geographic.legend")}
        </Button>
        {actions}
      </div>
      <div id={contentId} className="geographic-legend-content" data-testid="geographic-legend-content" hidden={!open}>
        <ul>
          {entries.map(({ color, label }, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered value pairs have no identity; label changes intentionally remount the input.
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

// @implements-requirement HALL-FR-DOC-530
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
          // biome-ignore lint/suspicious/noArrayIndexKey: ordered value pairs have no identity; label changes intentionally remount the input.
          <div className="geographic-legend-editor-row" key={`${index}:${entry.label}`}>
            <ColorPicker
              value={entry.color}
              presets={presets}
              ariaLabel={t("geographic.featureColor").replace("{name}", entry.label)}
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
              variant="ghost"
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
          variant="outline"
          size="sm"
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
