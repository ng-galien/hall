import type { MeetingOpeningBlocker } from "@hall/contracts";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

const labels = {
  meetingClosed: "meeting.entry.meetingClosed",
  meetingNotScheduled: "meeting.entry.meetingNotScheduled",
  meetingLocationMissing: "meeting.entry.meetingLocationMissing",
  agendaRevisionOpen: "meeting.entry.agendaRevisionOpen",
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
            ? t(labels[blocker.code], { date: formatDateTime(blocker.scheduledAt) })
            : t(labels[blocker.code])}
        </li>
      ))}
    </ul>
  );
}
