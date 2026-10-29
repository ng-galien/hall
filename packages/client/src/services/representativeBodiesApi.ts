import type { SirenEntity } from "@hall/api-contract";
import type { RepresentativeBodyKind } from "../features/representative-bodies/representativeBodyKinds";
import { apiSirenRequest, submitSirenAction, submitSirenActionAt } from "./apiClient";

/** A committee or an external representation, as both APIs return it. */
export interface RepresentativeBody {
  id: string;
  name: string;
  description: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A dated designation of a contact in a body, under one of the body's roles. */
export interface BodyMembership {
  id: string;
  contactId: string;
  role: string;
  startedOn: string;
  endedOn: string | null;
}

export interface RepresentativeBodyDetails {
  body: RepresentativeBody;
  memberships: BodyMembership[];
}

/** Reads and changes one kind of body through its Siren actions. */
export function representativeBodiesApi({ path, actions }: RepresentativeBodyKind) {
  return {
    list: (includeArchived = false) =>
      apiSirenRequest<RepresentativeBody[]>(`${path}${includeArchived ? "?includeArchived=true" : ""}`),
    get: (reference: string) =>
      Promise.all([
        apiSirenRequest<RepresentativeBody>(`${path}/${reference}`),
        apiSirenRequest<BodyMembership[]>(`${path}/${reference}/memberships`),
      ]).then(([body, memberships]) => ({
        data: { body: body.data, memberships: memberships.data },
        bodyRepresentation: body.representation,
        membershipsRepresentation: memberships.representation,
      })),
    create: (input: Record<string, unknown>) =>
      submitSirenActionAt<RepresentativeBody>(path, actions.create, input).then((result) => result.data),
    update: (reference: string, input: Record<string, unknown>) =>
      submitSirenActionAt<RepresentativeBody>(`${path}/${reference}`, actions.update, input).then(
        (result) => result.data,
      ),
    archive: (reference: string) =>
      submitSirenActionAt<RepresentativeBody>(`${path}/${reference}`, actions.archive).then((result) => result.data),
    addMembership: (reference: string, input: Record<string, unknown>) =>
      submitSirenActionAt<BodyMembership>(`${path}/${reference}`, actions.addMembership, input).then(
        (result) => result.data,
      ),
    updateMembership: (representation: SirenEntity, input: Record<string, unknown>) =>
      submitSirenAction<BodyMembership>(representation, actions.updateMembership, input).then((result) => result.data),
    endMembership: (representation: SirenEntity, endedOn: string) =>
      submitSirenAction<BodyMembership>(representation, actions.endMembership, { endedOn }).then(
        (result) => result.data,
      ),
  };
}
