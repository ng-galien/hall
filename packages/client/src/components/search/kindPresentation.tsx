import type { ReferenceEntityKind } from "@hall/domain";
import { referenceKindPresentations } from "../editor/referenceKindPresentation";

/* Central presentation contract for entity kinds appearing in search surfaces.
   Resources refine it with `ResourceGlyph` (per-tone icon and colour); everything else uses
   the kind icon and the `workspace-glyph-kind-*` tones below. One table, imported everywhere. */

/** Typed badge for a non-resource entity, visually aligned with `ResourceGlyph`. */
export function KindGlyph({ kind }: { kind: ReferenceEntityKind }) {
  const Icon = referenceKindPresentations[kind].icon;
  return (
    <span className={`workspace-glyph workspace-glyph-kind-${kind}`} aria-hidden="true">
      <Icon />
    </span>
  );
}
