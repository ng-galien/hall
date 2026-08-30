import type { CouncilBusiness } from "@hall/domain";
import { GavelIcon, TextDocumentIcon } from "../../components/icons";
import { hasCouncilDecision } from "./presentation";

export function CouncilBusinessGlyph({ business, large }: { business: CouncilBusiness; large?: boolean }) {
  const withDecision = hasCouncilDecision(business);
  return (
    <span
      className={`workspace-glyph ${withDecision ? "workspace-glyph-decision" : "workspace-glyph-business"}${large ? " workspace-glyph-large" : ""}`}
      aria-hidden="true"
    >
      {withDecision ? <GavelIcon /> : <TextDocumentIcon />}
    </span>
  );
}
