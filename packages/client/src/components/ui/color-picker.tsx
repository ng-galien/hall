import { type CSSProperties, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ColorPickerPreset {
  value: string;
  label: string;
}

// @implements-requirement HALL-FR-DOC-530
/** Colors that carry a meaning (a map legend): listed with their label above the plain swatches. */
export interface ColorPickerNamedPresets {
  title: string;
  presets: ColorPickerPreset[];
}

export function ColorPicker({
  value,
  presets,
  namedPresets,
  ariaLabel,
  customLabel,
  className,
  onValueChange,
}: {
  value: string;
  presets: ColorPickerPreset[];
  namedPresets?: ColorPickerNamedPresets;
  ariaLabel: string;
  customLabel: string;
  className?: string;
  onValueChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const swatchStyle = (color: string) => ({ "--color-picker-value": color }) as CSSProperties;

  useEffect(() => {
    if (!open) setDraftValue(value);
  }, [open, value]);

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftValue(value);
      setOpen(true);
      return;
    }
    setOpen(false);
    if (draftValue !== value) onValueChange(draftValue);
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("color-picker-trigger", className)}
          aria-label={ariaLabel}
          title={ariaLabel}
          style={swatchStyle(open ? draftValue : value)}
        >
          <span className="color-picker-swatch" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="color-picker-popover w-auto p-2" align="end">
        {namedPresets?.presets.length ? (
          <fieldset className="color-picker-named">
            <legend className="color-picker-named-title">{namedPresets.title}</legend>
            {namedPresets.presets.map((preset, index) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: two meanings may share one color.
                key={`${index}:${preset.value}`}
                type="button"
                className="color-picker-named-preset"
                aria-pressed={preset.value.toLowerCase() === draftValue.toLowerCase()}
                onClick={() => setDraftValue(preset.value)}
              >
                <span className="color-picker-swatch" style={swatchStyle(preset.value)} />
                <span className="color-picker-named-label">{preset.label}</span>
              </button>
            ))}
          </fieldset>
        ) : null}
        <fieldset className="color-picker-presets">
          <legend className="sr-only">{ariaLabel}</legend>
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className="color-picker-preset"
              aria-pressed={preset.value.toLowerCase() === draftValue.toLowerCase()}
              aria-label={preset.label}
              title={preset.label}
              style={swatchStyle(preset.value)}
              onClick={() => setDraftValue(preset.value)}
            >
              <span className="color-picker-swatch" />
            </button>
          ))}
        </fieldset>
        <label className="color-picker-custom">
          <span>{customLabel}</span>
          <input
            type="color"
            value={draftValue}
            aria-label={customLabel}
            onChange={(event) => setDraftValue(event.currentTarget.value)}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
