import { Button, Field, Tooltip } from "@fluentui/react-components";
import {
  ArrowDownRegular,
  ArrowUpRegular,
  CalendarAddRegular,
  DismissRegular,
  EditRegular,
  GavelRegular,
  LockClosedRegular,
  OpenRegular,
  PinFilled,
  PinRegular,
} from "@fluentui/react-icons";
import { findSirenAction, type SirenEntity } from "@mairie/api-contract";
import type { DocumentResource, Topic, TopicDetails } from "@mairie/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { Input, MeetingStatusBadge, RequestErrorBanner, StatusBadge } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { updateCouncilDecision } from "../../services/councilDecisionsApi";
import { deleteMeetingAgendaItem, getCouncilMeeting } from "../../services/councilMeetingsApi";
import { resourceContentHref, uploadResourceDocument } from "../../services/resourcesApi";
import {
  attachTopicDecision,
  detachTopicDecision,
  getTopicDetailsSiren,
  scheduleTopic,
  updateTopic,
} from "../../services/topicsApi";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { MeetingDocumentViewer } from "../council-meetings/MeetingDocumentViewer";
import { ResourceGlyph, useResourceTypeLabel } from "./ResourceGlyph";
import { ResourcePicker } from "./ResourcePicker";
import type { WorkspaceSelection } from "./WorkspacePage";
import { useWorkspacePrefsStore } from "./workspacePrefs";

