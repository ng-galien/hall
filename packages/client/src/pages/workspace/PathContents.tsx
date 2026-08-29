import type { Resource, Topic } from "@hall/domain";
import { type DragEvent, type ReactNode, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResourceGlyph, TopicGlyph, useResourceTypeLabel } from "../../components/ResourceGlyph";
import { StatusBadge } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { listAllPaths } from "./paths";
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
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li
      draggable={movable}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DRAG_TYPE, encodeDragPayload(payload));
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Déclencheur invisible : le menu s'ouvre au clic droit sur la ligne et s'ancre ici. */}
        <DropdownMenuTrigger asChild>
          <span aria-hidden="true" className="sr-only" tabIndex={-1} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-auto">
          <DropdownMenuItem onSelect={onOpen}>{t("workspace.open")}</DropdownMenuItem>
          {movable ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("workspace.moveTo")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => void moveToPath(payload, "").then(afterMove)}>
                  {t("resources.rootFolder")}
                </DropdownMenuItem>
                {movePaths.map((target) => (
                  <DropdownMenuItem key={target} onSelect={() => void moveToPath(payload, target).then(afterMove)}>
                    {target}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {children}
    </li>
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
  const typeLabel = useResourceTypeLabel();
  const topicsStore = useTopicsStore();
  const resourcesStore = useResourcesStore();
  const { pendingPaths } = useWorkspaceOrgStore();

  const allPaths = listAllPaths(topicsStore.topics, resourcesStore.resources, pendingPaths);
  const visibleTopics = topics;
  const visibleResources = resources;

  const refresh = () => onSelect(selection);

  return (
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
  );
}
