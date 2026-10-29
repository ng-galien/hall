import { committeeKind } from "../features/representative-bodies/representativeBodyKinds";
import { createRepresentativeBodiesStore } from "./representativeBodiesStore";

export const useCouncilCommitteesStore = createRepresentativeBodiesStore(committeeKind);
