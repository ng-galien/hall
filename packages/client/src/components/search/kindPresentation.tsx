import { type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";
import { type ResourceTone, referenceKindNatures, ToneGlyph } from "../../features/documents/ResourceGlyph";
import type { SearchType } from "../../lib/search";
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

/** Type icon of each documentary search type: the icon of its documents in the lists, the file icon for any file. */
const searchTypeTones: Record<Exclude<SearchType, ReferenceEntityKind>, ResourceTone | null> = {
  text: "text",
  remote: "remote",
  spreadsheet: "spreadsheet",
  geographic: "geographic",
  geographicLayer: "geographicLayer",
  event: "event",
  legalReference: "legalReference",
  image: "image",
  document: null,
};

/** Icon of a search type in the filters, drawn like the type of a result. */
export function SearchTypeGlyph({ type }: { type: SearchType }) {
  if ((referenceEntityKinds as readonly string[]).includes(type))
    return <KindGlyph kind={type as ReferenceEntityKind} />;
  const tone = searchTypeTones[type as Exclude<SearchType, ReferenceEntityKind>];
  return tone ? <ToneGlyph tone={tone} /> : <KindGlyph kind="resource" />;
}
