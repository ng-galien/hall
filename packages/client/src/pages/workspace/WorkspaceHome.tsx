import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { HelpHint } from "../../components/HelpHint";
import { CalendarIcon, ChevronRightIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { CouncilMeetingView } from "../../models/councilMeeting";
import { useApplicationSyncStore } from "../../stores/applicationSyncStore";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import {
  useWorkspaceCouncilActivityStore,
  type WorkspaceBusinessOccurrence,
  workspaceAgendaSubjectKeys,
} from "../../stores/workspaceCouncilActivityStore";
import type { WorkspaceSelection } from "./workspaceItemReference";

type BusinessRow = { business: CouncilBusinessView; occurrences: WorkspaceBusinessOccurrence[] };
type MeetingGroup = { meeting: CouncilMeetingView; rows: BusinessRow[] };

/** Resume preparation through the actual meeting occurrences of each business. */
export function WorkspaceHome({ onSelect }: { onSelect(selection: WorkspaceSelection, path?: string): void }) {
  const { t, formatNumber, formatDate } = useI18n();
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const businessLoading = useCouncilBusinessStore((state) => state.loading);
  const businessError = useCouncilBusinessStore((state) => state.error);
  const meetingLoading = useCouncilMeetingsStore((state) => state.loading);
  const meetingError = useCouncilMeetingsStore((state) => state.error);
  const initializing = useApplicationSyncStore((state) => state.phase === "initializing");
  const {
    occurrencesByBusinessId,
    loading: activityLoading,
    error: activityError,
    load: loadActivity,
  } = useWorkspaceCouncilActivityStore();

  useEffect(() => {
    if (!businessLoading && !meetingLoading) void loadActivity();
  }, [businessLoading, meetingLoading, loadActivity]);

  const { groups, unscheduled } = useMemo(() => {
    const byMeeting = new Map<string, MeetingGroup>();
    const unscheduled: BusinessRow[] = [];
    for (const business of businesses) {
      const occurrences = occurrencesByBusinessId[business.id] ?? [];
      const active = occurrences.filter(
        ({ meeting, agendaItem }) => meeting.phase !== "closed" && agendaItem.position > 0,
      );
      if (active.length === 0) {
        const completed = occurrences.some(
          ({ meeting, agendaItem }) => meeting.phase === "closed" && agendaItem.completedAt !== null,
        );
        const deprogrammed = occurrences.some(
          ({ meeting, agendaItem }) => meeting.phase !== "closed" && agendaItem.position < 0,
        );
        if (!completed || deprogrammed) unscheduled.push({ business, occurrences: [] });
        continue;
      }
      for (const occurrence of active) {
        let group = byMeeting.get(occurrence.meeting.id);
        if (!group) {
          group = { meeting: occurrence.meeting, rows: [] };
          byMeeting.set(occurrence.meeting.id, group);
        }
        const row = group.rows.find((row) => row.business.id === business.id);
        if (row) row.occurrences.push(occurrence);
        else group.rows.push({ business, occurrences: [occurrence] });
      }
    }
    const groups = [...byMeeting.values()].sort((left, right) => {
      if (left.meeting.scheduledAt && right.meeting.scheduledAt)
        return left.meeting.scheduledAt.localeCompare(right.meeting.scheduledAt);
      if (left.meeting.scheduledAt) return -1;
      if (right.meeting.scheduledAt) return 1;
      return left.meeting.number - right.meeting.number;
    });
    for (const group of groups) {
      for (const row of group.rows)
        row.occurrences.sort((left, right) => left.agendaItem.position - right.agendaItem.position);
      group.rows.sort(
        (left, right) => left.occurrences[0].agendaItem.position - right.occurrences[0].agendaItem.position,
      );
    }
    unscheduled.sort((left, right) => right.business.updatedAt.localeCompare(left.business.updatedAt));
    return { groups, unscheduled };
  }, [businesses, occurrencesByBusinessId]);

  const renderBusiness = ({ business, occurrences }: BusinessRow) => (
    <ListRow
      key={business.id}
      onOpen={() => onSelect({ kind: "councilBusiness", id: business.id }, business.folderPath)}
      openTestId={`workspace-home-business-${business.id}`}
      head={<CouncilBusinessGlyph business={business} />}
      title={business.title}
      detail={
        <>
          {occurrences.map(({ agendaItem }) => (
            <span data-testid={`workspace-home-subject-${agendaItem.id}`} key={agendaItem.id}>
              {t(workspaceAgendaSubjectKeys[agendaItem.subject.kind])}
              {agendaItem.agendaNumber === null
                ? null
                : ` · ${t("workspace.agendaPosition", { position: formatNumber(agendaItem.agendaNumber) })}`}
              {" · "}
            </span>
          ))}
          {business.folderPath ? business.folderPath.split("/").filter(Boolean).join(" › ") : t("workspace.unfiled")}
        </>
      }
    />
  );

  const error = businessError ?? meetingError ?? activityError;
  const loading = initializing || businessLoading || meetingLoading || activityLoading;
  const retry = async () => {
    await Promise.all([useCouncilBusinessStore.getState().load(), useCouncilMeetingsStore.getState().load()]);
    await loadActivity();
  };
  return (
    <div className="whome">
      <header className="whome-intro">
        <h2>{t("workspace.home.title")}</h2>
        <HelpHint text={t("workspace.home.description")} />
      </header>
      {error ? (
        <div className="workspace-list-empty" role="alert" data-testid="workspace-home-error">
          <p>{t("workspace.home.loadError")}</p>
          <Button
            variant="secondary"
            data-testid="workspace-home-retry"
            disabled={loading}
            onClick={() => void retry()}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : loading ? (
        <p className="workspace-list-empty" role="status" data-testid="workspace-home-loading">
          {t("common.loading")}
        </p>
      ) : groups.length === 0 && unscheduled.length === 0 ? (
        <p className="workspace-list-empty" data-testid="workspace-home-empty">
          {t("workspace.home.empty")}
        </p>
      ) : (
        <div className="whome-work">
          {groups.map(({ meeting, rows }) => (
            <section
              className="whome-group"
              data-testid={`workspace-home-meeting-${meeting.id}`}
              aria-labelledby={`whome-meeting-${meeting.id}`}
              key={meeting.id}
            >
              <div className="whome-group-heading">
                <CalendarIcon aria-hidden="true" />
                <h3 id={`whome-meeting-${meeting.id}`}>
                  {formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate, t("workspace.dateToSet"))}
                </h3>
                <Link
                  className="whome-meeting-link"
                  data-testid={`workspace-home-meeting-link-${meeting.id}`}
                  to={`/meetings/${meeting.reference}`}
                >
                  {t("workspace.home.openMeeting")}
                  <ChevronRightIcon aria-hidden="true" />
                </Link>
              </div>
              <ListRows>{rows.map(renderBusiness)}</ListRows>
            </section>
          ))}
          {unscheduled.length > 0 ? (
            <section
              className="whome-group"
              data-testid="workspace-home-unscheduled"
              aria-labelledby="whome-unscheduled"
            >
              <div className="whome-group-heading">
                <h3 id="whome-unscheduled">{t("workspace.home.instruction")}</h3>
              </div>
              <ListRows>{unscheduled.map(renderBusiness)}</ListRows>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
