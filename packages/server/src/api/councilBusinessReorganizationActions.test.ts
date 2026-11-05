import type { Request } from "express";
import { describe, expect, it } from "vitest";
import {
  councilBusinessReorganizationActions,
  councilBusinessReorganizationRepresentation,
} from "./councilBusinessReorganizationActions.js";
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

// @verifies-requirement HALL-FR-BUS-080
// @verifies-requirement HALL-FR-BUS-090
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

describe("council business reorganization representation", () => {
  const from = { id: "11111111-1111-4111-8111-111111111111", title: "Vannes", folderPath: "Eau/Vannes" };
  const to = { id: "22222222-2222-4222-8222-222222222222", title: "Astreintes", folderPath: "Eau/Astreintes" };
  const hrefs = (entity: { links?: { rel: string[]; href: string }[] }) =>
    Object.fromEntries((entity.links ?? []).map((link) => [link.rel.join(" "), link.href]));

  it("links a subject move to both businesses, the subject and its text", () => {
    const entity = councilBusinessReorganizationRepresentation("moveSubject", {
      from,
      to,
      blockers: [],
      applied: true,
      subjectId: "33333333-3333-4333-8333-333333333333",
      kind: "councilDecisionProposal",
      text: { resourceId: "44444444-4444-4444-8444-444444444444" },
    });
    expect(entity.class).toEqual(["council-business-reorganization"]);
    expect(entity.actions).toBeUndefined();
    expect(hrefs(entity)).toEqual({
      self: `/api/council-business/${to.id}`,
      to: `/api/council-business/${to.id}`,
      from: `/api/council-business/${from.id}`,
      subject: "/api/council-business/prepared-subjects/councilDecisionProposal/33333333-3333-4333-8333-333333333333",
      "content-resource": "/api/resources/44444444-4444-4444-8444-444444444444",
    });
  });

  it("links an applied merge to the remaining business and its report, never to the removed one", () => {
    const plan = {
      from,
      to,
      blockers: [],
      report: { fate: "appendedToTargetReport", targetReportResourceId: "55555555-5555-4555-8555-555555555555" },
    };
    const applied = councilBusinessReorganizationRepresentation("mergeBusiness", { ...plan, applied: true });
    expect(hrefs(applied)).toEqual({
      self: `/api/council-business/${to.id}`,
      to: `/api/council-business/${to.id}`,
      report: "/api/resources/55555555-5555-4555-8555-555555555555",
    });
    const preview = councilBusinessReorganizationRepresentation("mergeBusiness", { ...plan, applied: false });
    expect(hrefs(preview).from).toBe(`/api/council-business/${from.id}`);
    for (const entity of [applied, preview])
      for (const link of entity.links ?? []) expect(link.href).not.toContain("undefined");
  });
});
