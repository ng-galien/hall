import type { CouncilDecisionListEntry } from "@hall/domain";
import { useMemo } from "react";
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
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge, StatusBadge } from "../features/status/DomainStatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import type { CouncilMeetingView } from "../models/councilMeeting";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

interface DecisionGroup {
  meeting: CouncilMeetingView | null;
  decisions: CouncilDecisionListEntry[];
}

export function CouncilDecisionsPage() {
  const { t, formatDate } = useI18n();
  const { councilDecisions, error } = useCouncilDecisionsStore();
  const { meetings } = useCouncilMeetingsStore();
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const visibleDecisions = councilDecisions.filter((decision) =>
    matchesQuery(query, decision.number, decision.title, decision.draftText),
  );

  const groups = useMemo<DecisionGroup[]>(() => {
    const byMeeting = new Map<string | null, CouncilDecisionListEntry[]>();
    for (const decision of visibleDecisions) {
      const key = decision.meetingId;
      byMeeting.set(key, [...(byMeeting.get(key) ?? []), decision]);
    }
    const meetingGroups = [...byMeeting.entries()]
      .filter(([meetingId]) => meetingId !== null)
      .map(([meetingId, decisions]) => ({
        meeting: meetings.find((meeting) => meeting.id === meetingId) ?? null,
        decisions,
      }))
      .sort((left, right) =>
        (right.meeting?.scheduledAt ?? "").localeCompare(left.meeting?.scheduledAt ?? ""),
      );
    const unscheduled = byMeeting.get(null);
    return unscheduled ? [{ meeting: null, decisions: unscheduled }, ...meetingGroups] : meetingGroups;
  }, [visibleDecisions, meetings]);

  return (
    <div className="page">
      <PageHeader title={t("decisions.title")} description={t("decisions.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout} />
        {visibleDecisions.length === 0 ? (
          <EmptyState>{t(councilDecisions.length === 0 ? "decisions.empty" : "common.noSearchResults")}</EmptyState>
        ) : (
          groups.map((group) => (
            <section className="decision-group" key={group.meeting?.id ?? "unscheduled"}>
              <header className="decision-group-heading">
                {group.meeting ? (
                  <Link className="decision-group-title" to={`/meetings/${group.meeting.reference}`}>
                    <GavelIcon aria-hidden="true" />
                    <span>
                      <strong>{formatMeetingLabel(group.meeting, t("meetings.occurrenceLabel"), formatDate)}</strong>
                      <span className="decision-group-meta">
                        {group.meeting.scheduledAt ? formatDate(group.meeting.scheduledAt) : t("dashboard.toSchedule")} ·{" "}
                        <MeetingStatusBadge status={group.meeting.phase} />
                      </span>
                    </span>
                  </Link>
                ) : (
                  <span className="decision-group-title">
                    <span>
                      <strong>{t("decisions.unscheduledGroup")}</strong>
                      <span className="decision-group-meta">{t("decisions.unscheduledGroupHint")}</span>
                    </span>
                  </span>
                )}
              </header>
              {layout === "cards" ? (
                <div className="card-grid">
                  {group.decisions.map((decision) =>
                    group.meeting ? (
                      <Link className="entity-card" key={decision.id} to={`/meetings/${group.meeting.reference}`}>
                        <span className="entity-card-eyebrow">{decision.number ?? t("decisions.draft")}</span>
                        <strong>{decision.title}</strong>
                        <p>{decision.draftText || t("decisions.textIncomplete")}</p>
                        <span className="entity-card-footer">
                          <StatusBadge value={decision.status} />
                        </span>
                      </Link>
                    ) : (
                      <div className="entity-card" key={decision.id}>
                        <span className="entity-card-eyebrow">{decision.number ?? t("decisions.draft")}</span>
                        <strong>{decision.title}</strong>
                        <p>{decision.draftText || t("decisions.textIncomplete")}</p>
                        <span className="entity-card-footer">
                          <StatusBadge value={decision.status} />
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="data-list">
                  {group.decisions.map((decision) => {
                    const rowContent = (
                      <>
                        <div>
                          <strong>
                            {decision.number ?? t("decisions.draft")} · {decision.title}
                          </strong>
                          <span>{decision.draftText || t("decisions.textIncomplete")}</span>
                        </div>
                        <StatusBadge value={decision.status} />
                      </>
                    );
                    return group.meeting ? (
                      <Link className="data-row linked" key={decision.id} to={`/meetings/${group.meeting.reference}`}>
                        {rowContent}
                      </Link>
                    ) : (
                      <div className="data-row" key={decision.id}>
                        {rowContent}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
