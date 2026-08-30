import type { CouncilBusiness, CouncilDecisionListEntry, CouncilMeeting, MeetingAggregate } from "@hall/domain";
import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ChevronRightIcon, FolderIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { getCouncilMeeting } from "../../services/councilMeetingsApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import type { WorkspaceSelection } from "./WorkspacePage";

type BusinessOccurrence = {
  meeting: CouncilMeeting;
  position: number;
  status: MeetingAggregate["agendaItems"][number]["status"];
};

type ActiveBusiness = {
  business: CouncilBusiness;
  decision: CouncilDecisionListEntry | null;
  occurrence: BusinessOccurrence | null;
  stage: "scheduled" | "ready" | "instruction";
};

type ActiveFolder = {
  path: string;
  name: string;
  businessCount: number;
  resourceCount: number;
};

const FINAL_DECISION_STATUSES = new Set(["adopted", "rejected", "enforceable"]);
const CLOSED_OCCURRENCE_STATUSES = new Set(["examined", "withdrawn"]);

function topFolder(path: string) {
  return path.split("/").filter(Boolean)[0] ?? "";
}

function businessStage(decision: CouncilDecisionListEntry | null, occurrence: BusinessOccurrence | null) {
  if (
    decision?.status === "scheduled" ||
    occurrence?.meeting.status === "scheduled" ||
    occurrence?.meeting.status === "inProgress"
  ) {
    return "scheduled" as const;
  }
  if (decision?.status === "ready") return "ready" as const;
  return "instruction" as const;
}

