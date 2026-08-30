import { ChevronRightIcon, CloseIcon, FolderIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { listAllPaths } from "./paths";
import { type SaveStatus, useSaveStatusStore } from "./saveStatusStore";
import type { WorkspaceSelection } from "./WorkspacePage";

function CrumbChildren({
  parent,
  allPaths,
  trailing,
  onSelect,
}: {
  parent: string;
  allPaths: string[];
  /** Last crumb: a chevron with no children renders nothing. */
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
  if (children.length === 0) {
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
          type="button"
          aria-label={t("workspace.browseSubfolders")}
          title={t("workspace.browseSubfolders")}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {children.map((name) => (
          <DropdownMenuItem key={name} onSelect={() => onSelect(null, prefix + name)}>
            <FolderIcon /> {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Workspace breadcrumb; selecting a crumb opens that folder and closes the open item. */
export function WorkspaceBreadcrumb({
  path,
  currentLabel,
  originPath,
  onClose,
  onSelect,
}: {
  path: string;
  /** Title of the item currently open, if any. */
  currentLabel?: string;
  originPath?: string;
  onClose?(): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const { resources, folderPaths } = useResourcesStore();
  const allPaths = listAllPaths(businesses, resources, folderPaths);
  const saveStatus = useSaveStatusStore((state) => state.status);
  const saveStatusLabels: Record<Exclude<SaveStatus, "idle">, string> = {
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.requestFailed"),
  };

  return (
    <nav className="workspace-breadcrumb" aria-label={t("workspace.pathBreadcrumb")}>
      <button
        className={`workspace-crumb${originPath === "" ? " workspace-crumb-origin" : ""}`}
        type="button"
        onClick={() => onSelect(null, "")}
      >
        {t("workspace.allPaths")}
      </button>
      <CrumbChildren
        parent=""
        allPaths={allPaths}
        trailing={path.split("/").filter(Boolean).length === 0 && !currentLabel}
        onSelect={onSelect}
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
                onClick={() => onSelect(null, target)}
              >
                {segment}
              </button>
              <CrumbChildren
                parent={target}
                allPaths={allPaths}
                trailing={index === segments.length - 1 && !currentLabel}
                onSelect={onSelect}
              />
            </span>
          );
        })}
      {currentLabel ? <span className="workspace-crumb-current">{currentLabel}</span> : null}
      {currentLabel && saveStatus !== "idle" ? (
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
          className="workspace-breadcrumb-close"
          data-testid="workspace-breadcrumb-close"
          type="button"
          title={t("common.close")}
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <CloseIcon aria-hidden="true" />
        </button>
      ) : null}
    </nav>
  );
}
