import { type ReactNode, type RefObject, useEffect } from "react";
import { ChevronRightIcon, CloseIcon, CouncilBusinessIcon, FolderIcon } from "@/components/icons";
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
import { type SaveStatus, useSaveStatusStore } from "../saveStatusStore";
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
  /** Last crumb: a chevron with no folder contents renders nothing. */
  trailing: boolean;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
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
    if (trailing) return null;
    return (
      <span className="workspace-crumb-sep" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="workspace-crumb-children"
          data-testid="workspace-breadcrumb-folder-menu"
          data-path={parent}
          type="button"
          aria-label={t("workspace.browseFolder")}
          title={t("workspace.browseFolder")}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>
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
  showSaveStatus,
  currentLabel,
  saveStatus,
  saveStatusLabels,
  onClose,
  closeButtonRef,
  closeTestId,
  closeLabel,
}: {
  statusControl?: ReactNode;
  showSaveStatus: boolean;
  currentLabel?: string;
  saveStatus: SaveStatus;
  saveStatusLabels: Record<Exclude<SaveStatus, "idle">, string>;
  onClose?(): void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  closeTestId: string;
  closeLabel: string;
}) {
  const showFallbackSaveStatus = !statusControl && showSaveStatus && currentLabel && saveStatus !== "idle";
  if (!statusControl && !showFallbackSaveStatus && !onClose) return null;

  return (
    <span className="workspace-breadcrumb-actions">
      {statusControl}
      {showFallbackSaveStatus ? (
        <span
          data-testid="workspace-save-status"
          data-state={saveStatus}
          className={`workspace-save-dot workspace-save-${saveStatus}`}
          role="status"
          title={saveStatusLabels[saveStatus]}
          aria-label={saveStatusLabels[saveStatus]}
        />
      ) : null}
      {onClose ? (
        <button
          ref={closeButtonRef}
          className="workspace-breadcrumb-close"
          data-testid={closeTestId}
          type="button"
          title={closeLabel}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <CloseIcon aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

/** Workspace breadcrumb; selecting a crumb opens that folder and closes the open item. */
export function WorkspaceBreadcrumb({
  path,
  currentLabel,
  currentIcon,
  currentSelection = null,
  originPath,
  onClose,
  onSelect,
  interactive = true,
  showSaveStatus = true,
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
  showSaveStatus?: boolean;
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
  const saveStatus = useSaveStatusStore((state) => state.status);
  const saveStatusLabels: Record<Exclude<SaveStatus, "idle">, string> = {
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.requestFailed"),
  };
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
          className="workspace-crumb workspace-crumb-root"
          role="img"
          title={t("workspace.allPaths")}
          aria-label={t("workspace.allPaths")}
        >
          <CouncilBusinessIcon aria-hidden="true" data-testid="workspace-root-business-icon" />
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
          showSaveStatus={false}
          currentLabel={currentLabel}
          saveStatus={saveStatus}
          saveStatusLabels={saveStatusLabels}
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
      <button
        className={`workspace-crumb workspace-crumb-root${originPath === "" ? " workspace-crumb-origin" : ""}`}
        data-testid="workspace-breadcrumb-root"
        type="button"
        title={t("workspace.allPaths")}
        aria-label={t("workspace.allPaths")}
        onClick={() => onSelect?.(null, "")}
      >
        <CouncilBusinessIcon aria-hidden="true" data-testid="workspace-root-business-icon" />
      </button>
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
              <button
                className={`workspace-crumb${originPath === target ? " workspace-crumb-origin" : ""}`}
                type="button"
                onClick={() => onSelect?.(null, target)}
              >
                {segment}
              </button>
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
      {currentLabel ? (
        <span className="workspace-crumb-current">
          {currentIcon}
          <span className="workspace-crumb-current-label">{currentLabel}</span>
        </span>
      ) : null}
      <BreadcrumbActions
        statusControl={statusControl}
        showSaveStatus={showSaveStatus}
        currentLabel={currentLabel}
        saveStatus={saveStatus}
        saveStatusLabels={saveStatusLabels}
        onClose={onClose}
        closeButtonRef={closeButtonRef}
        closeTestId={closeTestId}
        closeLabel={t("common.close")}
      />
    </nav>
  );
}
