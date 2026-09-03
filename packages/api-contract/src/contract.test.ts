import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createResourceSchema,
  findSirenAction,
  problemDetailsSchema,
  resourceDetailSchema,
  sirenData,
  sirenEntitySchema,
} from "./index.js";

describe("shared HTTP contract", () => {
  it("validates a Siren entity with a state-changing action", () => {
    const schema = sirenEntitySchema(z.object({ status: z.string() }));
    const entity = schema.parse({
      class: ["council-meeting"],
      properties: { status: "scheduled" },
      actions: [
        {
          name: "meeting.record-attendance",
          method: "PUT",
          href: "/api/council-meetings/meeting-1/attendance",
          type: "application/json",
        },
      ],
      links: [{ rel: ["self"], href: "/api/council-meetings/meeting-1" }],
    });

    expect(entity.actions?.[0]?.name).toBe("meeting.record-attendance");
  });

  it("rejects unsupported HTTP methods", () => {
    const schema = sirenEntitySchema(z.object({}));
    expect(() =>
      schema.parse({
        actions: [{ name: "council-business.update", method: "RUN", href: "/api/council-business/business-1" }],
        links: [{ rel: ["self"], href: "/api/council-business/business-1" }],
      }),
    ).toThrow();
  });

  it("validates RFC 9457 problem details with a stable application code", () => {
    const problem = problemDetailsSchema.parse({
      type: "/api/problems/quorum-not-reached",
      title: "Quorum not reached",
      status: 409,
      code: "quorum_not_reached",
      requestId: "request-1",
    });
    expect(problem.status).toBe(409);
  });

  it("decodes collection entities while preserving discoverable actions", () => {
    const representation = {
      class: ["council-business-collection"],
      properties: { count: 1 },
      entities: [
        {
          rel: ["item"],
          class: ["council-business"],
          properties: { id: "business-1" },
          links: [{ rel: ["self"], href: "/api/council-business/business-1" }],
        },
      ],
      actions: [{ name: "council-business.create" as const, method: "POST" as const, href: "/api/council-business" }],
      links: [{ rel: ["self"], href: "/api/council-business" }],
    };

    expect(sirenData<Array<{ id: string }>>(representation)).toEqual([{ id: "business-1" }]);
    expect(findSirenAction(representation, "council-business.create")?.href).toBe("/api/council-business");
  });

  it("keeps the modern resource contract small and discriminated", () => {
    expect(createResourceSchema.parse({ kind: "text", path: "school", name: "menu.md", content: "Menu" })).toEqual({
      kind: "text",
      path: "school",
      name: "menu.md",
      content: "Menu",
    });

    const resource = resourceDetailSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      slug: "menu-md",
      path: "school",
      name: "menu.md",
      fullPath: "school/menu.md",
      kind: "text",
      tags: ["school"],
      state: { readiness: "ready", availability: null },
      autosaveEnabled: true,
      createdAt: "2026-09-02T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      content: "Menu",
      version: 1,
    });
    expect(resource.tags).toEqual(["school"]);
    expect(resource).toMatchObject({ kind: "text", autosaveEnabled: true });
    expect(resource).not.toHaveProperty("councilBusiness");

    expect(
      createResourceSchema.parse({
        kind: "remote",
        path: "school",
        name: "portal",
        target: { kind: "unconfigured" },
      }),
    ).toMatchObject({ kind: "remote", target: { kind: "unconfigured" } });
  });
});
