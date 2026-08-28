import { describe, expect, it } from "vitest";
import { z } from "zod";
import { findSirenAction, problemDetailsSchema, sirenData, sirenEntitySchema } from "./index.js";

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
        actions: [{ name: "topic.update", method: "RUN", href: "/api/topics/topic-1" }],
        links: [{ rel: ["self"], href: "/api/topics/topic-1" }],
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
      class: ["topic-collection"],
      properties: { count: 1 },
      entities: [
        {
          rel: ["item"],
          class: ["topic"],
          properties: { id: "topic-1" },
          links: [{ rel: ["self"], href: "/api/topics/topic-1" }],
        },
      ],
      actions: [{ name: "topic.create" as const, method: "POST" as const, href: "/api/topics" }],
      links: [{ rel: ["self"], href: "/api/topics" }],
    };

    expect(sirenData<Array<{ id: string }>>(representation)).toEqual([{ id: "topic-1" }]);
    expect(findSirenAction(representation, "topic.create")?.href).toBe("/api/topics");
  });
});
