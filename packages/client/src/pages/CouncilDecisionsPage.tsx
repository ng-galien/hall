// TODO REMOVE_STALE: propagate incomplete session marker to canonical status badge.
import type { CouncilDecisionSummary } from "@hall/api-contract";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { HelpHint } from "../components/HelpHint";
import { GavelIcon } from "../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { ListRow, ListRowIcon, ListRows } from "../components/ui/list-row";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../features/status/DomainStatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import { compareNames } from "../lib/names";
import { ScreenTitleCommands } from "../shell/headerTrail";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

/**
 * Order of the decisions of one meeting: by number, in the natural order of its figures; a decision without a number
 * follows, the most recently created first, as the server lists them.
 */
function sessionOrder(left: CouncilDecisionSummary, right: CouncilDecisionSummary): number {
  if (left.number && right.number) {
    const byNumber = compareNames(left.number, right.number);
    if (byNumber !== 0) return byNumber;
  } else if (left.number || right.number) return left.number ? -1 : 1;
  return right.createdAt.localeCompare(left.createdAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function CouncilDecisionsPage() {
  const { t, formatDate } = useI18n();
  const { councilDecisions, error, loading, load } = useCouncilDecisionsStore();
  useEffect(() => {
    void load();
  }, [load]);
  const { meetings } = useCouncilMeetingsStore();
  const { query, setQuery } = useCollectionView();
  const groups = useMemo(() => {
    const grouped = new Map<string, CouncilDecisionSummary[]>();
    for (const decision of councilDecisions.filter((entry) => matchesQuery(query, entry.number, entry.title))) {
      grouped.set(decision.councilMeetingId, [...(grouped.get(decision.councilMeetingId) ?? []), decision]);
    }
    return [...grouped]
      .map(([meetingId, decisions]) => ({
        meetingId,
        meeting: meetings.find((entry) => entry.id === meetingId),
        decisions: [...decisions].sort(sessionOrder),
      }))
      .sort(
        (a, b) =>
          (b.meeting?.scheduledAt ?? "").localeCompare(a.meeting?.scheduledAt ?? "") ||
          (a.meetingId < b.meetingId ? -1 : a.meetingId > b.meetingId ? 1 : 0),
      );
  }, [councilDecisions, meetings, query]);
  return (
    <div className="page" data-testid="decisions-page">
      <PageHeader title={t("decisions.title")} />
      <ScreenTitleCommands>
        <HelpHint text={t("decisions.description")} />
      </ScreenTitleCommands>
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} />
        {loading && councilDecisions.length === 0 ? (
          <LoadingIndicator size="zone" label={t("common.loading")} data-testid="decisions-loading" />
        ) : groups.length === 0 && !error ? (
          <div data-testid="decisions-empty">
            <EmptyState>{t(councilDecisions.length ? "common.noSearchResults" : "decisions.empty")}</EmptyState>
          </div>
        ) : (
          groups.map((group) => (
            <section className="decision-group" key={group.meetingId}>
              <header className="decision-group-heading">
                <Link
                  className="decision-group-title"
                  to={`/meetings/${group.meeting?.reference ?? group.meetingId}`}
                  data-testid={`decision-group-${group.meetingId}`}
                >
                  <GavelIcon aria-hidden="true" />
                  <span>
                    <strong>
                      {group.meeting
                        ? formatMeetingLabel(group.meeting, t("meetings.occurrenceLabel"), formatDate)
                        : t("minutes.sourceMeeting")}
                    </strong>
                    {group.meeting ? (
                      <span className="decision-group-meta">
                        <MeetingStatusBadge status={group.meeting.phase} stale={group.meeting.stale} />
                      </span>
                    ) : null}
                  </span>
                </Link>
              </header>
              <ListRows data-wrap="true" data-layout-flow="true">
                {group.decisions.map((decision) => (
                  <ListRow
                    key={decision.id}
                    to={`/council-decisions/${decision.id}`}
                    openTestId={`decision-open-${decision.id}`}
                    head={
                      <ListRowIcon nature="council">
                        <GavelIcon />
                      </ListRowIcon>
                    }
                    title={decision.title}
                    detail={decision.number ?? undefined}
                    status={{
                      tone: decision.state === "draft" ? "neutral" : "success",
                      label: t(decision.state === "draft" ? "decisionDocument.draft" : "decisionDocument.frozen"),
                    }}
                  />
                ))}
              </ListRows>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
