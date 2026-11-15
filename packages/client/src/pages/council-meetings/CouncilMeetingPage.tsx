import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { RequestErrorBanner } from "../../components/Ui";
import { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import { MeetingInProgressHero } from "./MeetingInProgressHero";
import { MeetingPreparation } from "./MeetingPreparation";
import { MeetingReport } from "./MeetingReport";

/** A meeting reached by a former or technical reference is shown under its current slug. */
export function CouncilMeetingPage({ meetingReference }: { meetingReference?: string } = {}) {
  const { meetingId = "" } = useParams();
  const { t } = useI18n();
  const meetingActions = useCouncilMeeting(meetingReference ?? meetingId);
  const { meeting: aggregate, error } = meetingActions;
  const navigate = useNavigate();
  const currentSlug = aggregate?.meeting.slug;
  useEffect(() => {
    if (!meetingReference && currentSlug && meetingId !== currentSlug)
      navigate(`/meetings/${currentSlug}`, { replace: true });
  }, [currentSlug, meetingId, meetingReference, navigate]);

  if (error) return <RequestErrorBanner error={error} />;
  if (!aggregate) return <LoadingIndicator size="page" label={t("meeting.loading")} />;

  if (aggregate.meeting.status === "inProgress") {
    return <MeetingInProgressHero aggregate={aggregate} meetingActions={meetingActions} />;
  }
  if (aggregate.meeting.status === "closed" || aggregate.meeting.status === "cancelled") {
    return <MeetingReport aggregate={aggregate} meetingActions={meetingActions} />;
  }
  return <MeetingPreparation meetingActions={meetingActions} />;
}
