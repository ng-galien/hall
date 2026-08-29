import { ChevronRightIcon, FolderIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { listAllPaths } from "./paths";
import { type SaveStatus, useSaveStatusStore } from "./saveStatusStore";
import type { WorkspaceSelection } from "./WorkspacePage";
import { useWorkspaceOrgStore } from "./workspaceOrg";

/**
 * Le sélecteur d'un cran du fil d'Ariane : un chevron qui liste les sous-dossiers du
 * niveau, pour descendre ou changer de branche sans repasser par l'arbre.
 */
function CrumbChildren({
  parent,
  allPaths,
  trailing,
  onSelect,
}: {
  parent: string;
  allPaths: string[];
  /** En bout de fil, un chevron sans sous-dossiers ne sépare rien : il disparaît. */
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
  /* Une seule modalité de séparateur : le chevron. Interactif quand le niveau a des
     sous-dossiers, simple jalon entre deux crans sinon — et rien en bout de fil. */
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

/**
 * Le fil d'Ariane de l'espace de travail — permanent, quel que soit le contenu du
 * conteneur : liste d'un dossier ou établi d'un élément ouvert. Cliquer un cran remonte
 * au dossier (et referme l'élément) ; l'élément ouvert est le dernier cran, inerte.
 */
export function WorkspaceBreadcrumb({
  path,
  currentLabel,
  onSelect,
}: {
  path: string;
  /** Le titre de l'élément ouvert dans le conteneur, s'il y en a un. */
  currentLabel?: string;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  const { topics } = useTopicsStore();
  const { resources } = useResourcesStore();
  const { pendingPaths } = useWorkspaceOrgStore();
  const allPaths = listAllPaths(topics, resources, pendingPaths);
  const saveStatus = useSaveStatusStore((state) => state.status);
  const saveStatusLabels: Record<Exclude<SaveStatus, "idle">, string> = {
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.requestFailed"),
  };

  return (
    <nav className="workspace-breadcrumb" aria-label={t("workspace.pathBreadcrumb")}>
      <button className="workspace-crumb" type="button" onClick={() => onSelect(null, "")}>
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
              <button className="workspace-crumb" type="button" onClick={() => onSelect(null, target)}>
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
          className={`workspace-save-dot workspace-save-${saveStatus}`}
          role="status"
          title={saveStatusLabels[saveStatus]}
          aria-label={saveStatusLabels[saveStatus]}
        />
      ) : null}
    </nav>
  );
}
