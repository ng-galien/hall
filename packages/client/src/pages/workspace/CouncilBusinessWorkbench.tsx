import { findSirenAction, type SirenEntity } from "@hall/api-contract";
import type { CouncilBusiness, CouncilBusinessDetails, DocumentResource } from "@hall/domain";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  GavelIcon,
  LockIcon,
  OpenIcon,
  PinIcon,
  PinnedIcon,
} from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { RequestErrorBanner } from "../../components/Ui";
import { councilBusinessKindKeys } from "../../features/council-business/presentation";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { ResourceGlyph, useResourceTypeLabel } from "../../features/documents/ResourceGlyph";
import { useResourceImageUpload } from "../../features/documents/useResourceImageUpload";
import { MeetingStatusBadge, StatusBadge } from "../../features/status/DomainStatusBadge";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import {
  attachCouncilDecision,
  detachCouncilDecision,
  getCouncilBusinessDetailsSiren,
  scheduleCouncilBusiness,
  updateCouncilBusiness,
} from "../../services/councilBusinessApi";
import { updateCouncilDecision } from "../../services/councilDecisionsApi";
import { deleteMeetingAgendaItem, getCouncilMeeting } from "../../services/councilMeetingsApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { MeetingDocumentViewer } from "../council-meetings/MeetingDocumentViewer";
import { ResourcePicker } from "./ResourcePicker";
import type { WorkspaceSelection } from "./WorkspacePage";
import { useWorkspacePrefsStore } from "./workspacePrefs";

