import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from "@fluentui/react-components";
import { FolderAddRegular, SearchRegular } from "@fluentui/react-icons";
import type { Resource, Topic } from "@mairie/domain";
import { type DragEvent, type FormEvent, type ReactNode, useState } from "react";
import { matchesQuery, StatusBadge } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { listAllPaths } from "./paths";
import { ResourceGlyph, TopicGlyph, useResourceTypeLabel } from "./ResourceGlyph";
import type { WorkspaceSelection } from "./WorkspacePage";
import { DRAG_TYPE, type DragPayload, encodeDragPayload, moveToPath, useWorkspaceOrgStore } from "./workspaceOrg";

function ContentRow({
  payload,
  movable,
  movePaths,
  onOpen,
  afterMove,
  children,
}: {
  payload: DragPayload;
  movable: boolean;
  movePaths: string[];
  onOpen(): void;
  afterMove(): void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Menu openOnContext>
      <MenuTrigger disableButtonEnhancement>
        <li
          draggable={movable}
          onDragStart={(event: DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(DRAG_TYPE, encodeDragPayload(payload));
          }}
        >
          {children}
        </li>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={onOpen}>{t("workspace.open")}</MenuItem>
          {movable ? (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <MenuItem>{t("workspace.moveTo")}</MenuItem>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => void moveToPath(payload, "").then(afterMove)}>
                    {t("resources.rootFolder")}
                  </MenuItem>
                  {movePaths.map((target) => (
                    <MenuItem key={target} onClick={() => void moveToPath(payload, target).then(afterMove)}>
                      {target}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          ) : null}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function PathContents({
  path,
  topics,
  resources,
  selection,
  onSelect,
}: {
  path: string;
  topics: Topic[];
  resources: Resource[];
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t, formatFileSize } = useI18n();
  const { submitting } = useSubmitting();
  const typeLabel = useResourceTypeLabel();
  const topicsStore = useTopicsStore();
  const resourcesStore = useResourcesStore();
  const { pendingPaths, addPendingPath } = useWorkspaceOrgStore();
  const [query, setQuery] = useState("");
  const [creatingPath, setCreatingPath] = useState(false);
  const canOrganize =
    topicsStore.canCreate ||
    resourcesStore.canCreateText ||
    resourcesStore.canUpload ||
    topicsStore.updatableIds.length > 0 ||
    resourcesStore.updatableIds.length > 0;

  const allPaths = listAllPaths(topicsStore.topics, resourcesStore.resources, pendingPaths);
  const visibleTopics = topics.filter((topic) => matchesQuery(query, topic.title, topic.folderPath, topic.report));
  const visibleResources = resources.filter((resource) =>
    matchesQuery(query, resource.title, resource.folderPath, resource.tags.join(" ")),
  );

  const submitNewPath = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!name) return;
    const target = [path, name].filter(Boolean).join("/");
    addPendingPath(target);
    setCreatingPath(false);
    onSelect(null, target);
  };

  const refresh = () => onSelect(selection);

  return (
    <section className="workspace-contents" aria-label={t("workspace.contents")}>
      <header className="workspace-contents-header">
        <nav className="workspace-breadcrumb" aria-label={t("workspace.pathBreadcrumb")}>
          <button className="workspace-crumb" type="button" onClick={() => onSelect(null, "")}>
            {t("workspace.allPaths")}
          </button>
          {path
            .split("/")
            .filter(Boolean)
            .map((segment, index, segments) => {
              const target = segments.slice(0, index + 1).join("/");
              return (
                <span key={target}>
                  <span className="workspace-crumb-sep" aria-hidden="true">
                    /
                  </span>
                  <button className="workspace-crumb" type="button" onClick={() => onSelect(null, target)}>
                    {segment}
                  </button>
                </span>
              );
            })}
          {canOrganize ? (
            <Button
              appearance="subtle"
              size="small"
              icon={<FolderAddRegular />}
              aria-label={t("workspace.createPath")}
              title={t("workspace.createPath")}
              onClick={() => setCreatingPath(true)}
            />
          ) : null}
        </nav>
        <div className="workspace-toolbar">
          <div className="workspace-search">
            <SearchRegular aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t("workspace.filterFolder")}
              aria-label={t("common.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {canOrganize && creatingPath ? (
          <form className="workspace-create-form" onSubmit={submitNewPath}>
            <input
              // biome-ignore lint/a11y/noAutofocus: le formulaire apparaît à la demande, le focus suit l'intention
              autoFocus
              name="title"
              type="text"
              placeholder={t("workspace.newPathPlaceholder")}
              aria-label={t("workspace.createPath")}
              required
            />
            <Button appearance="primary" size="small" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
            <Button appearance="secondary" size="small" type="button" onClick={() => setCreatingPath(false)}>
              {t("common.cancel")}
            </Button>
          </form>
        ) : null}
      </header>

      <div className="workspace-lists">
        <section aria-labelledby="workspace-topics-heading">
          <h2 className="workspace-list-heading" id="workspace-topics-heading">
            {t("workspace.topicsHeading")}
          </h2>
          {visibleTopics.length === 0 ? (
            <p className="workspace-list-empty">{t("workspace.noTopics")}</p>
          ) : (
            <ul className="workspace-list">
              {visibleTopics.map((topic) => (
                <ContentRow
                  key={topic.id}
                  payload={{ kind: "topic", id: topic.id }}
                  movable={topicsStore.updatableIds.includes(topic.id)}
                  movePaths={allPaths.filter((candidate) => candidate !== topic.folderPath)}
                  onOpen={() => onSelect({ kind: "topic", id: topic.id })}
                  afterMove={refresh}
                >
                  <button
                    className={`workspace-row${selection?.kind === "topic" && selection.id === topic.id ? " workspace-row-active" : ""}`}
                    type="button"
                    onClick={() => onSelect({ kind: "topic", id: topic.id })}
                  >
                    <TopicGlyph topic={topic} />
                    <span className="workspace-row-copy">
                      <strong>{topic.title}</strong>
                      <span>
                        {t(topicKindKeys[topic.kind])}
                        {topic.folderPath && topic.folderPath !== path ? ` · ${topic.folderPath}` : ""}
                      </span>
                    </span>
                    <StatusBadge value={topic.state} />
                  </button>
                </ContentRow>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="workspace-resources-heading">
          <h2 className="workspace-list-heading" id="workspace-resources-heading">
            {t("workspace.resourcesHeading")}
          </h2>
          {visibleResources.length === 0 ? (
            <p className="workspace-list-empty">{t("workspace.noResources")}</p>
          ) : (
            <ul className="workspace-list">
              {visibleResources.map((resource) => (
                <ContentRow
                  key={resource.id}
                  payload={{ kind: "resource", id: resource.id }}
                  movable={resourcesStore.updatableIds.includes(resource.id)}
                  movePaths={allPaths.filter((candidate) => candidate !== resource.folderPath)}
                  onOpen={() => onSelect({ kind: "resource", id: resource.id })}
                  afterMove={refresh}
                >
                  <button
                    className={`workspace-row${selection?.kind === "resource" && selection.id === resource.id ? " workspace-row-active" : ""}`}
                    type="button"
                    onClick={() => onSelect({ kind: "resource", id: resource.id })}
                  >
                    <ResourceGlyph resource={resource} />
                    <span className="workspace-row-copy">
                      <strong>{resource.title}</strong>
                      <span>
                        {typeLabel(resource)}
                        {resource.kind === "document" ? ` · ${formatFileSize(resource.byteSize)}` : ""}
                        {resource.folderPath && resource.folderPath !== path ? ` · ${resource.folderPath}` : ""}
                      </span>
                    </span>
                  </button>
                </ContentRow>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
