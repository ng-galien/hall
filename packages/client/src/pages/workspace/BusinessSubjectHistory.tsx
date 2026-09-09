import type { AgendaItem, CouncilDecisionDetail } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { CalendarIcon } from "../../components/icons";
import { ExplorerTreeBranch, ExplorerTreeContent } from "../../components/ui/explorer-tree";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { MarkdownView } from "../../components/MarkdownView";
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
  const navigate = useNavigate();
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
  return (
    <ExplorerTreeBranch
      title={t("workspace.subjectMeetings")}
      testId={`business-subject-history-${subjectId}`}
      defaultOpen
      icon={
        <span className="workspace-glyph">
          <CalendarIcon />
        </span>
      }
    >
      {error ? (
        <li>
          <RequestErrorBanner error={error} />
        </li>
      ) : null}
      {!items && !error ? <li>{t("common.loading")}</li> : null}
      {items
        ?.slice()
        .sort((left, right) => {
          const dateOf = (id: string) => {
            const meeting = meetings.find((entry) => entry.id === id);
            const date = meeting?.scheduledAt ?? meeting?.startedAt;
            return date ? Date.parse(date) : Number.POSITIVE_INFINITY;
          };
          return dateOf(left.councilMeetingId) - dateOf(right.councilMeetingId) || left.id.localeCompare(right.id);
        })
        .map((item) => {
          const meeting = meetings.find((entry) => entry.id === item.councilMeetingId);
          if (!meeting) return null;
          const outcomes = decisions.filter((decision) => decision.facts.agendaItemId === item.id);
          return (
            <ExplorerTreeBranch
              key={item.id}
              title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate, t("workspace.dateToSet"))}
              testId={`business-subject-occurrence-${item.id}`}
              expandable={outcomes.length > 0}
              onActivate={() => navigate(`/meetings/${meeting.reference}`)}
              meta={
                <StatusBadge
                  value={
                    item.adjournedAt
                      ? "adjourned"
                      : outcomes[0]
                        ? outcomes[0].facts.ballot.result === "approve"
                          ? "adopted"
                          : "rejected"
                        : workspaceAgendaItemStatus(item)
                  }
                />
              }
              contextMenu={
                <ContextMenuItem asChild>
                  <Link data-testid={`business-meeting-open-${item.id}`} to={`/meetings/${meeting.reference}`}>
                    {t("workspace.openMeeting")}
                  </Link>
                </ContextMenuItem>
              }
            >
              {outcomes.map((decision) => (
                <ExplorerTreeBranch
                  key={decision.id}
                  title={`${t("meeting.itemHasDecision")} · ${decision.number ?? decision.title}`}
                  testId={`business-subject-decision-${decision.id}`}
                  meta={<StatusBadge value={decision.facts.ballot.result === "approve" ? "adopted" : "rejected"} />}
                  contextMenu={
                    <ContextMenuItem asChild>
                      <Link
                        data-testid={`business-decision-open-${decision.id}`}
                        to={`/council-decisions/${decision.id}`}
                      >
                        {t("workspace.openDecision")}
                      </Link>
                    </ContextMenuItem>
                  }
                >
                  <li>
                    <ExplorerTreeContent
                      heading={t("workspace.decisionText")}
                      testId={`business-inline-decision-${decision.id}`}
                    >
                      <MarkdownView markdown={decision.content} />
                    </ExplorerTreeContent>
                  </li>
                </ExplorerTreeBranch>
              ))}
            </ExplorerTreeBranch>
          );
        })}
      {items?.length === 0 ? <li className="workspace-list-empty">{t("workspace.noPreviousOccurrences")}</li> : null}
    </ExplorerTreeBranch>
  );
}