export function CouncilBusinessWorkbench({
  business,
  onSelect,
}: {
  business: CouncilBusiness;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useResourceImageUpload();
  const { t, formatDate, formatTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const { resources, download } = useResourcesStore();
  const { meetings } = useCouncilMeetingsStore();
  const typeLabel = useResourceTypeLabel();
  const [details, setDetails] = useState<CouncilBusinessDetails | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity<Record<string, unknown>> | null>(null);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [title, setTitle] = useState(business.title);
  const [report, setReport] = useState(business.report);
  const [draftText, setDraftText] = useState("");
  const [meetingChoice, setMeetingChoice] = useState("");
  const [viewedDocument, setViewedDocument] = useState<DocumentResource | null>(null);
  const titleFieldId = useId();
  const can = (
    name:
      | "council-business.update"
      | "council-business.schedule"
      | "council-business.attach-decision"
      | "council-business.detach-decision"
      | "agenda-item.remove",
  ) => Boolean(representation && findSirenAction(representation, name));
  const editable = can("council-business.update");
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "councilBusiness", id: business.id });

  const reloadStores = () =>
    Promise.all([
      useCouncilBusinessStore.getState().load(),
      useCouncilDecisionsStore.getState().load(),
      useResourcesStore.getState().load(),
    ]);

  const refreshDetails = useCallback(async () => {
    try {
      const fresh = await getCouncilBusinessDetailsSiren(business.id);
      setDetails(fresh.data);
      setRepresentation(fresh.representation);
      setDraftText(fresh.data.councilDecision?.draftText ?? "");
    } catch (failure) {
      setActionError(apiErrorCode(failure));
    }
  }, [business.id]);

  useEffect(() => {
    void refreshDetails();
  }, [refreshDetails]);

  const act = (action: () => Promise<unknown>) =>
    run(async () => {
      setActionError(null);
      try {
        await action();
        await Promise.all([reloadStores(), refreshDetails()]);
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        return false;
      }
    });

  const businessPayload = (overrides: Partial<{ title: string; report: string; resourceIds: string[] }>) => ({
    title: overrides.title ?? business.title,
    report: overrides.report ?? business.report,
    folderPath: business.folderPath,
    resourceIds: overrides.resourceIds ?? business.resources.map((resource) => resource.id),
  });

  const decision = details?.councilDecision ?? null;
  const businessDirty = title !== business.title || report !== business.report;
  const decisionDirty = decision ? draftText !== decision.draftText : false;

  const saveInfo = () =>
    act(async () => {
      await updateCouncilBusiness(business.id, businessPayload({ title, report }));
      if (decision && (decisionDirty || title !== business.title)) {
        await updateCouncilDecision(decision.id, { title, draftText });
      }
    });

  const moveResource = (resourceId: string, offset: number) => {
    const ids = business.resources.map((resource) => resource.id);
    const index = ids.indexOf(resourceId);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void act(() => updateCouncilBusiness(business.id, businessPayload({ resourceIds: ids })));
  };

  const removeResource = (resourceId: string) =>
    act(() =>
      updateCouncilBusiness(
        business.id,
        businessPayload({ resourceIds: business.resources.filter((r) => r.id !== resourceId).map((r) => r.id) }),
      ),
    );

  const associateResource = (resourceId: string) =>
    act(() =>
      updateCouncilBusiness(
        business.id,
        businessPayload({ resourceIds: [...business.resources.map((r) => r.id), resourceId] }),
      ),
    );

  const associatedIds = useMemo(() => new Set(business.resources.map((resource) => resource.id)), [business.resources]);
  const candidateResources = resources.filter((resource) => !associatedIds.has(resource.id));
  const suggestions = candidateResources.filter((resource) => resource.folderPath === business.folderPath);
  const otherCandidates = candidateResources.filter((resource) => resource.folderPath !== business.folderPath);

  const composableMeetings = meetings.filter(
    (meeting) => ["draft", "scheduled"].includes(meeting.status) && !meeting.isReconvenedMeeting,
  );
  const currentOccurrence = details?.occurrences.find((occurrence) =>
    ["scheduled", "inProgress"].includes(occurrence.agendaItem.status),
  );
  const currentMeeting = currentOccurrence?.meeting ?? null;

  const schedule = () => {
    if (!meetingChoice) return;
    void act(async () => {
      const aggregate = await getCouncilMeeting(meetingChoice);
      const position = Math.max(0, ...aggregate.agendaItems.map((item) => item.position)) + 1;
      await scheduleCouncilBusiness(business.id, meetingChoice, position);
      setMeetingChoice("");
    });
  };

  const unschedule = () => {
    if (!currentOccurrence) return;
    void act(() => deleteMeetingAgendaItem(currentOccurrence.meeting.id, currentOccurrence.agendaItem.id));
  };

  const openResource = (resource: CouncilBusiness["resources"][number]) =>
    resource.kind === "document" ? setViewedDocument(resource) : onSelect({ kind: "resource", id: resource.id });

  return (
    <div className="workbench">
      <header className="workbench-header">
        <div className="workbench-header-copy">
          <span className="workbench-eyebrow">
            {t(councilBusinessKindKeys[business.kind])}
            {business.folderPath ? ` · ${business.folderPath}` : ""}
          </span>
          <h1>{business.title}</h1>
          <span className={`workbench-edit-hint${editable ? "" : " workbench-edit-hint-locked"}`}>
            {editable ? <EditIcon aria-hidden="true" /> : <LockIcon aria-hidden="true" />}
            {t(editable ? "workspace.editableHint" : "workspace.lockedHint")}
          </span>
        </div>
        <div className="workbench-header-side">
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
          {currentOccurrence ? <StatusBadge value={currentOccurrence.agendaItem.status} /> : null}
        </div>
      </header>
      <RequestErrorBanner error={actionError} />

      <div className="workbench-grid">
        <div className="workbench-main">
          {editable ? (
            <section className="workbench-section" aria-labelledby="workbench-info">
              <div className="grid gap-1.5">
                <Label htmlFor={titleFieldId}>{t("meeting.subject")}</Label>
                <Input
                  id={titleFieldId}
                  className="workbench-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("meeting.report")}</Label>
                <MarkdownEditor
                  title={`${t("meeting.report")} : ${business.title}`}
                  markdown={business.report}
                  onChange={setReport}
                  mentionables={mentionables}
                  searchContext={business.folderPath}
                  onUploadImage={
                    canUploadImage
                      ? (file) => uploadImage(file, { kind: "councilBusinessReport", id: business.id })
                      : undefined
                  }
                />
                <p className="text-xs text-muted">{t("meeting.reportHint")}</p>
              </div>
              {business.kind === "matter" && decision ? (
                <div className="workbench-decision-block">
                  <div className="grid gap-1.5">
                    <Label>{t("meeting.draftDecision")}</Label>
                    <MarkdownEditor
                      key={decision.id}
                      title={`${t("meeting.draftDecision")} : ${business.title}`}
                      markdown={decision.draftText}
                      onChange={setDraftText}
                      mentionables={mentionables}
                      searchContext={business.folderPath}
                      onUploadImage={
                        canUploadImage
                          ? (file) => uploadImage(file, { kind: "councilDecisionDraft", id: decision.id })
                          : undefined
                      }
                    />
                    <p className="text-xs text-muted">{t("meeting.decisionDraftTextHint")}</p>
                  </div>
                </div>
              ) : null}
              <div className="workbench-actions">
                {business.kind === "matter" ? (
                  decision && can("council-business.detach-decision") ? (
                    <Button
                      className="composer-vote-toggle"
                      variant="ghost"
                      disabled={submitting}
                      onClick={() => void act(() => detachCouncilDecision(business.id))}
                    >
                      {t("meeting.withdrawVote")}
                    </Button>
                  ) : !decision && can("council-business.attach-decision") ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={submitting}
                          onClick={() => void act(() => attachCouncilDecision(business.id, ""))}
                        >
                          <GavelIcon />
                          {t("meeting.submitToVote")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("workspace.submitToVoteHint")}</TooltipContent>
                    </Tooltip>
                  ) : null
                ) : null}
                <span className="composer-editor-spacer" />
                <Button
                  variant="default"
                  disabled={submitting || (!businessDirty && !decisionDirty)}
                  onClick={() => void saveInfo()}
                >
                  {t(submitting ? "common.saving" : "common.save")}
                </Button>
              </div>
            </section>
          ) : (
            <section className="workbench-section" aria-labelledby="workbench-readonly">
              {business.report ? (
                <MarkdownView markdown={business.report} />
              ) : (
                <p className="workspace-list-empty">{t("meeting.itemReportEmpty")}</p>
              )}
              {decision?.draftText ? (
                <blockquote className="composer-decision-preview">
                  <MarkdownView markdown={decision.draftText} />
                </blockquote>
              ) : null}
            </section>
          )}
        </div>

        <aside className="workbench-aside">
          {can("council-business.schedule") || currentMeeting ? (
            <section className="workbench-card" aria-labelledby="workbench-schedule">
              <h2 id="workbench-schedule">{t("workspace.scheduling")}</h2>
              {can("council-business.schedule") ? (
                <div className="workbench-schedule-stack">
                  <Select value={meetingChoice} onValueChange={setMeetingChoice}>
                    <SelectTrigger className="w-full" aria-label={t("workspace.chooseMeeting")}>
                      <SelectValue placeholder={t("workspace.chooseMeeting")} />
                    </SelectTrigger>
                    <SelectContent>
                      {composableMeetings.map((meeting) => (
                        <SelectItem key={meeting.id} value={meeting.id}>
                          {formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="default" disabled={submitting || !meetingChoice} onClick={schedule}>
                    <CalendarAddIcon />
                    {t(submitting ? "common.saving" : "meeting.addToAgenda")}
                  </Button>
                </div>
              ) : currentMeeting ? (
                <div className="workbench-schedule-stack">
                  <Link className="workbench-meeting-link" to={`/meetings/${currentMeeting.slug}`}>
                    <span className="workspace-row-copy">
                      <strong>{formatMeetingLabel(currentMeeting, t("meetings.occurrenceLabel"), formatDate)}</strong>
                      <span>
                        {formatDate(currentMeeting.startsAt)}
                        {currentOccurrence?.agendaItem.position
                          ? ` · ${t("workspace.agendaPosition").replace("{position}", formatNumber(currentOccurrence.agendaItem.position))}`
                          : ""}
                      </span>
                    </span>
                    <MeetingStatusBadge status={currentMeeting.status} />
                  </Link>
                  {can("agenda-item.remove") ? (
                    <Button variant="outline" disabled={submitting} onClick={unschedule}>
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
                    <ResourceGlyph resource={resource} />
                    <button className="workbench-resource-open" type="button" onClick={() => openResource(resource)}>
                      <span className="workspace-row-copy">
                        <strong>{resource.title}</strong>
                        <span>{typeLabel(resource)}</span>
                      </span>
                    </button>
                    {editable ? (
                      <span className="workbench-resource-tools">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("meeting.moveUp")}
                          disabled={submitting || index === 0}
                          onClick={() => moveResource(resource.id, -1)}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("meeting.moveDown")}
                          disabled={submitting || index === business.resources.length - 1}
                          onClick={() => moveResource(resource.id, 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("workspace.dissociate").replace("{name}", resource.title)}
                          disabled={submitting}
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
            {editable ? (
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
            {!details || details.occurrences.length === 0 ? (
              <p className="workspace-list-empty">{t("workspace.noOccurrences")}</p>
            ) : (
              <ul className="workbench-occurrence-list">
                {details.occurrences.map((occurrence) => (
                  <li key={occurrence.agendaItem.id}>
                    <Link className="workbench-occurrence" to={`/meetings/${occurrence.meeting.slug}`}>
                      <span className="workspace-row-copy">
                        <strong>
                          {formatMeetingLabel(occurrence.meeting, t("meetings.occurrenceLabel"), formatDate)}
                        </strong>
                        <span>
                          {formatDate(occurrence.meeting.startsAt)}
                          {occurrence.agendaItem.startedAt ? ` · ${formatTime(occurrence.agendaItem.startedAt)}` : ""}
                        </span>
                      </span>
                      <span className="workbench-occurrence-side">
                        <StatusBadge value={occurrence.agendaItem.status} />
                        <OpenIcon aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <MeetingDocumentViewer
        document={viewedDocument}
        onClose={() => setViewedDocument(null)}
        onDownload={(document) => void download(document)}
      />
    </div>
  );
}
