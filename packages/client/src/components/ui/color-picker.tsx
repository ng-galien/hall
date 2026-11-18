import { type CSSProperties, type ReactElement, type SyntheticEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/** Events of the gesture that follow a pointer pressed outside the picker. */
const outsideGestureEvents = ["mousedown", "click", "auxclick", "dblclick", "contextmenu"] as const;

/**
 * Stops the rest of a gesture begun outside the picker, so that the click that closes it neither selects nor opens the
 * element under the pointer. The gesture ends with its pointer release.
 */
function swallowOutsideGesture() {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of outsideGestureEvents) window.addEventListener(type, swallow, { capture: true });
  const release = () => {
    window.removeEventListener("pointerup", release, { capture: true });
    window.removeEventListener("pointercancel", release, { capture: true });
    window.setTimeout(() => {
      for (const type of outsideGestureEvents) window.removeEventListener(type, swallow, { capture: true });
    }, 0);
  };
  window.addEventListener("pointerup", release, { capture: true });
  window.addEventListener("pointercancel", release, { capture: true });
}

/** Delay before a colour of the custom field, which changes while it is dragged, is applied live. */
const liveCustomDelay = 300;

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
 * opening is controlled by `open` and `onOpenChange`; it stays open while the menu that opened it returns its
 * focus, and closes on Escape or a pointer outside. An empty `value` means that no colour is chosen. The popover
 * renders in a portal and stops its events, which React would otherwise bubble to the anchor's ancestors.
 * With `live`, each chosen colour is applied at once instead of when the picker closes. With `closeLabel`, the picker
 * has a close button, and a pointer pressed outside only closes it: a transparent layer under the picker receives the
 * press of any pointer, mouse, pen or touch, so that nothing under it is selected or opened.
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
  closeLabel,
  live = false,
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
  closeLabel?: string;
  live?: boolean;
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
  const appliedRef = useRef(value);
  const liveTimer = useRef<number | null>(null);
  const cancelLiveTimer = () => {
    if (liveTimer.current !== null) window.clearTimeout(liveTimer.current);
    liveTimer.current = null;
  };
  const applyDraft = () => {
    cancelLiveTimer();
    const chosen = draftRef.current;
    if (chosen === appliedRef.current) return;
    appliedRef.current = chosen;
    onValueChange(chosen);
  };
  const setDraftValue = (next: string, delay = 0) => {
    draftRef.current = next;
    setDraftValueState(next);
    if (!live) return;
    cancelLiveTimer();
    if (delay) liveTimer.current = window.setTimeout(applyDraft, delay);
    else applyDraft();
  };
  useEffect(
    () => () => {
      if (liveTimer.current !== null) window.clearTimeout(liveTimer.current);
    },
    [],
  );
  const keepInside = (event: SyntheticEvent) => event.stopPropagation();
  const swatchStyle = (color: string) => ({ "--color-picker-value": color }) as CSSProperties;

  useEffect(() => {
    if (open) return;
    draftRef.current = value;
    setDraftValueState(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) appliedRef.current = value;
  }, [open, value]);

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      appliedRef.current = value;
      draftRef.current = value;
      setDraftValueState(value);
      setOpen(true);
      return;
    }
    setOpen(false);
    if (live) {
      applyDraft();
      return;
    }
    const chosen = draftRef.current;
    if (chosen !== value) onValueChange(chosen);
  };

  const clear = () => {
    cancelLiveTimer();
    draftRef.current = value;
    setDraftValueState(value);
    if (controlledOpen === undefined) setUncontrolledOpen(false);
    onOpenChange?.(false);
    onClear?.();
  };

  const stopOutside = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      {closeLabel && open
        ? createPortal(
            <div
              className="color-picker-backdrop"
              aria-hidden="true"
              data-testid={testId ? `${testId}-backdrop` : undefined}
              onPointerDown={stopOutside}
              onMouseDown={stopOutside}
              onClick={(event) => {
                stopOutside(event);
                changeOpen(false);
              }}
              onDoubleClick={stopOutside}
              onContextMenu={(event) => {
                stopOutside(event);
                changeOpen(false);
              }}
            />,
            document.body,
          )
        : null}
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
        onFocusOutside={anchor ? (event) => event.preventDefault() : undefined}
        onPointerDownOutside={
          closeLabel
            ? (event) => {
                if (event.detail.originalEvent.pointerType !== "touch") swallowOutsideGesture();
              }
            : undefined
        }
      >
        {closeLabel ? (
          <div className="color-picker-header">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="plain"
                  size="icon"
                  aria-label={closeLabel}
                  data-testid={testId ? `${testId}-close` : undefined}
                  onClick={() => changeOpen(false)}
                >
                  <CloseIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{closeLabel}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
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
            onChange={(event) => setDraftValue(event.currentTarget.value, liveCustomDelay)}
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