/** Workspace landing page: current council work and the folders that support it. */
export function WorkspaceHome({ onSelect }: { onSelect(selection: WorkspaceSelection, path?: string): void }) {
  const { t, formatNumber, formatDate } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const { meetings } = useCouncilMeetingsStore();
  const { resources } = useResourcesStore();
  const [meetingAggregates, setMeetingAggregates] = useState<MeetingAggregate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMeetingAggregates(null);
    void Promise.all(meetings.map((meeting) => getCouncilMeeting(meeting.id))).then(
      (aggregates) => {
        if (!cancelled) setMeetingAggregates(aggregates);
      },
      () => {
        if (!cancelled) setMeetingAggregates([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [meetings]);

  const occurrences = useMemo(() => {
    const byBusiness = new Map<string, BusinessOccurrence[]>();
    for (const aggregate of meetingAggregates ?? []) {
      for (const item of aggregate.agendaItems) {
        const current = byBusiness.get(item.business.id) ?? [];
        current.push({ meeting: aggregate.meeting, position: item.position, status: item.status });
        byBusiness.set(item.business.id, current);
      }
    }
    return byBusiness;
  }, [meetingAggregates]);

  const activeBusinesses = useMemo<ActiveBusiness[]>(() => {
    return businesses
      .flatMap((business) => {
        const decision =
          business.kind === "matter" && business.councilDecisionId
            ? (councilDecisions.find((candidate) => candidate.id === business.councilDecisionId) ?? null)
            : null;
        if (decision && FINAL_DECISION_STATUSES.has(decision.status)) return [];

        const businessOccurrences = occurrences.get(business.id) ?? [];
        const activeOccurrence = businessOccurrences.find(
          ({ meeting, status }) => !["closed", "cancelled"].includes(meeting.status) || status === "postponed",
        );
        const closedOccurrence = businessOccurrences.some(
          ({ meeting, status }) => meeting.status === "closed" && CLOSED_OCCURRENCE_STATUSES.has(status),
        );
        if (meetingAggregates && closedOccurrence && !activeOccurrence) return [];

        const occurrence = activeOccurrence ?? null;
        return [{ business, decision, occurrence, stage: businessStage(decision, occurrence) }];
      })
      .sort((left, right) => {
        const rank = { scheduled: 0, ready: 1, instruction: 2 };
        const stageRank = rank[left.stage] - rank[right.stage];
        if (stageRank !== 0) return stageRank;
        if (left.occurrence && right.occurrence) {
          const meetingOrder = left.occurrence.meeting.startsAt.localeCompare(right.occurrence.meeting.startsAt);
          if (meetingOrder !== 0) return meetingOrder;
          return left.occurrence.position - right.occurrence.position;
        }
        return right.business.updatedAt.localeCompare(left.business.updatedAt);
      });
  }, [businesses, councilDecisions, meetingAggregates, occurrences]);

  const scheduledBusinesses = activeBusinesses.filter((item) => item.stage === "scheduled");
  const instructionBusinesses = activeBusinesses.filter((item) => item.stage !== "scheduled");
  const activeFolders = useMemo<ActiveFolder[]>(() => {
    const folderPaths = new Set(activeBusinesses.map(({ business }) => topFolder(business.folderPath)).filter(Boolean));
    return [...folderPaths]
      .map((path) => ({
        path,
        name: path,
        businessCount: activeBusinesses.filter(({ business }) => topFolder(business.folderPath) === path).length,
        resourceCount: resources.filter((resource) => topFolder(resource.folderPath) === path).length,
      }))
      .sort((left, right) => right.businessCount - left.businessCount || left.name.localeCompare(right.name, "fr-FR"));
  }, [activeBusinesses, resources]);

  const renderBusiness = ({ business, occurrence }: ActiveBusiness) => (
    <button
      className="whome-business"
      data-testid={`workspace-home-business-${business.id}`}
      type="button"
      key={business.id}
      onClick={() => onSelect({ kind: "councilBusiness", id: business.id }, business.folderPath)}
    >
      <span className="whome-business-copy">
        <strong>{business.title}</strong>
        <span>
          {business.folderPath || t("workspace.unfiled")}
          {occurrence ? ` · ${formatDate(occurrence.meeting.startsAt)}` : ""}
          {business.resources.length > 0
            ? ` · ${t(
                business.resources.length === 1 ? "workspace.linkedDocument" : "workspace.linkedDocuments",
              ).replace("{count}", formatNumber(business.resources.length))}`
            : ""}
        </span>
      </span>
      <ChevronRightIcon aria-hidden="true" />
    </button>
  );

  return (
    <div className="whome">
      <header className="whome-intro">
        <div>
          <span className="whome-kicker">{t("workspace.home.kicker")}</span>
          <h2>{t("workspace.home.title")}</h2>
          <p>{t("workspace.home.description")}</p>
        </div>
        <p className="whome-count" data-testid="workspace-home-active-count">
          <strong>{formatNumber(activeBusinesses.length)}</strong>
          <span>{t(activeBusinesses.length === 1 ? "workspace.home.activeOne" : "workspace.home.activeMany")}</span>
        </p>
      </header>

      <div className="whome-layout">
        <section className="whome-work" aria-label={t("workspace.home.title")}>
          {activeBusinesses.length === 0 ? (
            <p className="workspace-list-empty">{t("workspace.home.empty")}</p>
          ) : (
            <>
              {scheduledBusinesses.length > 0 ? (
                <div className="whome-group">
                  <div className="whome-group-heading">
                    <CalendarIcon aria-hidden="true" />
                    <h4>{t("workspace.home.scheduled")}</h4>
                    <span>{formatNumber(scheduledBusinesses.length)}</span>
                  </div>
                  <div className="whome-businesses">{scheduledBusinesses.map(renderBusiness)}</div>
                </div>
              ) : null}
              {instructionBusinesses.length > 0 ? (
                <div className="whome-group">
                  <div className="whome-group-heading">
                    <h4>{t("workspace.home.instruction")}</h4>
                    <span>{formatNumber(instructionBusinesses.length)}</span>
                  </div>
                  <div className="whome-businesses">{instructionBusinesses.map(renderBusiness)}</div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="whome-folders" aria-labelledby="whome-folders-heading">
          <div className="whome-folders-heading">
            <div>
              <h3 id="whome-folders-heading">{t("workspace.home.activeFolders")}</h3>
              <p>{t("workspace.home.activeFoldersHint")}</p>
            </div>
            <span>{formatNumber(activeFolders.length)}</span>
          </div>
          <div className="whome-folder-list">
            {activeFolders.map((folder) => (
              <button
                className="whome-folder"
                data-testid={`workspace-home-folder-${folder.path}`}
                type="button"
                key={folder.path}
                onClick={() => onSelect(null, folder.path)}
              >
                <FolderIcon aria-hidden="true" />
                <span>
                  <strong>{folder.name}</strong>
                  <small>
                    {t(
                      folder.businessCount === 1 ? "workspace.home.businessOne" : "workspace.home.businessMany",
                    ).replace("{count}", formatNumber(folder.businessCount))}
                    {` · ${t(
                      folder.resourceCount === 1 ? "workspace.home.documentOne" : "workspace.home.documentMany",
                    ).replace("{count}", formatNumber(folder.resourceCount))}`}
                  </small>
                </span>
                <ChevronRightIcon aria-hidden="true" />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
