import { CouncilBusinessIcon } from "../../components/icons";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { folderColorIconProps } from "../../pages/workspace/folderColor";

/** `color` is the shared colour of the business folder; only the icon takes it. */
export function CouncilBusinessGlyph({
  large,
  color,
}: {
  business: CouncilBusinessView;
  large?: boolean;
  color?: string | null;
}) {
  return (
    <span
      className={`workspace-glyph workspace-glyph-business${large ? " workspace-glyph-large" : ""}`}
      aria-hidden="true"
    >
      <CouncilBusinessIcon {...folderColorIconProps(color)} />
    </span>
  );
}
