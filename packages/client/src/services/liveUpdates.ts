import { type LiveEvent, liveEventSchema } from "@hall/api-contract";
import { liveOrigin } from "./liveOrigin";

type LiveTopic = { kind: "meeting" | "resource"; id: string } | { kind: "workspace" };

/** One topic per socket; each event from another session invalidates the canonical HTTP/Siren read. */
// @implements-requirement HALL-TR-LIV-010
export function subscribeLiveUpdates(
  topic: LiveTopic,
  onEvent: (event: LiveEvent) => void,
  onConnected: () => void,
): () => void {
  let stopped = false;
  let retry: number | undefined;
  let socket: WebSocket | null = null;
  let retryDelay = 500;

  const connect = () => {
    if (stopped) return;
    const url = new URL("/api/live", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("kind", topic.kind);
    if (topic.kind !== "workspace") url.searchParams.set("id", topic.id);
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      retryDelay = 500;
      onConnected();
    });
    socket.addEventListener("message", (message) => {
      if (typeof message.data !== "string") return;
      let decoded: unknown;
      try {
        decoded = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = liveEventSchema.safeParse(decoded);
      if (!parsed.success || parsed.data.origin === liveOrigin) return;
      if (topic.kind === "meeting" && parsed.data.type === "meeting.changed" && parsed.data.meetingId === topic.id) {
        onEvent(parsed.data);
      }
      if (topic.kind === "resource" && parsed.data.type === "resource.changed" && parsed.data.resourceId === topic.id) {
        onEvent(parsed.data);
      }
      if (topic.kind === "workspace" && parsed.data.type === "workspace.changed") onEvent(parsed.data);
    });
    socket.addEventListener("close", () => {
      socket = null;
      if (stopped) return;
      retry = window.setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 10000);
    });
    socket.addEventListener("error", () => socket?.close());
  };

  connect();
  return () => {
    stopped = true;
    if (retry !== undefined) window.clearTimeout(retry);
    socket?.close();
  };
}
