import type { ReferenceEntityKind } from "@hall/domain";
import { referenceKindNatures } from "../../features/documents/ResourceGlyph";
import { folderColorIconProps } from "../../pages/workspace/folderColor";
import { referenceKindPresentations } from "../editor/referenceKindPresentation";
import { ListRowIcon } from "../ui/list-row";

/* Central presentation contract for entity kinds appearing in search surfaces.
   Resources refine it with `ResourceGlyph` (per-tone icon and nature); everything else uses
   the kind icon and the nature of its kind. One table, imported everywhere. */

/** Type icon of a non-resource entity, drawn like `ResourceGlyph`; `color` is the shared colour of a business folder. */
export function KindGlyph({ kind, color }: { kind: ReferenceEntityKind; color?: string | null }) {
  const Icon = referenceKindPresentations[kind].icon;
  return (
    <ListRowIcon nature={referenceKindNatures[kind]}>
      <Icon {...folderColorIconProps(color)} />
    </ListRowIcon>
  );
}
