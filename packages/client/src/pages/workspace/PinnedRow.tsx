import { DismissRegular, PinRegular } from "@fluentui/react-icons";
import type { Resource, Topic } from "@hall/domain";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { ResourceGlyph, TopicGlyph } from "./ResourceGlyph";
import type { WorkspaceSelection } from "./WorkspacePage";
import { useWorkspacePrefsStore, type WorkspacePin } from "./workspacePrefs";

/** Rangée des sujets et documents épinglés, sous la barre de recherche. */
export function PinnedRow({
  selection,
  onSelect,
}: {
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  const { pins, togglePin } = useWorkspacePrefsStore();
  const { topics } = useTopicsStore();
  const { resources } = useResourcesStore();

  interface PinEntry {
    pin: WorkspacePin;
    topic?: Topic;
    resource?: Resource;
  }
  const entries = pins.flatMap((pin): PinEntry[] => {
    if (pin.kind === "topic") {
      const topic = topics.find((candidate) => candidate.id === pin.id);
      return topic ? [{ pin, topic }] : [];
    }
    const resource = resources.find((candidate) => candidate.id === pin.id);
    return resource ? [{ pin, resource }] : [];
  });

  if (entries.length === 0) return null;

  return (
    <div className="wpins" role="toolbar" aria-label={t("workspace.pinned")}>
      <PinRegular aria-hidden="true" className="wpins-icon" />
      {entries.map(({ pin, topic, resource }) => {
        const title = topic?.title ?? resource?.title ?? "";
        const isActive = selection !== null && selection.kind === pin.kind && selection.id === pin.id;
        return (
          <span className={`wpins-chip${isActive ? " wpins-chip-active" : ""}`} key={`${pin.kind}:${pin.id}`}>
            <button
              className="wpins-open"
              type="button"
              onClick={() => onSelect(pin, topic?.folderPath ?? resource?.folderPath)}
            >
              {topic ? <TopicGlyph topic={topic} /> : resource ? <ResourceGlyph resource={resource} /> : null}
              <span className="wpins-title">{title}</span>
            </button>
            <button
              className="wpins-remove"
              type="button"
              aria-label={t("workspace.unpin").replace("{name}", title)}
              onClick={() => togglePin(pin)}
            >
              <DismissRegular />
            </button>
          </span>
        );
      })}
    </div>
  );
}
