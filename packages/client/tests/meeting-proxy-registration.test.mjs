import assert from "node:assert/strict";
import { test } from "vitest";
import { withRegisteredProxies } from "../src/features/council-meetings/proxyRegistrationRollCall.ts";

const registration = (grantor, holder, document) => ({
  id: `registration-${grantor}`,
  grantorCouncilMemberId: grantor,
  holderCouncilMemberId: holder,
  proxyDocumentId: document,
  registeredAt: "2026-11-14T09:00:00+00:00",
});

// @verifies-requirement HALL-FR-ATT-190
test("the opening roll call represents each member who registered a proxy by its holder, with the document", () => {
  const declared = [
    {
      id: "attendance-3",
      meetingId: "meeting",
      memberId: "member-3",
      status: "excused",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
      version: 1,
    },
  ];
  const roll = withRegisteredProxies(
    declared,
    [registration("member-1", "member-2", "document-1"), registration("member-3", "member-4", "document-2")],
    "meeting",
  );
  assert.deepEqual(roll, [
    declared[0],
    {
      id: "draft-member-1",
      meetingId: "meeting",
      memberId: "member-1",
      status: "represented",
      proxyHolderMemberId: "member-2",
      proxyDocumentId: "document-1",
      version: 1,
    },
  ]);
});
