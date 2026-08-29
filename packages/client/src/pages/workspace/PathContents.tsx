import type { CouncilBusiness, Resource } from "@hall/domain";
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
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { councilBusinessKindKeys } from "../../features/council-business/presentation";
import { ResourceGlyph, useResourceTypeLabel } from "../../features/documents/ResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useResourcesStore } from "../../stores/resourcesStore";
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
  businesses,
  resources,
  selection,
  onSelect,
}: {
  path: string;
  businesses: CouncilBusiness[];
  resources: Resource[];
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t, formatFileSize } = useI18n();
  const typeLabel = useResourceTypeLabel();
  const councilBusinessStore = useCouncilBusinessStore();
  const resourcesStore = useResourcesStore();
  const { pendingPaths } = useWorkspaceOrgStore();

  const allPaths = listAllPaths(councilBusinessStore.businesses, resourcesStore.resources, pendingPaths);
  const visibleBusinesses = businesses;
  const visibleResources = resources;

  const refresh = () => onSelect(selection);

  return (
    <div className="workspace-lists">
      <section aria-labelledby="workspace-businesses-heading">
        <h2 className="workspace-list-heading" id="workspace-businesses-heading">
          {t("workspace.councilBusinessHeading")}
        </h2>
        {visibleBusinesses.length === 0 ? (
          <p className="workspace-list-empty">{t("workspace.noCouncilBusiness")}</p>
        ) : (
          <ul className="workspace-list">
            {visibleBusinesses.map((business) => (
              <ContentRow
                key={business.id}
                payload={{ kind: "councilBusiness", id: business.id }}
                movable={councilBusinessStore.updatableIds.includes(business.id)}
                movePaths={allPaths.filter((candidate) => candidate !== business.folderPath)}
                onOpen={() => onSelect({ kind: "councilBusiness", id: business.id })}
                afterMove={refresh}
              >
                <button
                  className={`workspace-row${selection?.kind === "councilBusiness" && selection.id === business.id ? " workspace-row-active" : ""}`}
                  type="button"
                  onClick={() => onSelect({ kind: "councilBusiness", id: business.id })}
                >
                  <CouncilBusinessGlyph business={business} />
                  <span className="workspace-row-copy">
                    <strong>{business.title}</strong>
                    <span>
                      {t(councilBusinessKindKeys[business.kind])}
                      {business.folderPath && business.folderPath !== path ? ` · ${business.folderPath}` : ""}
                    </span>
                  </span>
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
