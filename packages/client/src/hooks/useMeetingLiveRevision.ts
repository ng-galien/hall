import { useEffect, useState } from "react";
import { subscribeLiveUpdates } from "../services/liveUpdates";

/**
 * Rereads the meeting on each live connection and each event from another session. The revision, which moves a
 * passive reader back to the current item, counts the rereads after an event or a reconnection, not the first connection.
 */
// @implements-requirement HALL-FR-MTG-320
export function useMeetingLiveRevision(meetingId: string | undefined, load: () => Promise<boolean>): number {
  const [liveRevision, setLiveRevision] = useState(0);

  useEffect(() => {
    if (!meetingId) return;
    let active = true;
    let connected = false;
    const reread = (movesReader: boolean) => {
      void load().then((refreshed) => {
        if (active && refreshed && movesReader) setLiveRevision((revision) => revision + 1);
      });
    };
    const unsubscribe = subscribeLiveUpdates(
      { kind: "meeting", id: meetingId },
      () => reread(true),
      () => {
        reread(connected);
        connected = true;
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load, meetingId]);

  return liveRevision;
}
