import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { liveEventSchema } from "@hall/api-contract";
import WebSocket, { WebSocketServer } from "ws";
import { z } from "zod";
import { cookieValueFromHeader, requestHostAllowed } from "../api/accessControl.js";
import type { ServerConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { hasPermission } from "../security/authorization.js";
import { type AuthService, principalForSession, SESSION_COOKIE_NAME } from "../services/authService.js";
import type { LiveEventBus, LiveSubscription } from "./liveEvents.js";

const subscriptionSchema = z.object({ kind: z.enum(["meeting", "resource"]), id: z.uuid() }).strict();

function rejectUpgrade(socket: Duplex, status: number): void {
  const message =
    status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 400 ? "Bad Request" : "Not Found";
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function sameOrigin(request: IncomingMessage, config: ServerConfig): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host || request.headers["sec-fetch-site"] === "cross-site") return false;
  const forwarded = request.headers["x-forwarded-proto"];
  const protocol = config.behindTlsProxy && forwarded === "https" ? "https" : "http";
  return origin === `${protocol}://${host}` || (config.allowedOrigins ?? []).includes(origin);
}

function subscription(request: IncomingMessage): LiveSubscription | null {
  let url: URL;
  try {
    url = new URL(request.url ?? "", "http://localhost");
  } catch {
    return null;
  }
  if (url.pathname !== "/api/live") return null;
  if (url.searchParams.size !== 2) return null;
  const parsed = subscriptionSchema.safeParse({ kind: url.searchParams.get("kind"), id: url.searchParams.get("id") });
  return parsed.success ? parsed.data : null;
}

export function attachLiveWebSocket(
  server: Server,
  {
    authService,
    config,
    realtimeEvents,
  }: { authService: AuthService; config: ServerConfig; realtimeEvents: LiveEventBus },
): { close(): Promise<void> } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  const onUpgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const target = subscription(request);
    if (!target) {
      rejectUpgrade(socket, 400);
      return;
    }
    if (!requestHostAllowed(request.headers, config) || !sameOrigin(request, config)) {
      rejectUpgrade(socket, 403);
      return;
    }
    const token = cookieValueFromHeader(request.headers.cookie, SESSION_COOKIE_NAME);
    const permitted = async (): Promise<boolean> => {
      if (config.devAutoLogin) return true;
      if (!token) return false;
      const session = await authService.authenticate(token);
      if (!session) return false;
      const permission = target.kind === "meeting" ? "meetings.read" : "workspace.read";
      return hasPermission(principalForSession(session), permission);
    };
    try {
      if (!(await permitted())) {
        rejectUpgrade(socket, token || config.devAutoLogin ? 403 : 401);
        return;
      }
    } catch (error) {
      logger.error({ error }, "Live subscription authentication failed");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const unsubscribe = realtimeEvents.subscribe(target, (event) => {
        void permitted()
          .then((allowed) => {
            if (!allowed) {
              ws.close(1008, "Subscription no longer authorized");
              return;
            }
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(liveEventSchema.parse(event)));
          })
          .catch((error) => {
            logger.error({ error }, "Live subscription authorization failed");
            ws.close(1011);
          });
      });
      ws.on("message", () => ws.close(1003, "Read-only channel"));
      ws.once("close", unsubscribe);
    });
  };

  server.on("upgrade", onUpgrade);
  return {
    async close() {
      server.off("upgrade", onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve, reject) => wss.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
