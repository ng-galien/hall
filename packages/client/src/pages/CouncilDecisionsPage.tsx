// TODO REMOVE_STALE: propagate incomplete session marker to canonical status badge.
import type { CouncilDecisionSummary } from "@hall/api-contract";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { GavelIcon } from "../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { Badge } from "../components/ui/badge";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../features/status/DomainStatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

export function CouncilDecisionsPage() {
  const { t, formatDate } = useI18n();
  const { councilDecisions, error, loading, load } = useCouncilDecisionsStore();
  useEffect(() => {
    void load();
  }, [load]);
  const { meetings } = useCouncilMeetingsStore();
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const groups = useMemo(() => {
    const grouped = new Map<string, CouncilDecisionSummary[]>();
    for (const decision of councilDecisions.filter((entry) => matchesQuery(query, entry.number, entry.title))) {
      grouped.set(decision.councilMeetingId, [...(grouped.get(decision.councilMeetingId) ?? []), decision]);
    }
    return [...grouped]
      .map(([meetingId, decisions]) => ({
        meetingId,
        meeting: meetings.find((entry) => entry.id === meetingId),
        decisions,
      }))
      .sort((a, b) => (b.meeting?.scheduledAt ?? "").localeCompare(a.meeting?.scheduledAt ?? ""));
  }, [councilDecisions, meetings, query]);
  return (
    <div className="page" data-testid="decisions-page">
      <PageHeader title={t("decisions.title")} description={t("decisions.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout} />
        {loading && councilDecisions.length === 0 ? (
          <p data-testid="decisions-loading">{t("common.loading")}</p>
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
              <div className={layout === "cards" ? "card-grid" : "data-list"}>
                {group.decisions.map((decision) => (
                  <Link
                    key={decision.id}
                    className={layout === "cards" ? "entity-card" : "data-row linked"}
                    to={`/council-decisions/${decision.id}`}
                    data-testid={`decision-open-${decision.id}`}
                  >
                    <div>
                      {decision.number ? <span className="entity-card-eyebrow">{decision.number}</span> : null}
                      <strong>{decision.title}</strong>
                    </div>
                    <Badge variant="secondary">
                      {t(decision.state === "draft" ? "decisionDocument.draft" : "decisionDocument.frozen")}
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
