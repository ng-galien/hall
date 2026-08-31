import type { ReferenceKind } from "@hall/templating";
import { CalendarIcon, FileIcon, GavelIcon, MemberIcon, TextDocumentIcon } from "../icons";

/* Central presentation contract for entity kinds appearing in search surfaces.
   Resources refine it with `ResourceGlyph` (per-tone icon and colour); everything else uses
   the kind icon and the `workspace-glyph-kind-*` tones below. One table, imported everywhere. */

export const kindIcons: Record<ReferenceKind, typeof MemberIcon> = {
  member: MemberIcon,
  resource: FileIcon,
  councilBusiness: TextDocumentIcon,
  decision: GavelIcon,
  meeting: CalendarIcon,
};

/** Typed badge for a non-resource entity, visually aligned with `ResourceGlyph`. */
export function KindGlyph({ kind }: { kind: ReferenceKind }) {
  const Icon = kindIcons[kind];
  return (
    <span className={`workspace-glyph workspace-glyph-kind-${kind}`} aria-hidden="true">
      <Icon />
    </span>
  );
}
