import { FolderRegular } from "@fluentui/react-icons";
import type { Topic } from "@mairie/domain";
import { useMemo, useState } from "react";
import { StatusBadge } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { topicKindKeys } from "../council-meetings/AgendaComposer";
import { buildPathTree } from "./paths";
import { TopicGlyph } from "./ResourceGlyph";
import type { WorkspaceSelection } from "./WorkspacePage";

const RECENT_LIMIT = 6;
const FOLDER_LIMIT = 10;

/** Accueil de l'espace de travail : derniers sujets travaillés, dossiers par volume. */
export function WorkspaceHome({ onSelect }: { onSelect(selection: WorkspaceSelection, path?: string): void }) {
  const { t, formatNumber, formatDate } = useI18n();
  const { topics } = useTopicsStore();
  const { resources } = useResourcesStore();
  const { meetings } = useCouncilMeetingsStore();
  const [allFolders, setAllFolders] = useState(false);

  const recentTopics = useMemo(
    () => [...topics].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, RECENT_LIMIT),
    [topics],
  );
  const folders = useMemo(() => buildPathTree(topics, resources), [topics, resources]);
  const visibleFolders = allFolders ? folders : folders.slice(0, FOLDER_LIMIT);

  const meetingChip = (topic: Topic) =>
    topic.currentMeetingId ? (meetings.find((meeting) => meeting.id === topic.currentMeetingId)?.title ?? null) : null;

  return (
    <div className="whome">
      <section aria-labelledby="whome-recent">
        <div className="whome-heading">
          <h2 id="whome-recent">{t("workspace.recentSubjects")}</h2>
        </div>
        {recentTopics.length === 0 ? (
          <p className="workspace-list-empty">{t("workspace.emptyBench")}</p>
        ) : (
          <div className="whome-cards">
            {recentTopics.map((topic) => (
              <button
                className="whome-card"
                type="button"
                key={topic.id}
                onClick={() => onSelect({ kind: "topic", id: topic.id }, topic.folderPath)}
              >
                <div className="whome-card-head">
                  <TopicGlyph topic={topic} />
                  <StatusBadge value={topic.state} />
                </div>
                <strong>{topic.title}</strong>
                <span className="whome-card-meta">
                  {t(topicKindKeys[topic.kind])}
                  {topic.folderPath ? ` · ${topic.folderPath}` : ""}
                </span>
                <span className="whome-card-foot">
                  {meetingChip(topic) ?? t("workspace.updatedOn").replace("{date}", formatDate(topic.updatedAt))}
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
              <FolderRegular aria-hidden="true" />
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
