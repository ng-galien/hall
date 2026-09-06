import type { CouncilBusinessView } from "../../models/councilBusiness";
import { FolderOpenIcon } from "../../components/icons";

export function CouncilBusinessGlyph({ large }: { business: CouncilBusinessView; large?: boolean }) {
  return (
    <span
      className={`workspace-glyph workspace-glyph-business${large ? " workspace-glyph-large" : ""}`}
      aria-hidden="true"
    >
      <FolderOpenIcon />
    </span>
  );
}
