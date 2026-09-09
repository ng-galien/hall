import type { CouncilBusinessView } from "../../models/councilBusiness";
import { CouncilBusinessIcon } from "../../components/icons";

export function CouncilBusinessGlyph({ large }: { business: CouncilBusinessView; large?: boolean }) {
  return (
    <span
      className={`workspace-glyph workspace-glyph-business${large ? " workspace-glyph-large" : ""}`}
      aria-hidden="true"
    >
      <CouncilBusinessIcon />
    </span>
  );
}
