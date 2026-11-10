import { type CSSProperties, type ReactElement, type SyntheticEvent, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover";

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

// biome-ignore-start lint/suspicious/noArrayIndexKey: two meanings may share one color.
/**
 * With `anchor`, the picker has no trigger of its own: the popover opens beside the anchor element and its
 * opening is controlled by `open` and `onOpenChange`. An empty `value` means that no colour is chosen.
 */
export function ColorPicker({
  value,
  presets,
  namedPresets,
  ariaLabel,
  customLabel,
  className,
  anchor,
  open: controlledOpen,
  clearLabel,
  testId,
  onOpenChange,
  onClear,
  onValueChange,
}: {
  value: string;
  presets: ColorPickerPreset[];
  namedPresets?: ColorPickerNamedPresets;
  ariaLabel: string;
  customLabel: string;
  className?: string;
  anchor?: ReactElement;
  open?: boolean;
  clearLabel?: string;
  testId?: string;
  onOpenChange?(open: boolean): void;
  onClear?(): void;
  onValueChange(value: string): void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [draftValue, setDraftValueState] = useState(value);
  const draftRef = useRef(value);
  const setDraftValue = (next: string) => {
    draftRef.current = next;
    setDraftValueState(next);
  };
  // The popover renders in a portal, but React still bubbles its events to the anchor's ancestors.
  const keepInside = (event: SyntheticEvent) => event.stopPropagation();
  const swatchStyle = (color: string) => ({ "--color-picker-value": color }) as CSSProperties;

  useEffect(() => {
    if (open) return;
    draftRef.current = value;
    setDraftValueState(value);
  }, [open, value]);

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftValue(value);
      setOpen(true);
      return;
    }
    setOpen(false);
    const chosen = draftRef.current;
    if (chosen !== value) onValueChange(chosen);
  };

  const clear = () => {
    setDraftValue(value);
    if (controlledOpen === undefined) setUncontrolledOpen(false);
    onOpenChange?.(false);
    onClear?.();
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      {anchor ? (
        <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      ) : (
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
      )}
      <PopoverContent
        className="color-picker-popover w-auto p-2"
        align={anchor ? "start" : "end"}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={keepInside}
        onPointerDown={keepInside}
        onKeyDown={keepInside}
        onContextMenu={keepInside}
        onDoubleClick={keepInside}
      >
        {namedPresets?.presets.length ? (
          <fieldset className="color-picker-named">
            <legend className="color-picker-named-title">{namedPresets.title}</legend>
            {namedPresets.presets.map((preset, index) => (
              <button
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
              data-testid={testId ? `${testId}-preset` : undefined}
              data-color={preset.value}
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
            value={draftValue || "#000000"}
            aria-label={customLabel}
            onChange={(event) => setDraftValue(event.currentTarget.value)}
          />
        </label>
        {onClear && clearLabel ? (
          <button
            type="button"
            className="color-picker-clear"
            data-testid={testId ? `${testId}-clear` : undefined}
            disabled={!value}
            onClick={clear}
          >
            {clearLabel}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
// biome-ignore-end lint/suspicious/noArrayIndexKey: two meanings may share one color.
