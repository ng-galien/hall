import { createServer, IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { Duplex } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import type { ServerConfig } from "../../src/core/config.js";
import { createLiveEventBus } from "../../src/realtime/liveEvents.js";
import { attachLiveWebSocket } from "../../src/realtime/liveWebSocket.js";
import { RequestContextStore } from "../../src/security/requestContext.js";
import type { AuthService } from "../../src/services/authService.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function fixture(authenticate: AuthService["authenticate"]) {
  const server = createServer();
  const socket = new Duplex({
    read: () => undefined,
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const request = new IncomingMessage(new Socket());
  request.url = "/api/live?kind=workspace";
  request.headers = {
    host: "127.0.0.1:3000",
    origin: "http://127.0.0.1:3000",
    cookie: "hall_session=reader",
  };
  const config = {
    host: "127.0.0.1",
    port: 3000,
    database: { kind: "postgres", url: "postgresql://unused" },
  } satisfies ServerConfig;
  const bus = createLiveEventBus({ requestContext: new RequestContextStore() });
  const subscribe = vi.spyOn(bus, "subscribe");
  const live = attachLiveWebSocket(server, {
    authService: { authenticate } as AuthService,
    config,
    realtimeEvents: bus,
    authorizeReading: async () => true,
  });
  closers.push(async () => {
    socket.destroy();
    request.destroy();
    await live.close();
  });
  const [handler] = server.listeners("upgrade");
  if (!handler) throw new Error("Missing upgrade listener");
  return { socket, subscribe, upgrade: () => handler(request, socket, Buffer.alloc(0)) };
}

const reset = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

// @verifies-requirement HALL-FR-MTG-320
it("contains a connection reset while authentication is pending", async () => {
  type Authentication = Awaited<ReturnType<AuthService["authenticate"]>>;
  let resolveAuthentication: (value: Authentication) => void = () => undefined;
  const pendingAuthentication = new Promise<Authentication>((resolve) => {
    resolveAuthentication = resolve;
  });
  const f = fixture(() => pendingAuthentication);
  const pending = f.upgrade();
  try {
    expect(() => f.socket.emit("error", reset())).not.toThrow();
    expect(f.socket.destroyed).toBe(true);
  } finally {
    resolveAuthentication(null);
    await pending;
  }
  expect(f.subscribe).not.toHaveBeenCalled();
});

// @verifies-requirement HALL-FR-USR-060
it("contains a connection reset after rejecting an unauthenticated upgrade", async () => {
  const f = fixture(async () => null);
  await f.upgrade();
  expect(f.socket.writableEnded).toBe(true);
  expect(() => f.socket.emit("error", reset())).not.toThrow();
  expect(f.socket.destroyed).toBe(true);
  expect(f.subscribe).not.toHaveBeenCalled();
});
