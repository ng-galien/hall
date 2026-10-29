import { RepresentativeBodiesPage } from "../features/representative-bodies/RepresentativeBodiesPage";
import { delegationKind } from "../features/representative-bodies/representativeBodyKinds";
import { useCouncilDelegationsStore } from "../stores/councilDelegationsStore";

/** Représentations extérieures: the bodies where the municipality is represented. */
// @implements-requirement HALL-FR-DIR-140
export function CouncilDelegationsPage() {
  return <RepresentativeBodiesPage bodyKind={delegationKind} useStore={useCouncilDelegationsStore} />;
}
