import { delegationKind } from "../features/representative-bodies/representativeBodyKinds";
import { createRepresentativeBodiesStore } from "./representativeBodiesStore";

// @implements-requirement HALL-FR-DIR-140
export const useCouncilDelegationsStore = createRepresentativeBodiesStore(delegationKind);
