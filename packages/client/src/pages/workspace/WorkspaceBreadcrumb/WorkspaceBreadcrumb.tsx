import { type ReactNode, type RefObject, useEffect, useState } from "react";
import { CloseIcon, FolderIcon } from "@/components/icons";
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

/** The separator of the trail: a discreet slash. */
function Separator() {
  return (
    <span className="workspace-crumb-sep" aria-hidden="true">
      /
    </span>
  );
}

/**
 * One folder of the trail: its name opens, by a click or a right click, the menu that opens the folder or one of its
 * folders, affaires and documents.
 */
function FolderCrumb({
  parent,
  label,
  here,
  origin,
  allPaths,
  businesses,
  resources,
  currentSelection,
  testId,
  onSelect,
}: {
  parent: string;
  label: ReactNode;
  here: boolean;
  origin: boolean;
  allPaths: string[];
  businesses: CouncilBusinessView[];
  resources: DocumentaryLeafSummary[];
  currentSelection: WorkspaceSelection;
  testId?: string;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
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
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="plain"
          className="workspace-crumb"
          data-testid={testId}
          data-path={parent}
          data-origin={origin ? "true" : undefined}
          aria-current={here ? "page" : undefined}
          title={t("workspace.browseFolder")}
          onContextMenu={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="workspace-crumb-menu w-max max-w-(--hall-size-picker-panel-max)" align="start">
        <DropdownMenuItem
          data-testid="workspace-breadcrumb-open"
          data-path={parent}
          onSelect={() => onSelect(null, parent)}
        >
          <FolderIcon />
          <span className="workspace-crumb-menu-label">{t("workspace.openFolder")}</span>
        </DropdownMenuItem>
        {children.length > 0 ? <DropdownMenuSeparator /> : null}
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
        {directBusinesses.length > 0 ? <DropdownMenuSeparator /> : null}
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
        {directResources.length > 0 ? <DropdownMenuSeparator /> : null}
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
 * Workspace breadcrumb, on one line separated by discreet slashes, without any command. In the screen header it lists
 * the folders above the screen; the name of a folder opens, by a click or a right click, the menu that opens it or one
 * of its contents, and the open item itself is the title of the screen. In a dialog it is a plain trail.
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
        <span
          className="workspace-crumb"
          role="img"
          title={t("workspace.allPaths")}
          aria-label={t("workspace.allPaths")}
        >
          <FolderIcon aria-hidden="true" data-testid="workspace-root-icon" />
        </span>
        {segments.map((segment, index) => (
          <span className="workspace-crumb-group" key={segments.slice(0, index + 1).join("/")}>
            <Separator />
            <span className="workspace-crumb">{segment}</span>
          </span>
        ))}
        {currentLabel ? (
          <>
            <Separator />
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

  const folderCrumb = (target: string, here: boolean, label: ReactNode, testId?: string) => (
    <FolderCrumb
      parent={target}
      label={label}
      here={here}
      origin={originPath === target}
      allPaths={allPaths}
      businesses={businesses}
      resources={resources}
      currentSelection={currentSelection}
      testId={testId}
      onSelect={onSelect!}
    />
  );

  return (
    <nav className="workspace-breadcrumb" aria-label={t("workspace.pathBreadcrumb")}>
      {folderCrumb(
        "",
        segments.length === 0 && !currentLabel,
        <>
          <FolderIcon aria-hidden="true" data-testid="workspace-root-icon" />
          <span className="workspace-crumb-label">{t("navigation.workspace")}</span>
        </>,
        "workspace-breadcrumb-root",
      )}
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join("/");
        return (
          <span className="workspace-crumb-group" key={target}>
            <Separator />
            {folderCrumb(
              target,
              index === segments.length - 1 && !currentLabel,
              <span className="workspace-crumb-label">{segment}</span>,
            )}
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
