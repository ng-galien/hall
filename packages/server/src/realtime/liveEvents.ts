import type { LiveEvent } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { logger } from "../core/logger.js";

export type LiveSubscription = { kind: "meeting" | "resource"; id: string };
type LiveEventListener = (event: LiveEvent) => void;

export interface LiveEventPublisher {
  publish(event: LiveEvent): void;
}

export interface LiveEventBus extends LiveEventPublisher {
  subscribe(target: LiveSubscription, listener: LiveEventListener): () => void;
}

const topic = (target: LiveSubscription) => `${target.kind}:${target.id}`;

function eventTopic(event: LiveEvent): string {
  return matchDiscriminated(event, "type", {
    "meeting.changed": ({ meetingId }) => topic({ kind: "meeting", id: meetingId }),
    "resource.changed": ({ resourceId }) => topic({ kind: "resource", id: resourceId }),
  });
}

export function createLiveEventBus(): LiveEventBus {
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
    publish(event) {
      for (const listener of listeners.get(eventTopic(event)) ?? []) {
        try {
          listener(event);
        } catch (error) {
          logger.error({ error }, "Live event subscriber failed");
        }
      }
    },
  };
}
