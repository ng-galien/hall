import { type ReactNode, type RefObject, useEffect } from "react";
import { ChevronRightIcon, CloseIcon, FolderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CouncilBusinessGlyph } from "../../../features/council-business/CouncilBusinessGlyph";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../../features/documents/DocumentaryResourceGlyph";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../../models/councilBusiness";
import { useCouncilBusinessStore } from "../../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../../stores/workspaceResourcesStore";
import { listCatalogPaths } from "../paths";
import { sameWorkspaceItem, type WorkspaceSelection } from "../workspaceItemReference";
import "./WorkspaceBreadcrumb.css";

function CrumbMenu({
  parent,
  allPaths,
  businesses,
  resources,
  currentSelection,
  trailing,
  onSelect,
}: {
  parent: string;
  allPaths: string[];
  businesses: CouncilBusinessView[];
  resources: DocumentaryLeafSummary[];
  currentSelection: WorkspaceSelection;
  /** Last crumb: nothing follows it, so no chevron is drawn. */
  trailing: boolean;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  if (trailing) return null;
  const prefix = parent ? `${parent}/` : "";
  const children = allPaths
    .filter((candidate) => candidate.startsWith(prefix) && candidate !== parent)
    .map((candidate) => candidate.slice(prefix.length).split("/")[0])
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort((left, right) => left.localeCompare(right, "fr"));
  const directBusinesses = businesses
    .filter(
      (business) =>
        business.folderPath === parent &&
        (!currentSelection || !sameWorkspaceItem(currentSelection, { kind: "councilBusiness", id: business.id })),
    )
    .sort((left, right) => left.title.localeCompare(right.title, "fr"));
  const directResources = resources
    .filter(
      (resource) =>
        resource.path === parent &&
        (!currentSelection || !sameWorkspaceItem(currentSelection, { kind: "resource", id: resource.id })),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const hasContents = children.length > 0 || directBusinesses.length > 0 || directResources.length > 0;
  if (!hasContents) {
    return (
      <span className="workspace-crumb-sep" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="plain"
          className="workspace-crumb-children"
          data-testid="workspace-breadcrumb-folder-menu"
          data-path={parent}
          aria-label={t("workspace.browseFolder")}
          title={t("workspace.browseFolder")}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="workspace-crumb-menu w-max max-w-(--hall-size-picker-panel-max)" align="start">
        {children.length > 0 ? <DropdownMenuLabel>{t("workspace.folders")}</DropdownMenuLabel> : null}
        {children.map((name) => {
          const childPath = prefix + name;
          return (
            <DropdownMenuItem
              key={`folder:${childPath}`}
              data-testid="workspace-breadcrumb-folder"
              data-path={childPath}
              onSelect={() => onSelect(null, childPath)}
            >
              <FolderIcon />
              <span className="workspace-crumb-menu-label" title={name}>
                {name}
              </span>
            </DropdownMenuItem>
          );
        })}
        {children.length > 0 && (directBusinesses.length > 0 || directResources.length > 0) ? (
          <DropdownMenuSeparator />
        ) : null}
        {directBusinesses.length > 0 ? (
          <DropdownMenuLabel>{t("workspace.councilBusinessHeading")}</DropdownMenuLabel>
        ) : null}
        {directBusinesses.map((business) => (
          <DropdownMenuItem
            key={`business:${business.id}`}
            data-testid="workspace-breadcrumb-council-business"
            data-item-id={business.id}
            onSelect={() => onSelect({ kind: "councilBusiness", id: business.id }, parent)}
          >
            <CouncilBusinessGlyph business={business} />
            <span className="workspace-crumb-menu-label" title={business.title}>
              {business.title}
            </span>
          </DropdownMenuItem>
        ))}
        {directBusinesses.length > 0 && directResources.length > 0 ? <DropdownMenuSeparator /> : null}
        {directResources.length > 0 ? <DropdownMenuLabel>{t("workspace.resourcesHeading")}</DropdownMenuLabel> : null}
        {directResources.map((resource) => (
          <DropdownMenuItem
            key={`resource:${resource.id}`}
            data-testid="workspace-breadcrumb-resource"
            data-item-id={resource.id}
            onSelect={() => onSelect({ kind: "resource", id: resource.id }, parent)}
          >
            <DocumentaryResourceGlyph resource={resource} />
            <span className="workspace-crumb-menu-label" title={resource.name}>
              {resource.name}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BreadcrumbActions({
  statusControl,
  onClose,
  closeButtonRef,
  closeTestId,
  closeLabel,
}: {
  statusControl?: ReactNode;
  onClose?(): void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  closeTestId: string;
  closeLabel: string;
}) {
  if (!statusControl && !onClose) return null;

  return (
    <span className="workspace-breadcrumb-actions">
      {statusControl}
      {onClose ? (
        <Button
          ref={closeButtonRef}
          variant="plain"
          size="icon"
          data-testid={closeTestId}
          title={closeLabel}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  );
}

/**
 * Workspace breadcrumb; selecting a crumb opens that folder and closes the open item, and the chevron after a crumb
 * opens the menu of its folders, affaires and documents. In the screen header the open item and the current folder
 * are the title of the screen and are not repeated in the trail.
 */
export function WorkspaceBreadcrumb({
  path,
  currentLabel,
  currentIcon,
  currentSelection = null,
  originPath,
  onClose,
  onSelect,
  interactive = true,
  closeButtonRef,
  closeTestId = "workspace-breadcrumb-close",
  statusControl,
}: {
  path: string;
  /** Title of the item currently open, if any. */
  currentLabel?: string;
  /** Same presentation glyph as the open item header. */
  currentIcon?: ReactNode;
  currentSelection?: WorkspaceSelection;
  originPath?: string;
  onClose?(): void;
  onSelect?(selection: WorkspaceSelection, path?: string): void;
  interactive?: boolean;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  closeTestId?: string;
  statusControl?: ReactNode;
}) {
  const { t } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const catalog = useWorkspaceResourcesStore((state) => state.catalog);
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const loadFolder = useWorkspaceResourcesStore((state) => state.loadFolder);
  const resources = Object.values(summaries).filter(
    (resource): resource is DocumentaryLeafSummary => resource.kind !== "folder",
  );
  const allPaths = (() => {
    const known = new Set(listCatalogPaths(catalog));
    for (const folderPath of businesses.map((business) => business.folderPath)) {
      const parts = folderPath.split("/").filter(Boolean);
      parts.forEach((_part, index) => {
        known.add(parts.slice(0, index + 1).join("/"));
      });
    }
    return [...known].sort((left, right) => left.localeCompare(right, "fr-FR"));
  })();
  const segments = path.split("/").filter(Boolean);

  useEffect(() => {
    if (!interactive) return;
    const pathSegments = path.split("/").filter(Boolean);
    const parents = ["", ...pathSegments.map((_segment, index) => pathSegments.slice(0, index + 1).join("/"))];
    for (const parent of parents) void loadFolder(parent);
  }, [interactive, loadFolder, path]);

  if (!interactive) {
    return (
      <nav className="workspace-breadcrumb" aria-label={t("workspace.pathBreadcrumb")}>
        <span className="workspace-crumb workspace-crumb-root" title={t("workspace.allPaths")}>
          {t("navigation.workspace")}
        </span>
        {segments.map((segment, index) => (
          <span className="workspace-crumb-group" key={segments.slice(0, index + 1).join("/")}>
            <span className="workspace-crumb-sep" aria-hidden="true">
              <ChevronRightIcon />
            </span>
            <span className="workspace-crumb">{segment}</span>
          </span>
        ))}
        {currentLabel ? (
          <>
            <span className="workspace-crumb-sep" aria-hidden="true">
              <ChevronRightIcon />
            </span>
            <span className="workspace-crumb-current">
              {currentIcon}
              <span className="workspace-crumb-current-label">{currentLabel}</span>
            </span>
          </>
        ) : null}
        <BreadcrumbActions
          statusControl={statusControl}
          onClose={onClose}
          closeButtonRef={closeButtonRef}
          closeTestId={closeTestId}
          closeLabel={t("common.close")}
        />
      </nav>
    );
  }

  return (
    <nav className="workspace-breadcrumb" aria-label={t("workspace.pathBreadcrumb")}>
      <Button
        variant="plain"
        className={`workspace-crumb workspace-crumb-root${originPath === "" ? " workspace-crumb-origin" : ""}${segments.length === 0 && !currentLabel ? " workspace-crumb-here" : ""}`}
        data-testid="workspace-breadcrumb-root"
        title={t("workspace.allPaths")}
        onClick={() => onSelect?.(null, "")}
      >
        {t("navigation.workspace")}
      </Button>
      <CrumbMenu
        parent=""
        allPaths={allPaths}
        businesses={businesses}
        resources={resources}
        currentSelection={currentSelection}
        trailing={path.split("/").filter(Boolean).length === 0 && !currentLabel}
        onSelect={onSelect!}
      />
      {path
        .split("/")
        .filter(Boolean)
        .map((segment, index, segments) => {
          const target = segments.slice(0, index + 1).join("/");
          return (
            <span className="workspace-crumb-group" key={target}>
              <Button
                variant="plain"
                className={`workspace-crumb${originPath === target ? " workspace-crumb-origin" : ""}${index === segments.length - 1 && !currentLabel ? " workspace-crumb-here" : ""}`}
                aria-current={index === segments.length - 1 && !currentLabel ? "page" : undefined}
                onClick={() => onSelect?.(null, target)}
              >
                {segment}
              </Button>
              <CrumbMenu
                parent={target}
                allPaths={allPaths}
                businesses={businesses}
                resources={resources}
                currentSelection={currentSelection}
                trailing={index === segments.length - 1 && !currentLabel}
                onSelect={onSelect!}
              />
            </span>
          );
        })}
      <BreadcrumbActions
        statusControl={statusControl}
        onClose={onClose}
        closeButtonRef={closeButtonRef}
        closeTestId={closeTestId}
        closeLabel={t("common.close")}
      />
    </nav>
  );
}
