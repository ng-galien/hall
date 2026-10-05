// @verifies-requirement HALL-FR-MTG-320
import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerConfig } from "../core/config.js";
import { RequestContextStore } from "../security/requestContext.js";
import type { AuthService } from "../services/authService.js";
import { createLiveEventBus } from "./liveEvents.js";
import { attachLiveWebSocket } from "./liveWebSocket.js";

const meetingId = "00000000-0000-4000-8000-000000000001";
const otherMeetingId = "00000000-0000-4000-8000-000000000002";
const resourceId = "00000000-0000-4000-8000-000000000003";

const sockets: WebSocket[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const close of closers.splice(0)) await close();
});

async function fixture() {
  const bus = createLiveEventBus({ requestContext: new RequestContextStore() });
  const server = createServer();
  const config = {
    host: "127.0.0.1",
    port: 0,
    database: { kind: "postgres", url: "postgresql://unused" },
  } satisfies ServerConfig;
  let sessionActive = true;
  const authService = {
    async authenticate(token: string) {
      if (!sessionActive || !["reader", "conductor", "workspace"].includes(token)) return null;
      const roles = token === "conductor" ? ["meetingConductor"] : token === "workspace" ? [] : ["reader"];
      return {
        sessionId: token,
        user: {
          id: "00000000-0000-4000-8000-000000000004",
          displayName: "Reader",
          roles,
          contactId: null,
        },
      };
    },
  } as AuthService;
  const live = attachLiveWebSocket(server, { authService, config, realtimeEvents: bus });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server has no port");
  const origin = `http://127.0.0.1:${address.port}`;
  const base = `ws://127.0.0.1:${address.port}/api/live`;
  closers.push(async () => {
    await live.close();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  return { base, origin, bus, revoke: () => (sessionActive = false) };
}

function connect(
  base: string,
  origin: string,
  kind: "meeting" | "resource",
  id: string,
  token: string,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base}?kind=${kind}&id=${id}`, {
      headers: { Origin: origin, Cookie: `hall_session=${token}` },
    });
    sockets.push(socket);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Expected a live event")), 1000);
    socket.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

async function rejected(base: string, origin: string, kind: "meeting" | "resource", id: string, token?: string) {
  return new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(`${base}?kind=${kind}&id=${id}`, {
      headers: { Origin: origin, ...(token ? { Cookie: `hall_session=${token}` } : {}) },
    });
    sockets.push(socket);
    socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    socket.once("open", () => reject(new Error("Unauthorized socket opened")));
    socket.once("error", reject);
  });
}

it("sends meeting invalidations only to authorized subscribers of that meeting", async () => {
  const { base, origin, bus } = await fixture();
  const reader = await connect(base, origin, "meeting", meetingId, "reader");
  const other = await connect(base, origin, "meeting", otherMeetingId, "reader");
  const resource = await connect(base, origin, "resource", resourceId, "reader");
  const expected = nextMessage(reader);
  bus.publish({ type: "meeting.changed", meetingId });
  await expect(expected).resolves.toEqual({ type: "meeting.changed", meetingId, origin: null });
  expect(other.readyState).toBe(WebSocket.OPEN);
  expect(resource.readyState).toBe(WebSocket.OPEN);
  const otherExpected = nextMessage(other);
  bus.publish({ type: "meeting.changed", meetingId: otherMeetingId });
  await expect(otherExpected).resolves.toEqual({ type: "meeting.changed", meetingId: otherMeetingId, origin: null });
});

it("delivers resource invalidations with the authenticated author identity", async () => {
  const { base, origin, bus } = await fixture();
  const subscriber = await connect(base, origin, "resource", resourceId, "reader");
  const expected = nextMessage(subscriber);
  const event = {
    type: "resource.changed" as const,
    resourceId,
    actor: { id: "development", displayName: "Development User" },
  };
  bus.publish(event);
  await expect(expected).resolves.toEqual({ ...event, origin: null });
});

it("rejects unauthenticated, insufficiently authorized and cross-origin subscriptions", async () => {
  const { base, origin } = await fixture();
  await expect(rejected(base, origin, "meeting", meetingId)).resolves.toBe(401);
  await expect(rejected(base, origin, "meeting", meetingId, "workspace")).resolves.toBe(403);
  await expect(rejected(base, origin, "resource", resourceId, "workspace")).resolves.toBe(403);
  await expect(rejected(base, "https://another.example", "meeting", meetingId, "reader")).resolves.toBe(403);
});

it("ends a subscription when its session is revoked and a change is published", async () => {
  const { base, origin, bus, revoke } = await fixture();
  const reader = await connect(base, origin, "meeting", meetingId, "reader");
  revoke();
  const closed = new Promise<number>((resolve) => reader.once("close", resolve));
  bus.publish({ type: "meeting.changed", meetingId });
  await expect(closed).resolves.toBe(1008);
});

it("accepts a new subscription after the first socket disconnects", async () => {
  const { base, origin, bus } = await fixture();
  const first = await connect(base, origin, "meeting", meetingId, "reader");
  const firstClosed = new Promise<void>((resolve) => first.once("close", () => resolve()));
  first.terminate();
  await firstClosed;

  const reconnected = await connect(base, origin, "meeting", meetingId, "reader");
  const next = nextMessage(reconnected);
  bus.publish({ type: "meeting.changed", meetingId });
  await expect(next).resolves.toEqual({ type: "meeting.changed", meetingId, origin: null });
});
