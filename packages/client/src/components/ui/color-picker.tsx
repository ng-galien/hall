import { type CSSProperties, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ColorPickerPreset {
  value: string;
  label: string;
}

export function ColorPicker({
  value,
  presets,
  ariaLabel,
  customLabel,
  className,
  onValueChange,
}: {
  value: string;
  presets: ColorPickerPreset[];
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
        <div className="color-picker-presets" role="radiogroup" aria-label={ariaLabel}>
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className="color-picker-preset"
              role="radio"
              aria-checked={preset.value.toLowerCase() === draftValue.toLowerCase()}
              aria-label={preset.label}
              title={preset.label}
              style={swatchStyle(preset.value)}
              onClick={() => setDraftValue(preset.value)}
            >
              <span className="color-picker-swatch" />
            </button>
          ))}
        </div>
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
