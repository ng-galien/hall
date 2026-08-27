import { useParams } from "react-router-dom";
import { EmptyState, RequestErrorBanner } from "../../components/Ui";
import { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import { MeetingInProgressHero } from "./MeetingInProgressHero";
import { MeetingPreparation } from "./MeetingPreparation";
import { MeetingReport } from "./MeetingReport";

export function CouncilMeetingPage() {
  const { meetingId = "" } = useParams();
  const { t } = useI18n();
  const meetingActions = useCouncilMeeting(meetingId);
  const { meeting: aggregate, error } = meetingActions;

  if (error) return <RequestErrorBanner error={error} />;
  if (!aggregate) return <EmptyState>{t("meeting.loading")}</EmptyState>;

  if (aggregate.meeting.status === "inProgress") {
    return <MeetingInProgressHero aggregate={aggregate} />;
  }
  if (aggregate.meeting.status === "closed" || aggregate.meeting.status === "cancelled") {
    return <MeetingReport aggregate={aggregate} />;
  }
  return <MeetingPreparation meetingActions={meetingActions} />;
}
