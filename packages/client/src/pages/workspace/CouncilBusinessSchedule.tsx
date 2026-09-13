import { useEffect, useState } from "react";
import type { PreparedCouncilSubject } from "@hall/api-contract";
import { Button } from "../../components/ui/button";
import { EntitySelect } from "../../components/search/EntitySelect";
import { RequestErrorBanner } from "../../components/Ui";
import { CalendarAddIcon } from "../../components/icons";
import { preparedSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import { listPreparedCouncilSubjects } from "../../services/councilBusinessApi";
import { apiErrorCode, type ApiErrorCode } from "../../services/apiClient";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";

function MeetingSubjectChoices({ businessId, subjectId, meetingId, onScheduled }: { businessId: string; subjectId: string; meetingId: string; onScheduled(): void }) {
  const actions = useCouncilMeeting(meetingId);
  const { t } = useI18n();
  const [subjects, setSubjects] = useState<PreparedCouncilSubject[]>([]);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canSchedule = actions.can("agenda-item.schedule-prepared");
  useEffect(() => {
    let active = true;
    setSubjects([]);
    setError(null);
    setLoading(true);
    void listPreparedCouncilSubjects(meetingId).then((items) => {
      if (active) setSubjects(items.filter((item) => item.councilBusinessId === businessId && "id" in item && item.id === subjectId));
    }).catch((failure) => { if (active) setError(apiErrorCode(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [businessId, subjectId, meetingId]);
  return <div className="grid gap-3">
    <RequestErrorBanner error={error ?? actions.error ?? actions.actionError} />
    {subjects.map((subject) => {
      const position = Math.max(0, ...(actions.workspace?.agendaItems.map((item) => Math.abs(item.position)) ?? [])) + 1;
      const entry = preparedSubjectPresentation(subject, position);
      return <Button variant="outline" key={entry.key} data-testid={`business-schedule-subject-${entry.key}`} disabled={busy || !canSchedule} onClick={() => {
        setBusy(true);
        void actions.schedulePreparedSubject(entry.command).then((result) => { if (result) onScheduled(); }).finally(() => setBusy(false));
      }}><CalendarAddIcon />{subject.title}</Button>;
    })}
    {loading ? <p role="status">{t("common.loading")}</p> : null}
    {!loading && !error && !subjects.length && actions.workspace ? <p>{t("workspace.noSchedulableSubjects")}</p> : null}
  </div>;
}

export function CouncilBusinessSchedule({ businessId, subjectId, meetingIds, onScheduled }: { businessId: string; subjectId: string; meetingIds: readonly string[]; onScheduled(): void }) {
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const { t, formatDate } = useI18n();
  const [meetingId, setMeetingId] = useState("");
  const planningMeetings = meetings.filter((meeting) => meetingIds.includes(meeting.id));
  if (!planningMeetings.length) return <p data-testid="business-schedule-no-meeting">{t("workspace.noPlanningMeeting")}</p>;
  return <div className="modal-form">
<EntitySelect type="meeting" testId="business-meeting-select" value={meetingId} onValueChange={setMeetingId} placeholder={t("workspace.chooseMeeting")}
 options={planningMeetings.map(meeting=>({value:meeting.id,label:formatMeetingLabel(meeting,t("meetings.occurrenceLabel"),formatDate,t("workspace.dateToSet"))}))}/>

    {meetingId ? <MeetingSubjectChoices key={meetingId} businessId={businessId} subjectId={subjectId} meetingId={meetingId} onScheduled={onScheduled} /> : null}
  </div>;
}
