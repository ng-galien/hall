import type { MeetingOpeningBlocker } from "@hall/contracts";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/en";

const labels = {
  meetingClosed: "meeting.entry.meetingClosed",
  meetingNotScheduled: "meeting.entry.meetingNotScheduled",
  meetingLocationMissing: "meeting.entry.meetingLocationMissing",
  agendaNotFrozen: "meeting.entry.agendaNotFrozen",
  currentNoticeMissing: "meeting.entry.currentNoticeMissing",
  meetingAlreadyStarted: "meeting.entry.meetingAlreadyStarted",
  scheduledTimeNotReached: "meeting.entry.scheduledTimeNotReached",
} satisfies Record<MeetingOpeningBlocker["code"], TranslationKey>;

/** Displays the missing requirements enumerated by the server, without deriving permissions. */
export function MeetingEntryBlockers({ blockers }: { blockers: readonly MeetingOpeningBlocker[] }) {
  const { t, formatDateTime } = useI18n();
  if (!blockers.length) return null;
  return (
    <ul id="meeting-live-entry-reason" className="meeting-evidence" data-testid="meeting-live-entry-reason">
      {blockers.map((blocker) => (
        <li key={blocker.code} data-testid={`meeting-entry-blocker-${blocker.code}`}>
          {"scheduledAt" in blocker
            ? t(labels[blocker.code]).replace("{date}", formatDateTime(blocker.scheduledAt))
            : t(labels[blocker.code])}
        </li>
      ))}
    </ul>
  );
}
