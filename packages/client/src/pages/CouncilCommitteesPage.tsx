import { RepresentativeBodiesPage } from "../features/representative-bodies/RepresentativeBodiesPage";
import { committeeKind } from "../features/representative-bodies/representativeBodyKinds";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";

export function CouncilCommitteesPage() {
  return <RepresentativeBodiesPage bodyKind={committeeKind} useStore={useCouncilCommitteesStore} />;
}
