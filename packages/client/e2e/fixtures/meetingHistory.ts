import { backdateMeetingConduct as backdate } from "../../../../scripts/seed/data/common/meeting-history.mjs";

/**
 * Browser-test access to the demonstration backdating tool: it moves the recorded observations of
 * a meeting in the dedicated browser-test database of this lane. See
 * scripts/seed/data/common/meeting-history.mjs for what moves and what is refused.
 */
export function backdateMeetingConduct(meetingId: string, target: Date, since?: string) {
  return backdate(process.env.DATABASE_URL ?? "", meetingId, target, since);
}
