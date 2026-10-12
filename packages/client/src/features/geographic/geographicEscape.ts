const OWN_ESCAPE_SELECTOR =
  "input, textarea, select, [data-radix-popper-content-wrapper], [role='menu'], [role='listbox']";

/**
 * Escape belongs to a field, an editor, a menu or a list that handles it itself. A menu that has just closed keeps the
 * focus while its exit animation runs: Escape then belongs to the map again.
 */
export function escapeOwnedByControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.closest("[role='menu'][data-state='closed']") !== null) return false;
  return target.closest(OWN_ESCAPE_SELECTOR) !== null;
}
