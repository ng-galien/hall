import { findSirenAction, type SirenEntity } from "@hall/api-contract";
import { create } from "zustand";
import type { RepresentativeBodyKind } from "../features/representative-bodies/representativeBodyKinds";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  type RepresentativeBody,
  type RepresentativeBodyDetails,
  representativeBodiesApi,
} from "../services/representativeBodiesApi";

export interface BodyCapabilities {
  canUpdate: boolean;
  canArchive: boolean;
  canAddMembership: boolean;
}

export interface RepresentativeBodiesState {
  bodies: RepresentativeBody[];
  details: Record<string, RepresentativeBodyDetails>;
  capabilities: Record<string, BodyCapabilities>;
  membershipRepresentations: Record<string, SirenEntity>;
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  clearError(): void;
  load(includeArchived?: boolean): Promise<void>;
  loadDetail(reference: string): Promise<RepresentativeBodyDetails | null>;
  loadAllDetails(): Promise<void>;
  create(input: Record<string, unknown>): Promise<RepresentativeBody | null>;
  update(reference: string, input: Record<string, unknown>): Promise<boolean>;
  archive(reference: string): Promise<boolean>;
  addMembership(reference: string, input: Record<string, unknown>): Promise<boolean>;
  updateMembership(reference: string, membershipId: string, input: Record<string, unknown>): Promise<boolean>;
  endMembership(reference: string, membershipId: string, endedOn: string): Promise<boolean>;
}

const emptyCapabilities: BodyCapabilities = { canUpdate: false, canArchive: false, canAddMembership: false };

/** One store per kind of body: its list, each opened body with its memberships, and the actions Siren offers. */
export function createRepresentativeBodiesStore(bodyKind: RepresentativeBodyKind) {
  const api = representativeBodiesApi(bodyKind);
  return create<RepresentativeBodiesState>((set, get) => {
    const attempt = async (work: () => Promise<boolean>) => {
      set({ error: null });
      try {
        return await work();
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return false;
      }
    };
    return {
      bodies: [],
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
          const result = await api.list(includeArchived);
          set({
            bodies: result.data,
            canCreate: Boolean(
              result.representation && findSirenAction(result.representation, bodyKind.actions.create),
            ),
            loading: false,
          });
        } catch (error) {
          set({ error: apiErrorCode(error), loading: false });
        }
      },
      async loadDetail(reference) {
        try {
          const result = await api.get(reference);
          const bodyId = result.data.body.id;
          const membershipRepresentations = Object.fromEntries(
            (result.membershipsRepresentation?.entities ?? []).flatMap((entity) => {
              if (!("properties" in entity) || !entity.class?.includes(bodyKind.membershipClass)) return [];
              const membershipId = entity.properties?.id;
              return typeof membershipId === "string" ? [[membershipId, entity]] : [];
            }),
          );
          set((state) => ({
            details: { ...state.details, [bodyId]: result.data },
            capabilities: {
              ...state.capabilities,
              [bodyId]: result.bodyRepresentation
                ? {
                    canUpdate: Boolean(findSirenAction(result.bodyRepresentation, bodyKind.actions.update)),
                    canArchive: Boolean(findSirenAction(result.bodyRepresentation, bodyKind.actions.archive)),
                    canAddMembership: Boolean(
                      findSirenAction(result.bodyRepresentation, bodyKind.actions.addMembership),
                    ),
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
        await Promise.all(get().bodies.map((body) => get().loadDetail(body.id)));
      },
      async create(input) {
        set({ error: null });
        try {
          const body = await api.create(input);
          await get().load();
          return body;
        } catch (error) {
          set({ error: apiErrorCode(error) });
          return null;
        }
      },
      update: (reference, input) =>
        attempt(async () => {
          const updated = await api.update(reference, input);
          set((state) => ({ bodies: state.bodies.map((body) => (body.id === updated.id ? updated : body)) }));
          await get().loadDetail(updated.id);
          return true;
        }),
      archive: (reference) =>
        attempt(async () => {
          await api.archive(reference);
          await get().load(true);
          await get().loadDetail(reference);
          return true;
        }),
      addMembership: (reference, input) =>
        attempt(async () => {
          await api.addMembership(reference, input);
          await get().loadDetail(reference);
          return true;
        }),
      updateMembership: (reference, membershipId, input) =>
        attempt(async () => {
          const representation = get().membershipRepresentations[membershipId];
          if (!representation) return false;
          await api.updateMembership(representation, input);
          await get().loadDetail(reference);
          return true;
        }),
      endMembership: (reference, membershipId, endedOn) =>
        attempt(async () => {
          const representation = get().membershipRepresentations[membershipId];
          if (!representation) return false;
          await api.endMembership(representation, endedOn);
          await get().loadDetail(reference);
          return true;
        }),
    };
  });
}
