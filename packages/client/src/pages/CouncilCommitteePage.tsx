import { useParams } from "react-router-dom";
import { CouncilCommitteeBusinesses } from "../features/council-business/CouncilCommitteeBusinesses";
import { RepresentativeBodyPage } from "../features/representative-bodies/RepresentativeBodyPage";
import { committeeKind } from "../features/representative-bodies/representativeBodyKinds";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";

export function CouncilCommitteePage() {
  const { committeeId = "" } = useParams();
  return (
    <RepresentativeBodyPage
      bodyKind={committeeKind}
      useStore={useCouncilCommitteesStore}
      bodyId={committeeId}
      related={(id) => <CouncilCommitteeBusinesses committeeId={id} />}
    />
  );
}
