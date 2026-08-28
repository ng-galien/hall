import { Button, Tooltip } from "@fluentui/react-components";
import { AddRegular, ArrowUploadRegular, DocumentTextRegular } from "@fluentui/react-icons";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { PathContents } from "./PathContents";
import { PinnedRow } from "./PinnedRow";
import { isUnderPath, listAllPaths } from "./paths";
import { ResourceWorkbench } from "./ResourceWorkbench";
import { TopicWorkbench } from "./TopicWorkbench";
import { WorkspaceHome } from "./WorkspaceHome";
import { emptySearch, isSearchActive, WorkspaceSearch, type WorkspaceSearchState } from "./WorkspaceSearch";
import { useWorkspaceOrgStore } from "./workspaceOrg";

export type WorkspaceSelection = { kind: "topic"; id: string } | { kind: "resource"; id: string } | null;

type QuickCreate = "topic" | "text" | null;

export function WorkspacePage() {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [searchParams, setSearchParams] = useSearchParams();
  const topicsStore = useTopicsStore();
  const resourcesStore = useResourcesStore();
  const { topics, error: topicsError, canCreate: canCreateTopic } = topicsStore;
  const { resources, error: resourcesError, canCreateText, canUpload } = resourcesStore;
  const { error: decisionsError } = useCouncilDecisionsStore();
  const [search, setSearch] = useState<WorkspaceSearchState>(emptySearch);
  const [creating, setCreating] = useState<QuickCreate>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const path = searchParams.get("path") ?? "";
  const selection: WorkspaceSelection = searchParams.get("topic")
    ? { kind: "topic", id: searchParams.get("topic") as string }
    : searchParams.get("resource")
      ? { kind: "resource", id: searchParams.get("resource") as string }
      : null;

  useEffect(() => {
    useWorkspaceOrgStore.getState().prunePendingPaths(listAllPaths(topics, resources));
  }, [topics, resources]);

  const select = (next: WorkspaceSelection, nextPath?: string) => {
    const params = new URLSearchParams();
    const targetPath = nextPath ?? path;
    if (targetPath) params.set("path", targetPath);
    if (next?.kind === "topic") params.set("topic", next.id);
    if (next?.kind === "resource") params.set("resource", next.id);
    setSearchParams(params, { replace: true });
  };

  const pathTopics = useMemo(() => topics.filter((topic) => isUnderPath(topic.folderPath, path)), [topics, path]);
  const pathResources = useMemo(
    () => resources.filter((resource) => isUnderPath(resource.folderPath, path)),
    [resources, path],
  );

  const selectedTopic =
    selection?.kind === "topic" ? (topics.find((topic) => topic.id === selection.id) ?? null) : null;
  const selectedResource =
    selection?.kind === "resource" ? (resources.find((resource) => resource.id === selection.id) ?? null) : null;

  const submitQuickCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!title) return;
    await run(async () => {
      if (creating === "topic") {
        const topic = await topicsStore.create({
          kind: "subject",
          title,
          report: "",
          folderPath: path,
          resourceIds: [],
        });
        if (topic) select({ kind: "topic", id: topic.id });
        setCreating(null);
        return Boolean(topic);
      }
      const created = await resourcesStore.createText({ title, folderPath: path, tags: [], content: "" });
      if (created) {
        const fresh = useResourcesStore
          .getState()
          .resources.find((resource) => resource.kind === "text" && resource.title === title);
        if (fresh) select({ kind: "resource", id: fresh.id });
      }
      setCreating(null);
      return created;
    });
  };

  const uploadDocument = (file: File) => {
    const form = new FormData();
    form.set("folderPath", path);
    form.set("category", "supporting");
    form.set("file", file);
    void run(async () => {
      const uploaded = await resourcesStore.upload(form);
      if (uploaded) {
        const fresh = useResourcesStore
          .getState()
          .resources.find((resource) => resource.kind === "document" && resource.fileName === file.name);
        if (fresh) select({ kind: "resource", id: fresh.id });
      }
      return uploaded;
    });
  };

  const searchActive = isSearchActive(search);

  return (
    <div className="page workspace-page">
      <div className="workspace">
        <RequestErrorBanner error={topicsError ?? resourcesError ?? decisionsError} />
        <div className="workspace-topzone">
          <div className="workspace-bar-row">
            <div className="workspace-bar-search">
              <WorkspaceSearch search={search} onSearch={setSearch} onSelect={select} />
            </div>
            <div className="workspace-bar-actions">
              {canCreateTopic ? (
                <Tooltip content={t("workspace.createTopic")} relationship="label">
                  <Button appearance="subtle" icon={<AddRegular />} onClick={() => setCreating("topic")} />
                </Tooltip>
              ) : null}
              {canCreateText ? (
                <Tooltip content={t("workspace.createText")} relationship="label">
                  <Button appearance="subtle" icon={<DocumentTextRegular />} onClick={() => setCreating("text")} />
                </Tooltip>
              ) : null}
              {canUpload ? (
                <>
                  <Tooltip content={t("workspace.uploadDocument")} relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<ArrowUploadRegular />}
                      disabled={submitting}
                      onClick={() => fileInput.current?.click()}
                    />
                  </Tooltip>
                  <input
                    ref={fileInput}
                    type="file"
                    className="visually-hidden-input"
                    aria-label={t("documents.file")}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) uploadDocument(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
          {creating ? (
            <form className="workspace-create-form" onSubmit={submitQuickCreate}>
              <input
                // biome-ignore lint/a11y/noAutofocus: le formulaire apparaît à la demande, le focus suit l'intention
                autoFocus
                name="title"
                type="text"
                placeholder={t(creating === "topic" ? "workspace.newTopicPlaceholder" : "workspace.newTextPlaceholder")}
                aria-label={t(creating === "topic" ? "workspace.createTopic" : "workspace.createText")}
                required
              />
              <Button appearance="primary" size="small" type="submit" disabled={submitting}>
                {t(submitting ? "common.saving" : "common.create")}
              </Button>
              <Button appearance="secondary" size="small" type="button" onClick={() => setCreating(null)}>
                {t("common.cancel")}
              </Button>
            </form>
          ) : null}
          {!searchActive ? <PinnedRow selection={selection} onSelect={select} /> : null}
        </div>

        {searchActive ? null : selectedTopic || selectedResource ? (
          <section className="workspace-bench workspace-bench-full" aria-label={t("workspace.bench")}>
            {selectedTopic ? (
              <TopicWorkbench key={selectedTopic.id} topic={selectedTopic} onSelect={select} />
            ) : selectedResource ? (
              <ResourceWorkbench key={selectedResource.id} resource={selectedResource} onSelect={select} />
            ) : null}
          </section>
        ) : path ? (
          <PathContents
            path={path}
            topics={pathTopics}
            resources={pathResources}
            selection={selection}
            onSelect={select}
          />
        ) : (
          <WorkspaceHome onSelect={select} />
        )}
      </div>
    </div>
  );
}
