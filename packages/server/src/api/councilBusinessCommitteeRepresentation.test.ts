import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Cradle } from "../core/container.js";
import { createCouncilBusinessRouter } from "./routes/councilBusinessRoutes.js";
import { createCouncilCommitteesRouter } from "./routes/councilCommitteesRoutes.js";

// @verifies-requirement HALL-FR-BUS-070
describe("committee association collection self links", () => {
  it("publishes full API paths from both mounted routers", async () => {
    const businessId = randomUUID();
    const committeeId = randomUUID();
    const app = express();
    app.use((req, _res, next) => {
      req.principal = {
        id: randomUUID(),
        displayName: "Reader",
        roles: ["reader"],
        permissions: ["workspace.read", "meetings.read"],
        contactId: null,
      };
      next();
    });
    const cradle = {
      councilBusinessWorkspaceService: {
        get: async () => ({ id: businessId }),
        listCommittees: async () => [],
        listCommitteeBusinesses: async () => [],
      },
      directoryService: { getCouncilCommittee: async () => ({ id: committeeId }) },
    } as unknown as Cradle;
    app.use("/api/council-business", createCouncilBusinessRouter(cradle));
    app.use("/api/council-committees", createCouncilCommitteesRouter(cradle));

    const businessLinks = await request(app).get(`/api/council-business/${businessId}/committees`).expect(200);
    expect(businessLinks.body.links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: `/api/council-business/${businessId}/committees` }),
    );

    const committeeLinks = await request(app).get(`/api/council-committees/${committeeId}/businesses`).expect(200);
    expect(committeeLinks.body.links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: `/api/council-committees/${committeeId}/businesses` }),
    );
  });
});
