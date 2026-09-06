import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarAddIcon,
  CloseIcon,
  EditIcon,
  LockIcon,
  OpenIcon,
  PinIcon,
  PinnedIcon,
} from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
  useDocumentaryResourceTypeLabel,
} from "../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { useWorkspaceResourceImageUpload } from "../../features/documents/useWorkspaceResourceImageUpload";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useResourceSession } from "../../features/resources/useResourceSession";
import { MeetingStatusBadge, StatusBadge } from "../../features/status/DomainStatusBadge";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { deprogramMeetingAgendaItem } from "../../services/councilMeetingsApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import {
  useWorkspaceCouncilActivityStore,
  workspaceAgendaItemStatus,
  workspaceAgendaSubjectKeys,
  workspaceCurrentOccurrence,
} from "../../stores/workspaceCouncilActivityStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { ResourcePicker } from "./ResourcePicker";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import { useWorkspacePrefsStore } from "./workspacePrefs";

type SchedulableSubjectKind = "councilDecisionProposal" | "openQuestion";

export function CouncilBusinessWorkbench({ business }: { business: CouncilBusinessView }) {
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useWorkspaceResourceImageUpload();
  const { t, formatDate, formatTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const folderRepresentation = useWorkspaceResourcesStore(
    (state) => state.representations[business.folderResourceId] ?? null,
  );
  const folderCapabilities = resourceCapabilities(folderRepresentation);
  const reportSession = useResourceSession({ resourceId: business.reportResourceId });
  const businessCapabilities = useCouncilBusinessStore((state) => state.capabilitiesById[business.id]);
  const allOccurrences = useWorkspaceCouncilActivityStore((state) => state.occurrencesByBusinessId);
  const occurrences = allOccurrences[business.id] ?? [];
  const loadCouncilActivity = useWorkspaceCouncilActivityStore((state) => state.load);
  const typeLabel = useDocumentaryResourceTypeLabel();
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [meetingChoice, setMeetingChoice] = useState("");
  const [subjectKind, setSubjectKind] = useState<SchedulableSubjectKind>("councilDecisionProposal");
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "councilBusiness", id: business.id });
  const currentOccurrence = workspaceCurrentOccurrence(occurrences);
  const previousOccurrences = occurrences.filter(
    (occurrence) => occurrence.agendaItem.id !== currentOccurrence?.agendaItem.id,
  );
  const currentMeeting = currentOccurrence?.meeting ?? null;
  const proposal =
    currentOccurrence?.agendaItem.subject.kind === "councilDecisionProposal"
      ? currentOccurrence.agendaItem.subject
      : null;
  const proposalSession = useResourceSession({ resourceId: proposal?.textResourceId ?? null });
  const proposalEditable = proposalSession.editable && !currentMeeting?.startedAt;
  const editable = reportSession.editable || proposalEditable;

  useEffect(() => {
    void Promise.all([loadCouncilActivity(), useCouncilBusinessStore.getState().loadResources(business.id)]);
  }, [business.id, loadCouncilActivity]);

  const act = (action: () => Promise<boolean>) =>
    run(async () => {
      setActionError(null);
      try {
        const completed = await action();
        if (!completed) {
          setActionError(useCouncilBusinessStore.getState().error);
          return false;
        }
        await loadCouncilActivity();
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        return false;
      }
    });

  const renameBusiness = async (nextTitle: string) => {
    const renamed = await run(async () => {
      setActionError(null);
      const folder = await useWorkspaceResourcesStore.getState().relocate(business.folderResourceId, {
        path: business.folderPath,
        name: nextTitle,
      });
      if (!folder) {
        setActionError(useWorkspaceResourcesStore.getState().error);
        return false;
      }
      return Boolean(await useCouncilBusinessStore.getState().refresh(business.id));
    });
    return Boolean(renamed);
  };

  const saveReport = async () => {
    const saved = await reportSession.save();
    if (saved) await useCouncilBusinessStore.getState().refresh(business.id);
    return saved;
  };

  const moveResource = (resourceId: string, offset: number) => {
    const resourceIds = business.resources.map((resource) => resource.id);
    const index = resourceIds.indexOf(resourceId);
    const target = index + offset;
    if (target < 0 || target >= resourceIds.length) return;
    [resourceIds[index], resourceIds[target]] = [resourceIds[target]!, resourceIds[index]!];
    void act(() => useCouncilBusinessStore.getState().reorderResources(business.id, resourceIds));
  };

  const removeResource = (resourceId: string) =>
    act(() => useCouncilBusinessStore.getState().dissociateResource(business.id, resourceId));

  const associateResource = (resourceId: string) =>
    act(() => useCouncilBusinessStore.getState().associateResource(business.id, resourceId));

  const associatedIds = useMemo(
    () => new Set([business.folderResourceId, business.reportResourceId, ...business.resources.map(({ id }) => id)]),
    [business.folderResourceId, business.reportResourceId, business.resources],
  );
  const candidateResources = useMemo(
    () =>
      Object.values(summaries).filter(
        (resource): resource is DocumentaryLeafSummary => resource.kind !== "folder" && !associatedIds.has(resource.id),
      ),
    [associatedIds, summaries],
  );
  const suggestions = candidateResources.filter((resource) => resource.path === business.folderPath);
  const otherCandidates = candidateResources.filter((resource) => resource.path !== business.folderPath);
  const composableMeetings = meetings.filter((meeting) => meeting.phase === "draft" || meeting.phase === "scheduled");
  const canSchedule =
    !currentOccurrence &&
    (subjectKind === "councilDecisionProposal"
      ? Boolean(businessCapabilities?.scheduleDecisionProposal)
      : Boolean(businessCapabilities?.scheduleOpenQuestion));

  const schedule = () => {
    if (!meetingChoice || !canSchedule) return;
    const occupiedPositions = Object.values(allOccurrences)
      .flat()
      .filter(({ meeting }) => meeting.id === meetingChoice)
      .map(({ agendaItem }) => Math.abs(agendaItem.position));
    const position = Math.max(0, ...occupiedPositions) + 1;
    void act(async () => {
      const scheduled = await useCouncilBusinessStore
        .getState()
        .schedule(business.id, subjectKind, meetingChoice, position);
      if (scheduled) setMeetingChoice("");
      return scheduled;
    });
  };

  const unschedule = () => {
    if (!currentOccurrence) return;
    void run(async () => {
      setActionError(null);
      try {
        await deprogramMeetingAgendaItem(currentOccurrence.meeting.reference, currentOccurrence.agendaItem.id);
        await loadCouncilActivity();
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        return false;
      }
    });
  };

  const currentStatus = currentOccurrence ? workspaceAgendaItemStatus(currentOccurrence.agendaItem) : null;
  const resourceActionsAvailable = Boolean(
    businessCapabilities?.associateResource ||
      businessCapabilities?.dissociateResource ||
      businessCapabilities?.reorderResources,
  );

  return (
    <div className="workbench workspace-business-workbench" data-testid="council-business-workbench">
      <WorkspaceWorkbenchHeader
        icon={<CouncilBusinessGlyph business={business} large />}
        title={business.title}
        titleLabel={t("meeting.subject")}
        date={
          editable ? { kind: "updated", value: business.updatedAt } : { kind: "created", value: business.createdAt }
        }
        onTitleChange={folderCapabilities.relocate ? renameBusiness : undefined}
        hint={
          reportSession.resource ? (
            <span
              data-testid="business-edit-hint"
              className={`workbench-edit-hint${editable ? "" : " workbench-edit-hint-locked"}`}
            >
              {editable ? <EditIcon aria-hidden="true" /> : <LockIcon aria-hidden="true" />}
              {t(editable ? "workspace.editableHint" : "workspace.lockedHint")}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t(pinned ? "workspace.unpinShort" : "workspace.pin")}
                  aria-pressed={pinned}
                  onClick={() => togglePin({ kind: "councilBusiness", id: business.id })}
                >
                  {pinned ? <PinnedIcon /> : <PinIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t(pinned ? "workspace.unpinShort" : "workspace.pin")}</TooltipContent>
            </Tooltip>
            {currentStatus ? <StatusBadge value={currentStatus} /> : null}
          </>
        }
        actionError={actionError ?? reportSession.actionError}
      />

      <div className="workbench-grid">
        <div className="workbench-main">
          <section className="workbench-section" aria-labelledby="workbench-info">
            <div className="grid gap-1.5">
              <Label>{t("meeting.report")}</Label>
              {reportSession.resource ? (
                reportSession.editable ? (
                  <div data-testid="business-report-editor">
                    <MarkdownEditor
                      title={`${t("meeting.report")} : ${business.title}`}
                      markdown={reportSession.content}
                      onChange={reportSession.setContent}
                      mentionables={mentionables}
                      searchContext={business.folderPath}
                      onUploadImage={
                        canUploadImage
                          ? (file) => uploadImage(file, { kind: "textResourceContent", id: business.reportResourceId })
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <div data-testid="business-report-readonly">
                    {reportSession.content ? (
                      <MarkdownView markdown={reportSession.content} />
                    ) : (
                      <p className="workspace-list-empty">{t("meeting.itemReportEmpty")}</p>
                    )}
                  </div>
                )
              ) : (
                <p>{t("common.loading")}</p>
              )}
              {reportSession.editable ? <p className="text-xs text-muted">{t("meeting.reportHint")}</p> : null}
            </div>
            {currentOccurrence?.agendaItem.subject.kind === "councilDecisionProposal" ? (
              <div className="workbench-decision-block" data-testid="business-proposal-editor">
                <div className="grid gap-1.5">
                  <Label>{t("meeting.draftDecision")}</Label>
                  {proposalSession.resource ? (
                    proposalEditable ? (
                      <MarkdownEditor
                        title={`${t("meeting.draftDecision")} : ${business.title}`}
                        markdown={currentMeeting?.startedAt ? (proposal?.content ?? "") : proposalSession.content}
                        onChange={proposalSession.setContent}
                        mentionables={mentionables}
                        searchContext={business.folderPath}
                      />
                    ) : (
                      <div data-testid="business-proposal-readonly">
                        <MarkdownView
                          markdown={currentMeeting?.startedAt ? (proposal?.content ?? "") : proposalSession.content}
                        />
                      </div>
                    )
                  ) : (
                    <p>{t("common.loading")}</p>
                  )}
                  {proposalEditable ? <p className="text-xs text-muted">{t("meeting.decisionDraftTextHint")}</p> : null}
                  {proposalSession.actionError ? <p role="alert">{t("workspace.proposalSaveError")}</p> : null}
                  {proposalEditable && (!proposalSession.autosaveEnabled || proposalSession.actionError) ? (
                    <Button
                      data-testid="business-proposal-save"
                      disabled={!proposalSession.dirty || proposalSession.submitting}
                      onClick={() => void proposalSession.save()}
                    >
                      {t(proposalSession.submitting ? "common.saving" : "common.save")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {reportSession.editable && (!reportSession.autosaveEnabled || reportSession.actionError) ? (
              <div className="workbench-actions">
                <span className="composer-editor-spacer" />
                <Button
                  data-testid="business-report-save"
                  variant="default"
                  disabled={submitting || reportSession.submitting || !reportSession.dirty || !reportSession.editable}
                  onClick={() => void run(saveReport)}
                >
                  {t(submitting || reportSession.submitting ? "common.saving" : "common.save")}
                </Button>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="workbench-aside">
          {canSchedule || currentMeeting ? (
            <section className="workbench-card" aria-labelledby="workbench-schedule">
              <h2 id="workbench-schedule">{t("workspace.scheduling")}</h2>
              {canSchedule ? (
                <div className="workbench-schedule-stack">
                  <p className="workbench-schedule-hint">{t("workspace.scheduleIntro")}</p>
                  <fieldset className="workbench-subject-choices">
                    <legend>{t("workspace.schedulePurpose")}</legend>
                    <label>
                      <input
                        type="radio"
                        name="agenda-subject-kind"
                        value="councilDecisionProposal"
                        checked={subjectKind === "councilDecisionProposal"}
                        disabled={!businessCapabilities?.scheduleDecisionProposal || submitting}
                        data-testid="business-subject-proposal"
                        onChange={() => setSubjectKind("councilDecisionProposal")}
                      />
                      <span>
                        <strong>{t("agendaSubject.councilDecisionProposal")}</strong>
                        <small>{t("workspace.proposalHint")}</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="agenda-subject-kind"
                        value="openQuestion"
                        checked={subjectKind === "openQuestion"}
                        disabled={!businessCapabilities?.scheduleOpenQuestion || submitting}
                        data-testid="business-subject-question"
                        onChange={() => setSubjectKind("openQuestion")}
                      />
                      <span>
                        <strong>{t("agendaSubject.openQuestion")}</strong>
                        <small>{t("workspace.questionHint")}</small>
                      </span>
                    </label>
                  </fieldset>
                  <p className="workbench-schedule-hint">{t("workspace.ballotTimingHint")}</p>
                  <Label htmlFor="business-target-meeting">{t("workspace.chooseMeeting")}</Label>
                  <Select value={meetingChoice} onValueChange={setMeetingChoice}>
                    <SelectTrigger
                      id="business-target-meeting"
                      data-testid="business-meeting-select"
                      className="w-full"
                      aria-label={t("workspace.chooseMeeting")}
                    >
                      <SelectValue placeholder={t("workspace.chooseMeeting")} />
                    </SelectTrigger>
                    <SelectContent>
                      {composableMeetings.map((meeting) => (
                        <SelectItem
                          data-testid={`business-meeting-option-${meeting.id}`}
                          key={meeting.id}
                          value={meeting.id}
                        >
                          {formatMeetingLabel(
                            meeting,
                            t("meetings.occurrenceLabel"),
                            formatDate,
                            t("workspace.dateToSet"),
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {composableMeetings.length === 0 ? <p>{t("workspace.noPlanningMeeting")}</p> : null}
                  <Button
                    data-testid="business-schedule"
                    variant="default"
                    disabled={submitting || !meetingChoice}
                    onClick={schedule}
                  >
                    <CalendarAddIcon />
                    {t(submitting ? "common.saving" : "meeting.addToAgenda")}
                  </Button>
                </div>
              ) : currentMeeting ? (
                <div className="workbench-schedule-stack">
                  <p data-testid="business-scheduled-kind">
                    {currentOccurrence ? t(workspaceAgendaSubjectKeys[currentOccurrence.agendaItem.subject.kind]) : ""}{" "}
                    ·{" "}
                    {t(
                      currentOccurrence?.agendaItem.subject.kind === "openQuestion"
                        ? "workspace.withoutVote"
                        : "workspace.withVote",
                    )}
                  </p>
                  <Link
                    data-testid="business-meeting-link"
                    className="workbench-meeting-link"
                    to={`/meetings/${currentMeeting.reference}`}
                  >
                    <span className="workspace-row-copy">
                      <strong>
                        {formatMeetingLabel(
                          currentMeeting,
                          t("meetings.occurrenceLabel"),
                          formatDate,
                          t("workspace.dateToSet"),
                        )}
                      </strong>
                      <span>
                        {currentOccurrence && currentOccurrence.agendaItem.position > 0
                          ? t("workspace.agendaPosition").replace(
                              "{position}",
                              formatNumber(currentOccurrence.agendaItem.position),
                            )
                          : ""}
                      </span>
                    </span>
                    <MeetingStatusBadge status={currentMeeting.phase} />
                  </Link>
                  {currentMeeting.phase === "draft" || currentMeeting.phase === "scheduled" ? (
                    <Button
                      data-testid="business-unschedule"
                      variant="outline"
                      disabled={submitting}
                      onClick={unschedule}
                    >
                      {t("workspace.unschedule")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="workbench-card" aria-labelledby="workbench-resources">
            <h2 id="workbench-resources">{t("workspace.associatedResources")}</h2>
            {business.resources.length === 0 ? (
              <p className="workspace-list-empty">{t("workspace.noAssociatedResources")}</p>
            ) : (
              <ul className="workbench-resource-list">
                {business.resources.map((resource, index) => (
                  <li key={resource.id}>
                    <DocumentaryResourceGlyph resource={resource} />
                    <button
                      className="workbench-resource-open"
                      type="button"
                      onClick={() => setViewedResourceId(resource.id)}
                    >
                      <span className="workspace-row-copy">
                        <strong>{resource.name}</strong>
                        <span>{typeLabel(resource)}</span>
                      </span>
                    </button>
                    {resourceActionsAvailable ? (
                      <span className="workbench-resource-tools">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("meeting.moveUp")}
                          disabled={submitting || index === 0 || !businessCapabilities?.reorderResources}
                          onClick={() => moveResource(resource.id, -1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("meeting.moveDown")}
                          disabled={
                            submitting ||
                            index === business.resources.length - 1 ||
                            !businessCapabilities?.reorderResources
                          }
                          onClick={() => moveResource(resource.id, 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("workspace.dissociate").replace("{name}", resource.name)}
                          disabled={submitting || !businessCapabilities?.dissociateResource}
                          onClick={() => void removeResource(resource.id)}
                        >
                          <CloseIcon />
                        </Button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {businessCapabilities?.associateResource ? (
              <ResourcePicker
                suggestions={suggestions}
                others={otherCandidates}
                disabled={submitting}
                onPick={(resourceId) => void associateResource(resourceId)}
              />
            ) : null}
          </section>

          <section className="workbench-card" aria-labelledby="workbench-occurrences">
            <h2 id="workbench-occurrences">{t("workspace.occurrences")}</h2>
            {previousOccurrences.length === 0 ? (
              <p className="workspace-list-empty">{t("workspace.noPreviousOccurrences")}</p>
            ) : (
              <ul className="workbench-occurrence-list">
                {previousOccurrences.map((occurrence) => {
                  const status = workspaceAgendaItemStatus(occurrence.agendaItem);
                  return (
                    <li key={occurrence.agendaItem.id}>
                      <Link className="workbench-occurrence" to={`/meetings/${occurrence.meeting.reference}`}>
                        <span className="workspace-row-copy">
                          <strong>
                            {formatMeetingLabel(
                              occurrence.meeting,
                              t("meetings.occurrenceLabel"),
                              formatDate,
                              t("workspace.dateToSet"),
                            )}
                          </strong>
                          {occurrence.agendaItem.startedAt ? (
                            <span>{formatTime(occurrence.agendaItem.startedAt)}</span>
                          ) : null}
                        </span>
                        <span className="workbench-occurrence-side">
                          <StatusBadge value={status} />
                          <OpenIcon aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {viewedResourceId ? (
        <ResourcePreview resourceId={viewedResourceId} onClose={() => setViewedResourceId(null)} />
      ) : null}
    </div>
  );
}
