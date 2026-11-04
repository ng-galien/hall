import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { councilBusinessReorganizationActions } from "./councilBusinessReorganizationActions.js";
import { toSirenRepresentation } from "./sirenRepresentation.js";

function request(path: string, allowedActions: readonly string[]): Request {
  return {
    method: "GET",
    originalUrl: path,
    path,
    principal: { id: "user-id", displayName: "Clerk", roles: ["clerk"], contactId: null },
    allowedActions: new Set(allowedActions),
  } as unknown as Request;
}

const fields = [
  { name: "targetCouncilBusinessId", type: "text" },
  { name: "preview", type: "checkbox", value: false },
];

describe("council business reorganization actions", () => {
  it("offers the subject move with its preview on a prepared subject", () => {
    const path = "/api/council-business/prepared-subjects/openQuestion/subject-id";
    const subject = { id: "subject-id", kind: "openQuestion", agenda: { state: "examined" } };
    expect(
      councilBusinessReorganizationActions(
        request(path, ["council-business.move-subject"]),
        "prepared-subject",
        subject,
      ),
    ).toEqual([
      {
        name: "council-business.move-subject",
        method: "POST",
        href: "/api/council-business/prepared-subjects/openQuestion/subject-id/move",
        type: "application/json",
        title: "Move the subject and its text to another council business",
        fields,
      },
    ]);
    expect(
      toSirenRepresentation(request(path, ["council-business.move-subject"]), subject).actions?.map(({ name }) => name),
    ).toEqual(["council-business.move-subject"]);
  });

  it("offers the merge on a council business by its public reference", () => {
    const business = { id: "business-id", slug: "budget-eau-2026" };
    expect(
      councilBusinessReorganizationActions(
        request("/api/council-business/budget-eau-2026", ["council-business.merge"]),
        "council-business",
        business,
      ),
    ).toEqual([
      {
        name: "council-business.merge",
        method: "POST",
        href: "/api/council-business/budget-eau-2026/merge",
        type: "application/json",
        title: "Merge this council business into another one, then remove it",
        fields,
      },
    ]);
  });

  it("offers nothing without the permission or on a gesture plan", () => {
    expect(
      councilBusinessReorganizationActions(request("/api/council-business/business-id", []), "council-business", {
        id: "business-id",
      }),
    ).toEqual([]);
    expect(
      councilBusinessReorganizationActions(
        request("/api/council-business/business-id/merge", ["council-business.merge"]),
        "council-business",
        { from: { id: "a" }, to: { id: "b" }, applied: false, blockers: [] },
      ),
    ).toEqual([]);
  });
});
