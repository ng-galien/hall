import type { CouncilMeeting } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { Link } from "react-router-dom";
import { HelpHint } from "../../components/HelpHint";
import { useI18n } from "../../i18n/I18nProvider";

/**
 * The notice period of a meeting not yet opened, as PostgreSQL computes it: an indicative ordinary reference, or the
 * date determined by a second convocation. It never states whether a notice was sent in time.
 */
// @implements-requirement HALL-FR-NOT-130
export function MeetingNoticeDeadline({ deadline }: { deadline: NoticeDeadline }) {
  const { t, formatDate } = useI18n();
  const day = (date: string) => formatDate(`${date}T12:00:00`);
  const dated = (key: "meeting.noticeDeadlineReference" | "meeting.noticeDeadlineDetermined", facts: DeadlineFacts) => (
    <span
      className="meeting-notice-deadline-value"
      data-testid="meeting-notice-deadline-date"
      data-reminder={facts.reminder}
    >
      {day(facts.deadlineDate)}
      <HelpHint
        text={`${t(key, { deadline: day(facts.deadlineDate), days: String(facts.clearDays), meeting: day(facts.meetingDate) })} ${t(`meeting.noticeDeadlineReminder.${facts.reminder}`)} ${t("meeting.noticeDeadlineCaveat")}`}
        testId="meeting-notice-deadline-help"
      />
    </span>
  );
  const content = matchDiscriminated(deadline, "status", {
    indeterminate: ({ reason }) =>
      reason === "scheduleUnknown" ? null : reason === "populationUnknown" ? (
        <p data-testid="meeting-notice-deadline-unknown">
          {t("meeting.noticeDeadlinePopulationUnknown")}{" "}
          <Link to="/settings" data-testid="meeting-notice-deadline-settings">
            {t("meeting.noticeDeadlineSettings")}
          </Link>
        </p>
      ) : (
        <p data-testid="meeting-notice-deadline-unknown">{t("meeting.noticeDeadlineTimeZoneUnknown")}</p>
      ),
    qualificationRequired: ({ ordinaryReference }) => dated("meeting.noticeDeadlineReference", ordinaryReference),
    determined: ({ deadline: facts }) => dated("meeting.noticeDeadlineDetermined", facts),
  });
  if (!content) return null;
  return (
    <section className="meeting-evidence" data-testid="meeting-notice-deadline" data-status={deadline.status}>
      <span className="meeting-evidence-title">
        <strong>{t("meeting.noticeDeadline")}</strong>
        {content}
      </span>
    </section>
  );
}

type NoticeDeadline = CouncilMeeting["noticeDeadline"];
type DeadlineFacts = Extract<NoticeDeadline, { status: "determined" }>["deadline"];
