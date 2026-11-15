import { cn } from "@/lib/utils";

/**
 * The logo of Hall: the town hall with blue, white and red pillars on a bordered square. Its colours are the
 * --hall-color-logo-* tokens, so it follows the theme of Hall: a white square in the light theme, a slate square in the
 * dark one. It is the drawing of public/icons/favicon.svg, which scripts/development/hall-icons.mjs draws; a test keeps
 * the two identical.
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
      <rect className="hall-logo-frame" x="1" y="1" width="62" height="62" rx="8" strokeWidth="2" />
      <path className="hall-logo-structure" d="M32 11 53 23H11Z" />
      <path className="hall-logo-structure" d="M13 25h38v4H13zM11 49h42v5H11z" />
      <rect className="hall-logo-left-pillar" x="16" y="31" width="6" height="16" />
      <rect className="hall-logo-middle-pillar" x="29" y="31" width="6" height="16" strokeWidth="1" />
      <rect className="hall-logo-right-pillar" x="42" y="31" width="6" height="16" />
    </svg>
  );
}
