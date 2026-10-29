import { useParams } from "react-router-dom";
import { RepresentativeBodyPage } from "../features/representative-bodies/RepresentativeBodyPage";
import { delegationKind } from "../features/representative-bodies/representativeBodyKinds";
import { useCouncilDelegationsStore } from "../stores/councilDelegationsStore";

/** One external representation: its body, purpose, dated primary and alternate representatives, and archive. */
// @implements-requirement HALL-FR-DIR-140
export function CouncilDelegationPage() {
  const { delegationId = "" } = useParams();
  return (
    <RepresentativeBodyPage bodyKind={delegationKind} useStore={useCouncilDelegationsStore} bodyId={delegationId} />
  );
}