export function TopicWorkbench({
  topic,
  onSelect,
}: {
  topic: Topic;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t, formatDate, formatTime, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const { resources, download } = useResourcesStore();
  const { meetings } = useCouncilMeetingsStore();
  const typeLabel = useResourceTypeLabel();
  const [details, setDetails] = useState<TopicDetails | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity<Record<string, unknown>> | null>(null);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [title, setTitle] = useState(topic.title);
  const [report, setReport] = useState(topic.report);
  const [draftText, setDraftText] = useState("");
  const [meetingChoice, setMeetingChoice] = useState("");
  const [viewedDocument, setViewedDocument] = useState<DocumentResource | null>(null);
  const can = (
    name: "topic.update" | "topic.schedule" | "topic.attach-decision" | "topic.detach-decision" | "agenda-item.remove",
  ) => Boolean(representation && findSirenAction(representation, name));
  const editable = can("topic.update");
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "topic", id: topic.id });

  const reloadStores = () =>
    Promise.all([
      useTopicsStore.getState().load(),
      useCouncilDecisionsStore.getState().load(),
      useResourcesStore.getState().load(),
    ]);

  const refreshDetails = useCallback(async () => {
    try {
      const fresh = await getTopicDetailsSiren(topic.id);
      setDetails(fresh.data);
      setRepresentation(fresh.representation);
      setDraftText(fresh.data.councilDecision?.draftText ?? "");
    } catch (failure) {
      setActionError(apiErrorCode(failure));
    }
  }, [topic.id]);

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

  const topicPayload = (overrides: Partial<{ title: string; report: string; resourceIds: string[] }>) => ({
    title: overrides.title ?? topic.title,
    report: overrides.report ?? topic.report,
    folderPath: topic.folderPath,
    resourceIds: overrides.resourceIds ?? topic.resources.map((resource) => resource.id),
  });

  const decision = details?.councilDecision ?? null;
  const infoDirty = title !== topic.title || report !== topic.report;
  const decisionDirty = decision ? draftText !== decision.draftText : false;

  const saveInfo = () =>
    act(async () => {
      await updateTopic(topic.id, topicPayload({ title, report }));
      if (decision && (decisionDirty || title !== topic.title)) {
        await updateCouncilDecision(decision.id, { title, draftText });
      }
    });

  const moveResource = (resourceId: string, offset: number) => {
    const ids = topic.resources.map((resource) => resource.id);
    const index = ids.indexOf(resourceId);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void act(() => updateTopic(topic.id, topicPayload({ resourceIds: ids })));
  };

  const removeResource = (resourceId: string) =>
    act(() =>
      updateTopic(
        topic.id,
        topicPayload({ resourceIds: topic.resources.filter((r) => r.id !== resourceId).map((r) => r.id) }),
      ),
    );

  const associateResource = (resourceId: string) =>
    act(() => updateTopic(topic.id, topicPayload({ resourceIds: [...topic.resources.map((r) => r.id), resourceId] })));

  const associatedIds = useMemo(() => new Set(topic.resources.map((resource) => resource.id)), [topic.resources]);
  const candidateResources = resources.filter((resource) => !associatedIds.has(resource.id));
  const suggestions = candidateResources.filter((resource) => resource.folderPath === topic.folderPath);
  const otherCandidates = candidateResources.filter((resource) => resource.folderPath !== topic.folderPath);

  const uploadEditorImage = async (image: File) => {
    const form = new FormData();
    form.set("title", image.name);
    form.set("folderPath", topic.folderPath);
    form.set("category", "supporting");
    form.set("file", image);
    const created = await uploadResourceDocument(form);
    await updateTopic(topic.id, topicPayload({ resourceIds: [...topic.resources.map((r) => r.id), created.id] }));
    await reloadStores();
    return resourceContentHref(created.id);
  };

  const composableMeetings = meetings.filter(
    (meeting) => ["draft", "scheduled"].includes(meeting.status) && !meeting.isReconvenedMeeting,
  );
  const currentOccurrence = details?.occurrences.find((occurrence) => occurrence.meeting.id === topic.currentMeetingId);
  const currentMeeting = topic.currentMeetingId
    ? (meetings.find((meeting) => meeting.id === topic.currentMeetingId) ?? null)
    : null;

  const schedule = () => {
    if (!meetingChoice) return;
    void act(async () => {
      const aggregate = await getCouncilMeeting(meetingChoice);
      const position = Math.max(0, ...aggregate.agendaItems.map((item) => item.position)) + 1;
      await scheduleTopic(topic.id, meetingChoice, position);
      setMeetingChoice("");
    });
  };

  const unschedule = () => {
    if (!topic.currentMeetingId || !currentOccurrence) return;
    void act(() => deleteMeetingAgendaItem(topic.currentMeetingId as string, currentOccurrence.agendaItem.id));
  };

  const openResource = (resource: Topic["resources"][number]) =>
    resource.kind === "document" ? setViewedDocument(resource) : onSelect({ kind: "resource", id: resource.id });

  return (
    <div className="workbench">
      <header className="workbench-header">
        <div className="workbench-header-copy">
          <span className="workbench-eyebrow">
            {t(topicKindKeys[topic.kind])}
            {topic.folderPath ? ` · ${topic.folderPath}` : ""}
          </span>
          <h1>{topic.title}</h1>
          <span className={`workbench-edit-hint${editable ? "" : " workbench-edit-hint-locked"}`}>
            {editable ? <EditRegular aria-hidden="true" /> : <LockClosedRegular aria-hidden="true" />}
            {t(editable ? "workspace.editableHint" : "workspace.lockedHint")}
          </span>
        </div>
        <div className="workbench-header-side">
          <Tooltip content={t(pinned ? "workspace.unpinShort" : "workspace.pin")} relationship="label">
            <Button
              appearance="subtle"
              icon={pinned ? <PinFilled /> : <PinRegular />}
              aria-pressed={pinned}
              onClick={() => togglePin({ kind: "topic", id: topic.id })}
            />
          </Tooltip>
          <StatusBadge value={topic.state} />
        </div>
      </header>
      <RequestErrorBanner error={actionError} />

      <div className="workbench-grid">
        <div className="workbench-main">
          {editable ? (
            <section className="workbench-section" aria-labelledby="workbench-info">
              <Field label={t("meeting.subject")} required>
                <Input
                  className="workbench-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </Field>
              <Field label={t("meeting.report")} hint={t("meeting.reportHint")}>
                <MarkdownEditor
                  markdown={topic.report}
                  onChange={setReport}
                  attachableResources={topic.resources}
                  onUploadImage={uploadEditorImage}
                />
              </Field>
              {topic.kind === "subject" && decision ? (
                <div className="workbench-decision-block">
                  <Field label={t("meeting.draftDecision")} hint={t("meeting.decisionDraftTextHint")}>
                    <MarkdownEditor
                      key={decision.id}
                      markdown={decision.draftText}
                      onChange={setDraftText}
                      attachableResources={topic.resources}
                    />
                  </Field>
                </div>
              ) : null}
              <div className="workbench-actions">
                {topic.kind === "subject" ? (
                  decision && can("topic.detach-decision") ? (
                    <Button
                      className="composer-vote-toggle"
                      appearance="subtle"
                      disabled={submitting}
                      onClick={() => void act(() => detachTopicDecision(topic.id))}
                    >
                      {t("meeting.withdrawVote")}
                    </Button>
                  ) : !decision && can("topic.attach-decision") ? (
                    <Tooltip content={t("workspace.submitToVoteHint")} relationship="description">
                      <Button
                        appearance="secondary"
                        icon={<GavelRegular />}
                        disabled={submitting}
                        onClick={() => void act(() => attachTopicDecision(topic.id, ""))}
                      >
                        {t("meeting.submitToVote")}
                      </Button>
                    </Tooltip>
                  ) : null
                ) : null}
                <span className="composer-editor-spacer" />
                <Button
                  appearance="primary"
                  disabled={submitting || (!infoDirty && !decisionDirty)}
                  onClick={() => void saveInfo()}
                >
                  {t(submitting ? "common.saving" : "common.save")}
                </Button>
              </div>
            </section>
          ) : (
            <section className="workbench-section" aria-labelledby="workbench-readonly">
              {topic.report ? (
                <MarkdownView markdown={topic.report} />
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
          {can("topic.schedule") || currentMeeting ? (
            <section className="workbench-card" aria-labelledby="workbench-schedule">
              <h2 id="workbench-schedule">{t("workspace.scheduling")}</h2>
              {topic.state === "toSchedule" ? (
                <div className="workbench-schedule-stack">
                  <select
                    aria-label={t("workspace.chooseMeeting")}
                    value={meetingChoice}
                    onChange={(event) => setMeetingChoice(event.target.value)}
                  >
                    <option value="">{t("workspace.chooseMeeting")}</option>
                    {composableMeetings.map((meeting) => (
                      <option key={meeting.id} value={meeting.id}>
                        {meeting.title} — {formatDate(meeting.startsAt)}
                      </option>
                    ))}
                  </select>
                  <Button
                    appearance="primary"
                    icon={<CalendarAddRegular />}
                    disabled={submitting || !meetingChoice}
                    onClick={schedule}
                  >
                    {t(submitting ? "common.saving" : "meeting.addToAgenda")}
                  </Button>
                </div>
              ) : currentMeeting ? (
                <div className="workbench-schedule-stack">
                  <Link className="workbench-meeting-link" to={`/meetings/${currentMeeting.id}`}>
                    <span className="workspace-row-copy">
                      <strong>{currentMeeting.title}</strong>
                      <span>
                        {formatDate(currentMeeting.startsAt)}
                        {topic.position
                          ? ` · ${t("workspace.agendaPosition").replace("{position}", formatNumber(topic.position))}`
                          : ""}
                      </span>
                    </span>
                    <MeetingStatusBadge status={currentMeeting.status} />
                  </Link>
                  {can("agenda-item.remove") ? (
                    <Button appearance="secondary" disabled={submitting} onClick={unschedule}>
                      {t("workspace.unschedule")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="workbench-card" aria-labelledby="workbench-resources">
            <h2 id="workbench-resources">{t("workspace.associatedResources")}</h2>
            {topic.resources.length === 0 ? (
              <p className="workspace-list-empty">{t("workspace.noAssociatedResources")}</p>
            ) : (
              <ul className="workbench-resource-list">
                {topic.resources.map((resource, index) => (
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
                          appearance="subtle"
                          size="small"
                          icon={<ArrowUpRegular />}
                          aria-label={t("meeting.moveUp")}
                          disabled={submitting || index === 0}
                          onClick={() => moveResource(resource.id, -1)}
                        />
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<ArrowDownRegular />}
                          aria-label={t("meeting.moveDown")}
                          disabled={submitting || index === topic.resources.length - 1}
                          onClick={() => moveResource(resource.id, 1)}
                        />
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<DismissRegular />}
                          aria-label={t("workspace.dissociate").replace("{name}", resource.title)}
                          disabled={submitting}
                          onClick={() => void removeResource(resource.id)}
                        />
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
                    <Link className="workbench-occurrence" to={`/meetings/${occurrence.meeting.id}`}>
                      <span className="workspace-row-copy">
                        <strong>{occurrence.meeting.title}</strong>
                        <span>
                          {formatDate(occurrence.meeting.startsAt)}
                          {occurrence.agendaItem.startedAt ? ` · ${formatTime(occurrence.agendaItem.startedAt)}` : ""}
                        </span>
                      </span>
                      <span className="workbench-occurrence-side">
                        <StatusBadge value={occurrence.agendaItem.status} />
                        <OpenRegular aria-hidden="true" />
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
