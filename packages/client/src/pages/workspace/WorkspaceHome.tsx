import { useMemo, useState } from "react";
import { FolderIcon } from "../../components/icons";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { councilBusinessKindKeys } from "../../features/council-business/presentation";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { buildPathTree } from "./paths";
import type { WorkspaceSelection } from "./WorkspacePage";

const RECENT_LIMIT = 6;
const FOLDER_LIMIT = 10;

/** Accueil de l'espace de travail : derniers sujets travaillés, dossiers par volume. */
export function WorkspaceHome({ onSelect }: { onSelect(selection: WorkspaceSelection, path?: string): void }) {
  const { t, formatNumber, formatDate } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const { resources } = useResourcesStore();
  const [allFolders, setAllFolders] = useState(false);

  const recentBusinesses = useMemo(
    () => [...businesses].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, RECENT_LIMIT),
    [businesses],
  );
  const folders = useMemo(() => buildPathTree(businesses, resources), [businesses, resources]);
  const visibleFolders = allFolders ? folders : folders.slice(0, FOLDER_LIMIT);

  return (
    <div className="whome">
      <section aria-labelledby="whome-recent">
        <div className="whome-heading">
          <h2 id="whome-recent">{t("workspace.recentSubjects")}</h2>
        </div>
        {recentBusinesses.length === 0 ? (
          <p className="workspace-list-empty">{t("workspace.emptyBench")}</p>
        ) : (
          <div className="whome-cards">
            {recentBusinesses.map((business) => (
              <button
                className="whome-card"
                type="button"
                key={business.id}
                onClick={() => onSelect({ kind: "councilBusiness", id: business.id }, business.folderPath)}
              >
                <div className="whome-card-head">
                  <CouncilBusinessGlyph business={business} />
                </div>
                <strong>{business.title}</strong>
                <span className="whome-card-meta">
                  {t(councilBusinessKindKeys[business.kind])}
                  {business.folderPath ? ` · ${business.folderPath}` : ""}
                </span>
                <span className="whome-card-foot">
                  {t("workspace.updatedOn").replace("{date}", formatDate(business.updatedAt))}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="whome-folders">
        <div className="whome-heading">
          <h2 id="whome-folders">{t("workspace.folders")}</h2>
          <span>{t("workspace.foldersByVolume")}</span>
        </div>
        <div className="whome-tiles">
          {visibleFolders.map((folder) => (
            <button className="whome-tile" type="button" key={folder.path} onClick={() => onSelect(null, folder.path)}>
              <FolderIcon aria-hidden="true" />
              {folder.name}
              <small>{formatNumber(folder.count)}</small>
            </button>
          ))}
          {folders.length > FOLDER_LIMIT ? (
            <button className="whome-tile whome-tile-more" type="button" onClick={() => setAllFolders(!allFolders)}>
              {allFolders
                ? t("workspace.showLessFolders")
                : t("workspace.showAllFolders").replace("{count}", formatNumber(folders.length - FOLDER_LIMIT))}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
