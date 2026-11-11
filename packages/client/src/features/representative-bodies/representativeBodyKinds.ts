import { type ApiActionName, committeeRoles, delegationRoleSchema } from "@hall/api-contract";
import type { ComponentType } from "react";
import { CommitteeIcon, DelegationIcon } from "../../components/icons";
import type { TranslationKey } from "../../i18n/en";

/** Texts that a committee and an external representation both need, each in its own wording. */
const bodyTextKeys = [
  "title",
  "description",
  "detailDescription",
  "add",
  "name",
  "purpose",
  "identity",
  "identityDescription",
  "empty",
  "notFound",
  "noDescription",
  "active",
  "archived",
  "members",
  "membersDescription",
  "noMembers",
  "addMembers",
  "availableMembers",
  "paletteDescription",
  "noAvailableMembers",
  "selectionCount",
  "addToRole",
  "moveHere",
  "noMemberInRole",
  "sinceDate",
  "openMember",
  "editDates",
  "membershipHistory",
  "startedOn",
  "endedOn",
  "endMembership",
  "endMembershipDescription",
  "confirmEndMembership",
  "membershipActive",
  "membershipEnded",
  "archive",
  "archiveDescription",
  "archiveAction",
] as const;
export type BodyTextKey = (typeof bodyTextKeys)[number];

function texts<N extends "committees" | "delegations">(namespace: N) {
  return Object.fromEntries(bodyTextKeys.map((key) => [key, `${namespace}.${key}`])) as {
    [K in BodyTextKey]: `${N}.${K}`;
  };
}

/**
 * A body that groups dated contacts under roles: a municipal committee or an external representation. Both share
 * their pages, store and API access; only their route, Siren action names, roles and wording differ.
 */
export interface RepresentativeBodyKind {
  /** Prefix of the Siren action names and of the test identifiers. */
  kind: "committee" | "delegation";
  /** Client route and API collection path. */
  path: "/council-committees" | "/council-delegations";
  membershipClass: "committee-membership" | "delegation-membership";
  actions: Record<
    "create" | "update" | "archive" | "addMembership" | "updateMembership" | "endMembership",
    ApiActionName
  >;
  roles: readonly string[];
  /** Type icon of the body in lists. */
  icon: ComponentType;
  text: Record<BodyTextKey, TranslationKey>;
  roleLabel(role: string): TranslationKey;
}

const roleLabel = (role: string) => `committeeRole.${role}` as TranslationKey;

export const committeeKind: RepresentativeBodyKind = {
  kind: "committee",
  path: "/council-committees",
  membershipClass: "committee-membership",
  actions: {
    create: "committee.create",
    update: "committee.update",
    archive: "committee.archive",
    addMembership: "committee.add-membership",
    updateMembership: "committee.update-membership",
    endMembership: "committee.end-membership",
  },
  roles: committeeRoles,
  icon: CommitteeIcon,
  text: texts("committees") satisfies Record<BodyTextKey, TranslationKey>,
  roleLabel,
};

// @implements-requirement HALL-FR-DIR-140
export const delegationKind: RepresentativeBodyKind = {
  kind: "delegation",
  path: "/council-delegations",
  membershipClass: "delegation-membership",
  actions: {
    create: "delegation.create",
    update: "delegation.update",
    archive: "delegation.archive",
    addMembership: "delegation.add-membership",
    updateMembership: "delegation.update-membership",
    endMembership: "delegation.end-membership",
  },
  roles: delegationRoleSchema.options,
  icon: DelegationIcon,
  text: texts("delegations") satisfies Record<BodyTextKey, TranslationKey>,
  roleLabel,
};
