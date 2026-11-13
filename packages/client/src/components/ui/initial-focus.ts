const firstCommandSelector =
  'button:not([disabled]):not([data-help-hint]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([data-help-hint])';

/**
 * Focuses the first command or field of an opened window or panel, never an information icon: focus would open its
 * explanation, and Escape would then close the explanation instead of the window or panel.
 */
export function focusFirstCommand(event: Event) {
  event.preventDefault();
  const container = event.target instanceof HTMLElement ? event.target : null;
  const first = container?.querySelector<HTMLElement>(firstCommandSelector);
  (first ?? container)?.focus();
}
