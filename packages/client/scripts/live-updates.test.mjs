import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// @verifies-requirement HALL-FR-MTG-320
// @verifies-requirement HALL-FR-DOC-280
test("live subscriptions admit only the selected topic and resynchronize on connection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-live-updates-"));
  const previousWindow = globalThis.window;
  const previousWebSocket = globalThis.WebSocket;
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      sockets.push(this);
    }
    addEventListener(type, listener) {
      const entries = this.listeners.get(type) ?? [];
      entries.push(listener);
      this.listeners.set(type, entries);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    close() {
      this.emit("close");
    }
  }
  try {
    const output = join(directory, "live-updates.mjs");
    await build({
      entryPoints: [join(import.meta.dirname, "../src/services/liveUpdates.ts")],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      logLevel: "silent",
    });
    globalThis.window = { location: { origin: "https://hall.example" }, setTimeout, clearTimeout };
    globalThis.WebSocket = FakeWebSocket;
    const { subscribeLiveUpdates } = await import(pathToFileURL(output).href);
    const meetingId = "11111111-1111-4111-8111-111111111111";
    const resourceId = "22222222-2222-4222-8222-222222222222";
    const events = [];
    let connections = 0;
    const unsubscribe = subscribeLiveUpdates(
      { kind: "meeting", id: meetingId },
      (event) => events.push(event),
      () => connections++,
    );
    const socket = sockets[0];
    assert.equal(socket.url.href, `wss://hall.example/api/live?kind=meeting&id=${meetingId}`);
    socket.emit("open");
    assert.equal(connections, 1);
    socket.emit("message", { data: "not json" });
    socket.emit("message", { data: JSON.stringify({ type: "meeting.changed", meetingId: resourceId }) });
    socket.emit("message", {
      data: JSON.stringify({
        type: "resource.changed",
        resourceId,
        actor: { id: meetingId, displayName: "Other" },
      }),
    });
    assert.equal(events.length, 0);
    socket.emit("message", { data: JSON.stringify({ type: "meeting.changed", meetingId }) });
    assert.deepEqual(events, [{ type: "meeting.changed", meetingId }]);
    unsubscribe();
  } finally {
    globalThis.window = previousWindow;
    globalThis.WebSocket = previousWebSocket;
    await rm(directory, { recursive: true, force: true });
  }
});
