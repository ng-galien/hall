import { findSirenAction } from "@hall/api-contract";
import type { Resource, ResourceDetails } from "@hall/domain";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentEmbed } from "../../components/DocumentEmbed";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { useMentionables } from "../../components/editor/useMentionables";
import { DeleteIcon, OpenIcon, PinIcon, PinnedIcon } from "../../components/icons";
import { ResourceGlyph, TopicGlyph, useResourceTypeLabel } from "../../components/ResourceGlyph";
import { TagInput } from "../../components/TagInput";
import { RequestErrorBanner, StatusBadge } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { documentCategoryKeys } from "../council-meetings/MeetingDetailsCard";
import { MeetingDocumentViewer } from "../council-meetings/MeetingDocumentViewer";
import { useSaveStatusStore } from "./saveStatusStore";
import type { WorkspaceSelection } from "./WorkspacePage";
import { useWorkspacePrefsStore } from "./workspacePrefs";

export function ResourceWorkbench({
  resource,
  onSelect,
}: {
  resource: Resource;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const mentionables = useMentionables();
  const { t, formatFileSize, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const resourcesStore = useResourcesStore();
  const typeLabel = useResourceTypeLabel();
  const [details, setDetails] = useState<ResourceDetails | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [title, setTitle] = useState(resource.title);
  const [tags, setTags] = useState<string[]>(resource.tags);
  const [content, setContent] = useState(resource.kind === "text" ? resource.content : "");
  const [viewerOpen, setViewerOpen] = useState(false);
  const titleFieldId = useId();
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "resource", id: resource.id });
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);

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
      setSaveStatus("saving");
      const saved = await resourcesStore.update(resource.id, {
        title,
        folderPath: resource.folderPath,
        tags,
        ...(resource.kind === "text" ? { content } : {}),
      });
      if (!saved) {
        setActionError(useResourcesStore.getState().error);
        setSaveStatus("error");
      } else {
        onSelect({ kind: "resource", id: resource.id }, resource.folderPath);
        await refreshDetails();
        setSaveStatus("saved");
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
    tags.join("\u0000") !== resource.tags.join("\u0000") ||
    (resource.kind === "text" && content !== resource.content);

  /* Auto-sauvegarde : une seconde après la dernière modification. La pastille du fil
     d'Ariane raconte le cycle — modifié, enregistrement, enregistré. */
  useEffect(() => {
    if (!dirty || !canUpdate || details?.snapshotted) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
    // save se recrée à chaque rendu : le déclencheur est la modification, pas la fonction.
    // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par les champs édités
  }, [dirty, title, tags, content, canUpdate]);

  useEffect(() => {
    // À l'arrivée sur un document (et au départ), la pastille repart de zéro.
    setSaveStatus("idle");
    return () => setSaveStatus("idle");
  }, [setSaveStatus]);

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(pinned ? "workspace.unpinShort" : "workspace.pin")}
                aria-pressed={pinned}
                onClick={() => togglePin({ kind: "resource", id: resource.id })}
              >
                {pinned ? <PinnedIcon /> : <PinIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t(pinned ? "workspace.unpinShort" : "workspace.pin")}</TooltipContent>
          </Tooltip>
          {resource.kind === "document" ? (
            <Button variant="outline" onClick={() => void resourcesStore.download(resource)}>
              {t("common.download")}
            </Button>
          ) : null}
        </div>
      </header>
      <RequestErrorBanner error={actionError} />

      <div className="workbench-meta-row">
        <div className="workbench-meta">
          <span className="workbench-meta-label">{t("workspace.tags")}</span>
          <TagInput value={tags} onChange={setTags} readOnly={!canUpdate} label={t("workspace.tags")} />
        </div>
        <div className="workbench-meta">
          <span className="workbench-meta-label">{t("workspace.resourceTopics")}</span>
          {!details || details.topics.length === 0 ? (
            <span className="workbench-meta-empty">{t("workspace.noResourceTopics")}</span>
          ) : (
            details.topics.map((topic) => (
              <button
                key={topic.id}
                className="workbench-topic-chip"
                type="button"
                onClick={() => onSelect({ kind: "topic", id: topic.id })}
              >
                <TopicGlyph topic={topic} />
                {topic.title}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="workbench-main">
        <section className="workbench-section" aria-labelledby="resource-info">
          <div className="grid gap-1.5">
            <Label htmlFor={titleFieldId}>{t("resources.textTitle")}</Label>
            <Input
              id={titleFieldId}
              className="workbench-title-input"
              value={title}
              readOnly={!canUpdate || Boolean(details?.snapshotted)}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          {resource.kind === "text" ? (
            <div className="grid gap-1.5">
              {/* L'éditeur Markdown n'expose pas d'identifiant : l'étiquette reste descriptive. */}
              <Label>{t("resources.textContent")}</Label>
              <MarkdownEditor
                title={resource.title}
                markdown={resource.kind === "text" ? resource.content : ""}
                onChange={setContent}
                mentionables={mentionables}
                searchContext={resource.folderPath}
                readOnly={!canUpdate || Boolean(details?.snapshotted)}
              />
            </div>
          ) : (
            <DocumentEmbed resource={resource} onOpenFull={() => setViewerOpen(true)} />
          )}
          <div className="workbench-actions">
            {canDelete ? (
              <Button
                className="composer-vote-toggle"
                variant="ghost"
                disabled={submitting}
                onClick={() => void remove()}
              >
                <DeleteIcon />
                {t("workspace.deleteResource")}
              </Button>
            ) : null}
            <span className="composer-editor-spacer" />
          </div>
        </section>
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
