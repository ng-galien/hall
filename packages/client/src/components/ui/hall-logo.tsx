import { cn } from "@/lib/utils";

/**
 * The logo of Hall: the town hall in the blue of Hall on a bordered white square, in both themes. It is the drawing of
 * public/icons/favicon.svg, the tab and application icon; a test keeps the two identical.
 */
export function HallLogo({ className }: { className?: string }) {
  return (
    <svg
      className={cn("hall-logo", className)}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      data-testid="hall-logo"
    >
      <rect x="1" y="1" width="62" height="62" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M32 11 53 23H11Z" fill="#2457d6" />
      <path d="M13 25h38v4H13zM11 49h42v5H11z" fill="#2457d6" />
      <path d="M16 31h6v16h-6zM29 31h6v16h-6zM42 31h6v16h-6z" fill="#2457d6" />
    </svg>
  );
}
