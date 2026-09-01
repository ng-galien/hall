import { type CouncilBusiness, councilBusinessHasDecision } from "@hall/domain";
import { GavelIcon, TextDocumentIcon } from "../../components/icons";

export function CouncilBusinessGlyph({ business, large }: { business: CouncilBusiness; large?: boolean }) {
  const withDecision = councilBusinessHasDecision(business);
  return (
    <span
      className={`workspace-glyph ${withDecision ? "workspace-glyph-decision" : "workspace-glyph-business"}${large ? " workspace-glyph-large" : ""}`}
      aria-hidden="true"
    >
      {withDecision ? <GavelIcon /> : <TextDocumentIcon />}
    </span>
  );
}
