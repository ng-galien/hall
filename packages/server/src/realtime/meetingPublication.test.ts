// @verifies-requirement HALL-FR-MTG-320
import express from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { createCouncilMeetingsRouter } from "../api/routes/councilMeetingsRoutes.js";
import type { Cradle } from "../core/container.js";
import { createLiveEventBus } from "./liveEvents.js";

const meetingId = "00000000-0000-4000-8000-000000000001";
const body = { agendaItemId: null, observedAt: "2026-09-18T10:00:00Z" };

function fixture({ permission = true, fails = false } = {}) {
  const realtimeEvents = createLiveEventBus();
  const received: unknown[] = [];
  realtimeEvents.subscribe({ kind: "meeting", id: meetingId }, (event) => received.push(event));
  const councilClient = {
    openMeeting: async () => ({ id: meetingId }),
    recordMeetingQuorum: async () => {
      if (fails) throw new Error("Transition rejected");
      return { id: "00000000-0000-4000-8000-000000000002" };
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.principal = {
      id: "00000000-0000-4000-8000-000000000003",
      displayName: "Council user",
      roles: permission ? ["meetingConductor"] : ["reader"],
      permissions: permission ? ["meetings.read", "meetings.conduct"] : ["meetings.read"],
      contactId: null,
    };
    next();
  });
  app.use("/council-meetings", createCouncilMeetingsRouter({ councilClient, realtimeEvents } as unknown as Cradle));
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(409).json({ error: "Transition rejected" });
  });
  return { app, received };
}

it("publishes one meeting invalidation after a successful conduct command", async () => {
  const { app, received } = fixture();
  await request(app).post(`/council-meetings/${meetingId}/quorum-observations`).send(body).expect(201);
  expect(received).toEqual([{ type: "meeting.changed", meetingId }]);
});

it("publishes nothing when the conduct command fails or the reader has no conduct permission", async () => {
  const failed = fixture({ fails: true });
  await request(failed.app).post(`/council-meetings/${meetingId}/quorum-observations`).send(body).expect(409);
  expect(failed.received).toEqual([]);

  const forbidden = fixture({ permission: false });
  await request(forbidden.app).post(`/council-meetings/${meetingId}/quorum-observations`).send(body).expect(403);
  expect(forbidden.received).toEqual([]);
});
