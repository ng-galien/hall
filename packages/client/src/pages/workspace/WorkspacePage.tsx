import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AddIcon, FolderAddIcon, TextDocumentIcon, UploadIcon, WorkspaceIcon } from "../../components/icons";
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
import { WorkspaceBreadcrumb } from "./WorkspaceBreadcrumb";
import { WorkspaceHome } from "./WorkspaceHome";
import { emptySearch, isSearchActive, WorkspaceSearch, type WorkspaceSearchState } from "./WorkspaceSearch";
import { useWorkspaceOrgStore } from "./workspaceOrg";

export type WorkspaceSelection = { kind: "topic"; id: string } | { kind: "resource"; id: string } | null;

type QuickCreate = "topic" | "text" | "path" | null;

const quickCreateLabels = {
  topic: { title: "workspace.createTopic", placeholder: "workspace.newTopicPlaceholder" },
  text: { title: "workspace.createText", placeholder: "workspace.newTextPlaceholder" },
  path: { title: "workspace.createPath", placeholder: "workspace.newPathPlaceholder" },
} as const;

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
    if (creating === "path") {
      // Un dossier n'existe qu'à travers son contenu : on le retient localement et on s'y place.
      const target = [path, title].filter(Boolean).join("/");
      useWorkspaceOrgStore.getState().addPendingPath(target);
      setCreating(null);
      select(null, target);
      return;
    }
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
              <WorkspaceSearch search={search} onSearch={setSearch} onSelect={select} context={path} />
            </div>
            <div className="workspace-bar-actions">
              {canCreateTopic || canCreateText || canUpload ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <AddIcon /> {t("workspace.new")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canCreateTopic ? (
                      <DropdownMenuItem onSelect={() => setCreating("topic")}>
                        <WorkspaceIcon /> {t("workspace.createTopic")}
                      </DropdownMenuItem>
                    ) : null}
                    {canCreateText ? (
                      <DropdownMenuItem onSelect={() => setCreating("text")}>
                        <TextDocumentIcon /> {t("workspace.createText")}
                      </DropdownMenuItem>
                    ) : null}
                    {canUpload ? (
                      <DropdownMenuItem onSelect={() => fileInput.current?.click()} disabled={submitting}>
                        <UploadIcon /> {t("workspace.uploadDocument")}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setCreating("path")}>
                      <FolderAddIcon /> {t("workspace.createPath")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {canUpload ? (
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
              ) : null}
            </div>
          </div>
          {creating ? (
            <Dialog open onOpenChange={(open) => !open && setCreating(null)}>
              <DialogContent className="workspace-create-dialog" closeLabel={t("common.close")}>
                <DialogHeader>
                  <DialogTitle>{t(quickCreateLabels[creating].title)}</DialogTitle>
                </DialogHeader>
                <form className="workspace-create-dialog-form" onSubmit={submitQuickCreate}>
                  <Input
                    autoFocus
                    name="title"
                    type="text"
                    placeholder={t(quickCreateLabels[creating].placeholder)}
                    aria-label={t(quickCreateLabels[creating].title)}
                    required
                  />
                  <div className="workspace-create-dialog-actions">
                    <Button variant="outline" type="button" onClick={() => setCreating(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button variant="default" type="submit" disabled={submitting}>
                      {t(submitting ? "common.saving" : "common.create")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
          {!searchActive ? <PinnedRow selection={selection} onSelect={select} /> : null}
        </div>

        {/* Le cadre est permanent : recherche puis fil d'Ariane puis conteneur.
            Seul le contenu du conteneur change — liste du dossier, établi, accueil. */}
        {searchActive ? null : (
          <section className="workspace-contents" aria-label={t("workspace.contents")}>
            <header className="workspace-contents-header">
              <WorkspaceBreadcrumb
                path={selectedTopic?.folderPath ?? selectedResource?.folderPath ?? path}
                currentLabel={selectedTopic?.title ?? selectedResource?.title}
                onSelect={select}
              />
            </header>
            <div className="workspace-container-body">
              {selectedTopic || selectedResource ? (
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
          </section>
        )}
      </div>
    </div>
  );
}
