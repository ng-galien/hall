import type { AgendaItem, CouncilDecisionDetail } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { CalendarIcon } from "../../components/icons";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { StatusBadge } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, type ApiErrorCode } from "../../services/apiClient";
import { listCouncilBusinessAgendaItems } from "../../services/councilBusinessApi";
import { openCouncilDecisionDocument } from "../../services/councilDecisionsApi";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { workspaceAgendaItemStatus } from "../../stores/workspaceCouncilActivityStore";

export function BusinessSubjectHistory({
  businessId,
  subjectId,
  revision,
}: {
  businessId: string;
  subjectId: string;
  revision: number;
}) {
  const { t, formatDate } = useI18n();
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const summaries = useCouncilDecisionsStore((state) => state.councilDecisions);
  const decisionIds = summaries
    .filter((decision) => decision.proposalId === subjectId)
    .map((decision) => decision.id)
    .join(",");
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [decisions, setDecisions] = useState<CouncilDecisionDetail[]>([]);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    void Promise.all([
      listCouncilBusinessAgendaItems([businessId]),
      Promise.all(decisionIds.split(",").filter(Boolean).map(openCouncilDecisionDocument)),
    ])
      .then(([entries, documents]) => {
        if (!active) return;
        setItems(entries.filter((item) => item.subject.id === subjectId));
        setDecisions(documents.map((document) => document.data));
      })
      .catch((failure) => {
        if (active) setError(apiErrorCode(failure));
      });
    return () => {
      active = false;
    };
  }, [businessId, subjectId, revision, decisionIds]);

  if (error) return <RequestErrorBanner error={error} />;
  if (!items) return <p className="business-subject-history-empty">{t("common.loading")}</p>;
  if (items.length === 0) return <p className="business-subject-history-empty">{t("workspace.noPreviousOccurrences")}</p>;

  const orderedItems = items.slice().sort((left, right) => {
    const dateOf = (id: string) => {
      const meeting = meetings.find((entry) => entry.id === id);
      const date = meeting?.scheduledAt ?? meeting?.startedAt;
      return date ? Date.parse(date) : Number.POSITIVE_INFINITY;
    };
    return dateOf(left.councilMeetingId) - dateOf(right.councilMeetingId) || left.id.localeCompare(right.id);
  });
  return (
    <section className="business-subject-history" aria-label={t("workspace.subjectMeetings")}>
      <h3>
        <CalendarIcon aria-hidden="true" />
        {t("workspace.subjectMeetings")}
      </h3>
      <ul>
        {orderedItems.map((item) => {
          const meeting = meetings.find((entry) => entry.id === item.councilMeetingId);
          if (!meeting) return null;
          const outcomes = decisions.filter((decision) => decision.facts.agendaItemId === item.id);
          const status = item.adjournedAt
            ? "adjourned"
            : outcomes[0]
              ? outcomes[0].facts.ballot.result === "approve"
                ? "adopted"
                : "rejected"
              : workspaceAgendaItemStatus(item);
          return (
            <li key={item.id}>
              <Link data-testid={`business-meeting-open-${item.id}`} to={`/meetings/${meeting.reference}`}>
                {formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate, t("workspace.dateToSet"))}
              </Link>
              <StatusBadge value={status} />
              {outcomes.map((decision) => (
                <Link
                  key={decision.id}
                  className="business-subject-decision-link"
                  data-testid={`business-decision-open-${decision.id}`}
                  to={`/council-decisions/${decision.id}`}
                >
                  {decision.number ?? decision.title}
                </Link>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
