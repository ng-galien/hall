import type { CouncilBusiness } from "@hall/domain";
import { GavelIcon, TextDocumentIcon } from "../../components/icons";
import { hasCouncilDecision } from "./presentation";

export function CouncilBusinessGlyph({ business }: { business: CouncilBusiness }) {
  const withDecision = hasCouncilDecision(business);
  return (
    <span
      className={`workspace-glyph ${withDecision ? "workspace-glyph-decision" : "workspace-glyph-business"}`}
      aria-hidden="true"
    >
      {withDecision ? <GavelIcon /> : <TextDocumentIcon />}
    </span>
  );
}
