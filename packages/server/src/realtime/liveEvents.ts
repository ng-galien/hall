import type { LiveEvent, LiveEventPublication } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { logger } from "../core/logger.js";
import type { RequestContextStore } from "../security/requestContext.js";

export type LiveSubscription = { kind: "meeting" | "resource"; id: string };
type LiveEventListener = (event: LiveEvent) => void;

export interface LiveEventPublisher {
  publish(event: LiveEventPublication): void;
}

export interface LiveEventBus extends LiveEventPublisher {
  subscribe(target: LiveSubscription, listener: LiveEventListener): () => void;
}

const topic = (target: LiveSubscription) => `${target.kind}:${target.id}`;

function eventTopic(event: LiveEventPublication): string {
  return matchDiscriminated(event, "type", {
    "meeting.changed": ({ meetingId }) => topic({ kind: "meeting", id: meetingId }),
    "resource.changed": ({ resourceId }) => topic({ kind: "resource", id: resourceId }),
  });
}

// @implements-requirement HALL-TR-LIV-010
export function createLiveEventBus({ requestContext }: { requestContext: RequestContextStore }): LiveEventBus {
  const listeners = new Map<string, Set<LiveEventListener>>();
  return {
    subscribe(target, listener) {
      const key = topic(target);
      const subscribers = listeners.get(key) ?? new Set<LiveEventListener>();
      subscribers.add(listener);
      listeners.set(key, subscribers);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(key);
      };
    },
    publish(publication) {
      const event: LiveEvent = { ...publication, origin: requestContext.current()?.liveOrigin ?? null };
      for (const listener of listeners.get(eventTopic(publication)) ?? []) {
        try {
          listener(event);
        } catch (error) {
          logger.error({ error }, "Live event subscriber failed");
        }
      }
    },
  };
}
