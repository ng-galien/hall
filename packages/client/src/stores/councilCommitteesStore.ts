import { type CouncilCommittee, findSirenAction, type SirenEntity } from "@hall/api-contract";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  addCommitteeMembership,
  archiveCouncilCommittee,
  type CouncilCommitteeDetails,
  createCouncilCommittee,
  endCommitteeMembership,
  getCouncilCommitteeSiren,
  listCouncilCommitteesSiren,
  updateCommitteeMembership,
  updateCouncilCommittee,
} from "../services/councilCommitteesApi";

interface CommitteeCapabilities {
  canUpdate: boolean;
  canArchive: boolean;
  canAddMembership: boolean;
}

interface CouncilCommitteesState {
  committees: CouncilCommittee[];
  details: Record<string, CouncilCommitteeDetails>;
  capabilities: Record<string, CommitteeCapabilities>;
  membershipRepresentations: Record<string, SirenEntity>;
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  clearError(): void;
  load(includeArchived?: boolean): Promise<void>;
  loadDetail(reference: string): Promise<CouncilCommitteeDetails | null>;
  loadAllDetails(): Promise<void>;
  create(input: Record<string, unknown>): Promise<CouncilCommittee | null>;
  update(reference: string, input: Record<string, unknown>): Promise<boolean>;
  archive(reference: string): Promise<boolean>;
  addMembership(reference: string, input: Record<string, unknown>): Promise<boolean>;
  updateMembership(reference: string, membershipId: string, input: Record<string, unknown>): Promise<boolean>;
  endMembership(reference: string, membershipId: string, endedOn: string): Promise<boolean>;
}

const emptyCapabilities: CommitteeCapabilities = {
  canUpdate: false,
  canArchive: false,
  canAddMembership: false,
};

export const useCouncilCommitteesStore = create<CouncilCommitteesState>((set, get) => ({
  committees: [],
  details: {},
  capabilities: {},
  membershipRepresentations: {},
  loading: false,
  error: null,
  canCreate: false,
  clearError() {
    set({ error: null });
  },
  async load(includeArchived = false) {
    set({ loading: true, error: null });
    try {
      const result = await listCouncilCommitteesSiren(includeArchived);
      set({
        committees: result.data,
        canCreate: Boolean(result.representation && findSirenAction(result.representation, "committee.create")),
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async loadDetail(reference) {
    try {
      const result = await getCouncilCommitteeSiren(reference);
      const committeeId = result.data.committee.id;
      const membershipRepresentations = Object.fromEntries(
        (result.membershipsRepresentation?.entities ?? []).flatMap((entity) => {
          if (!("properties" in entity) || !entity.class?.includes("committee-membership")) return [];
          const membershipId = entity.properties?.id;
          return typeof membershipId === "string" ? [[membershipId, entity]] : [];
        }),
      );
      set((state) => ({
        details: { ...state.details, [committeeId]: result.data },
        capabilities: {
          ...state.capabilities,
          [committeeId]: result.committeeRepresentation
            ? {
                canUpdate: Boolean(findSirenAction(result.committeeRepresentation, "committee.update")),
                canArchive: Boolean(findSirenAction(result.committeeRepresentation, "committee.archive")),
                canAddMembership: Boolean(findSirenAction(result.committeeRepresentation, "committee.add-membership")),
              }
            : emptyCapabilities,
        },
        membershipRepresentations: { ...state.membershipRepresentations, ...membershipRepresentations },
      }));
      return result.data;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async loadAllDetails() {
    await Promise.all(get().committees.map((committee) => get().loadDetail(committee.id)));
  },
  async create(input) {
    set({ error: null });
    try {
      const committee = await createCouncilCommittee(input);
      await get().load();
      return committee;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async update(reference, input) {
    set({ error: null });
    try {
      const updated = await updateCouncilCommittee(reference, input);
      set((state) => ({
        committees: state.committees.map((committee) => (committee.id === updated.id ? updated : committee)),
      }));
      await get().loadDetail(updated.id);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async archive(reference) {
    set({ error: null });
    try {
      await archiveCouncilCommittee(reference);
      await get().load(true);
      await get().loadDetail(reference);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async addMembership(reference, input) {
    set({ error: null });
    try {
      await addCommitteeMembership(reference, input);
      await get().loadDetail(reference);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async updateMembership(reference, membershipId, input) {
    set({ error: null });
    try {
      const representation = get().membershipRepresentations[membershipId];
      if (!representation) return false;
      await updateCommitteeMembership(representation, input);
      await get().loadDetail(reference);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async endMembership(reference, membershipId, endedOn) {
    set({ error: null });
    try {
      const representation = get().membershipRepresentations[membershipId];
      if (!representation) return false;
      await endCommitteeMembership(representation, endedOn);
      await get().loadDetail(reference);
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
