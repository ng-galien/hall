import type { ConductBlocker } from "@hall/api-contract";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

const labels = {
  meetingNotStarted: "conduct.blocker.meetingNotStarted",
  meetingClosed: "conduct.blocker.meetingClosed",
  itemNotProgrammed: "conduct.blocker.itemNotProgrammed",
  itemCompleted: "conduct.blocker.itemCompleted",
  itemAdjourned: "conduct.blocker.itemAdjourned",
  discussionAlreadyStarted: "conduct.blocker.discussionAlreadyStarted",
  discussionNotStarted: "conduct.blocker.discussionNotStarted",
  nonVotingSubject: "conduct.blocker.nonVotingSubject",
  votingSubjectRequiresBallot: "conduct.blocker.votingSubjectRequiresBallot",
  discussionQuorumMissing: "conduct.blocker.discussionQuorumMissing",
  membershipMissing: "conduct.blocker.membershipMissing",
  attendanceIncomplete: "conduct.blocker.attendanceIncomplete",
  observationChronology: "conduct.blocker.observationChronology",
  reconvocationPending: "conduct.blocker.reconvocationPending",
  freshObservationsRequired: "conduct.blocker.freshObservationsRequired",
  permissionDenied: "conduct.blocker.permissionDenied",
  quorumNotMet: "conduct.blocker.quorumNotMet",
  earlierAgendaItemPending: "conduct.blocker.earlierAgendaItemPending",
  anotherDiscussionActive: "conduct.blocker.anotherDiscussionActive",
  ballotAlreadyExists: "conduct.blocker.ballotAlreadyExists",
  ballotInProgress: "conduct.blocker.ballotInProgress",
  minutesDocumentMissing: "conduct.blocker.minutesDocumentMissing",
} satisfies Record<ConductBlocker["code"], TranslationKey>;

/** Displays server-owned reasons; never derives permission from local state. */
export function ConductActionBlockers({
  action,
  label,
  blockers,
}: {
  action: string;
  label?: TranslationKey;
  blockers: readonly ConductBlocker[];
}) {
  const { t, formatNumber } = useI18n();
  if (blockers.length === 0) return null;
  return (
    <div className="conduct-action-blocker" data-testid={`conduct-blockers-${action}`}>
      {label ? <strong>{t("conduct.actionUnavailable").replace("{action}", t(label))}</strong> : null}
      <ul>
        {blockers.map((blocker) => {
          let text = t(labels[blocker.code]);
          if ("presentCount" in blocker)
            text = text
              .replace("{present}", formatNumber(blocker.presentCount))
              .replace("{required}", formatNumber(blocker.requiredPresent));
          return (
            <li key={blocker.code} data-testid={`conduct-blocker-${action}-${blocker.code}`}>
              {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
