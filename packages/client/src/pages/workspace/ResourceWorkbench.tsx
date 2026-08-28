import { Button, Field, Tooltip } from "@fluentui/react-components";
import { DeleteRegular, OpenRegular, PinFilled, PinRegular } from "@fluentui/react-icons";
import { findSirenAction } from "@mairie/api-contract";
import type { Resource, ResourceDetails } from "@mairie/domain";
import { useCallback, useEffect, useState } from "react";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { Input, RequestErrorBanner, StatusBadge } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { documentCategoryKeys } from "../council-meetings/MeetingDetailsCard";
import { MeetingDocumentViewer } from "../council-meetings/MeetingDocumentViewer";
import { ResourceGlyph, TopicGlyph, useResourceTypeLabel } from "./ResourceGlyph";
import type { WorkspaceSelection } from "./WorkspacePage";
import { useWorkspacePrefsStore } from "./workspacePrefs";

export function ResourceWorkbench({
  resource,
  onSelect,
}: {
  resource: Resource;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t, formatFileSize, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const resourcesStore = useResourcesStore();
  const typeLabel = useResourceTypeLabel();
  const [details, setDetails] = useState<ResourceDetails | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [title, setTitle] = useState(resource.title);
  const [folderPath, setFolderPath] = useState(resource.folderPath);
  const [tags, setTags] = useState(resource.tags.join(", "));
  const [content, setContent] = useState(resource.kind === "text" ? resource.content : "");
  const [viewerOpen, setViewerOpen] = useState(false);
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "resource", id: resource.id });

  const refreshDetails = useCallback(async () => {
    try {
      const result = await getResourceDetailsSiren(resource.id);
      setDetails(result.data);
      setCanUpdate(Boolean(result.representation && findSirenAction(result.representation, "resource.update")));
      setCanDelete(Boolean(result.representation && findSirenAction(result.representation, "resource.delete")));
    } catch (failure) {
      setActionError(apiErrorCode(failure));
    }
  }, [resource.id]);

  useEffect(() => {
    void refreshDetails();
  }, [refreshDetails]);

  const save = () =>
    run(async () => {
      setActionError(null);
      const saved = await resourcesStore.update(resource.id, {
        title,
        folderPath,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...(resource.kind === "text" ? { content } : {}),
      });
      if (!saved) setActionError(useResourcesStore.getState().error);
      else {
        onSelect({ kind: "resource", id: resource.id }, folderPath);
        await refreshDetails();
      }
      return saved;
    });

  const remove = () =>
    run(async () => {
      setActionError(null);
      const removed = await resourcesStore.remove(resource.id);
      if (removed) onSelect(null);
      else setActionError(useResourcesStore.getState().error);
      return removed;
    });

  const dirty =
    title !== resource.title ||
    folderPath !== resource.folderPath ||
    tags !== resource.tags.join(", ") ||
    (resource.kind === "text" && content !== resource.content);

  return (
    <div className="workbench">
      <header className="workbench-header">
        <div className="workbench-header-identity">
          <ResourceGlyph resource={resource} large />
          <div className="workbench-header-copy">
            <span className="workbench-eyebrow">
              {typeLabel(resource)}
              {resource.kind === "document" ? ` · ${t(documentCategoryKeys[resource.category])}` : ""}
              {resource.kind === "document" ? ` · ${formatFileSize(resource.byteSize)}` : ""}
              {` · ${formatDate(resource.createdAt)}`}
            </span>
            <h1>{resource.title}</h1>
          </div>
        </div>
        <div className="workbench-header-side">
          <Tooltip content={t(pinned ? "workspace.unpinShort" : "workspace.pin")} relationship="label">
            <Button
              appearance="subtle"
              icon={pinned ? <PinFilled /> : <PinRegular />}
              aria-pressed={pinned}
              onClick={() => togglePin({ kind: "resource", id: resource.id })}
            />
          </Tooltip>
          {resource.kind === "document" ? (
            <>
              <Button appearance="secondary" icon={<OpenRegular />} onClick={() => setViewerOpen(true)}>
                {t("workspace.viewDocument")}
              </Button>
              <Button appearance="secondary" onClick={() => void resourcesStore.download(resource)}>
                {t("common.download")}
              </Button>
            </>
          ) : null}
        </div>
      </header>
      <RequestErrorBanner error={actionError} />

      <div className="workbench-grid">
        <div className="workbench-main">
          <section className="workbench-section" aria-labelledby="resource-info">
            <Field label={t("resources.textTitle")} required>
              <Input
                className="workbench-title-input"
                value={title}
                readOnly={!canUpdate || Boolean(details?.snapshotted)}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </Field>
            {resource.kind === "text" ? (
              <Field label={t("resources.textContent")}>
                <MarkdownEditor
                  markdown={resource.kind === "text" ? resource.content : ""}
                  onChange={setContent}
                  readOnly={!canUpdate || Boolean(details?.snapshotted)}
                />
              </Field>
            ) : (
              <button className="workbench-document-tile" type="button" onClick={() => setViewerOpen(true)}>
                <ResourceGlyph resource={resource} large />
                <span className="workspace-row-copy">
                  <strong>{resource.fileName}</strong>
                  <span>
                    {typeLabel(resource)} · {formatFileSize(resource.byteSize)}
                  </span>
                </span>
                <OpenRegular aria-hidden="true" />
              </button>
            )}
            <div className="workbench-actions">
              {canDelete ? (
                <Button
                  className="composer-vote-toggle"
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  disabled={submitting}
                  onClick={() => void remove()}
                >
                  {t("workspace.deleteResource")}
                </Button>
              ) : null}
              <span className="composer-editor-spacer" />
              {canUpdate ? (
                <Button appearance="primary" disabled={submitting || !dirty} onClick={() => void save()}>
                  {t(submitting ? "common.saving" : "common.save")}
                </Button>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="workbench-aside">
          <section className="workbench-card" aria-labelledby="resource-filing">
            <h2 id="resource-filing">{t("workspace.filing")}</h2>
            <Field label={t("resources.folderPath")} hint={t("resources.folderPathHint")}>
              <Input value={folderPath} readOnly={!canUpdate} onChange={(event) => setFolderPath(event.target.value)} />
            </Field>
            <Field label={t("workspace.tags")} hint={t("workspace.tagsHint")}>
              <Input value={tags} readOnly={!canUpdate} onChange={(event) => setTags(event.target.value)} />
            </Field>
          </section>

          <section className="workbench-card" aria-labelledby="resource-topics">
            <h2 id="resource-topics">{t("workspace.resourceTopics")}</h2>
            {!details || details.topics.length === 0 ? (
              <p className="workspace-list-empty">{t("workspace.noResourceTopics")}</p>
            ) : (
              <ul className="workbench-occurrence-list">
                {details.topics.map((topic) => (
                  <li key={topic.id}>
                    <button
                      className="workbench-occurrence"
                      type="button"
                      onClick={() => onSelect({ kind: "topic", id: topic.id })}
                    >
                      <TopicGlyph topic={topic} />
                      <span className="workspace-row-copy">
                        <strong>{topic.title}</strong>
                        <span>{t(topicKindKeys[topic.kind])}</span>
                      </span>
                      <span className="workbench-occurrence-side">
                        <StatusBadge value={topic.state} />
                        <OpenRegular aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {resource.kind === "document" && viewerOpen ? (
        <MeetingDocumentViewer
          document={resource}
          onClose={() => setViewerOpen(false)}
          onDownload={(document) => void resourcesStore.download(document)}
        />
      ) : null}
    </div>
  );
}
