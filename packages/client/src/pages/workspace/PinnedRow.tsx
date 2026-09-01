import { type CouncilBusiness, matchDiscriminated, type Resource } from "@hall/domain";
import { CloseIcon, PinIcon } from "../../components/icons";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { ResourceGlyph } from "../../features/documents/ResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore, type WorkspacePin } from "./workspacePrefs";

/** Row of pinned matters and documents, below the search bar. */
export function PinnedRow({
  selection,
  onSelect,
}: {
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t } = useI18n();
  const { pins, togglePin } = useWorkspacePrefsStore();
  const { businesses } = useCouncilBusinessStore();
  const { resources } = useResourcesStore();

  interface PinEntry {
    pin: WorkspacePin;
    business?: CouncilBusiness;
    resource?: Resource;
  }
  const entries = pins.flatMap((pin): PinEntry[] => {
    return matchDiscriminated(pin, "kind", {
      councilBusiness: (entry) => {
        const business = businesses.find((candidate) => candidate.id === entry.id);
        return business ? [{ pin, business }] : [];
      },
      resource: (entry) => {
        const resource = resources.find((candidate) => candidate.id === entry.id);
        return resource ? [{ pin, resource }] : [];
      },
    });
  });

  if (entries.length === 0) return null;

  return (
    <div className="wpins" role="toolbar" aria-label={t("workspace.pinned")}>
      <PinIcon aria-hidden="true" className="app-icon wpins-icon" />
      {entries.map(({ pin, business, resource }) => {
        const title = business?.title ?? resource?.title ?? "";
        const isActive = selection !== null && selection.kind === pin.kind && selection.id === pin.id;
        return (
          <span className={`wpins-chip${isActive ? " wpins-chip-active" : ""}`} key={`${pin.kind}:${pin.id}`}>
            <button
              className="wpins-open"
              type="button"
              onClick={() => onSelect(pin, business?.folderPath ?? resource?.folderPath)}
            >
              {business ? (
                <CouncilBusinessGlyph business={business} />
              ) : resource ? (
                <ResourceGlyph resource={resource} />
              ) : null}
              <span className="wpins-title">{title}</span>
            </button>
            <button
              className="wpins-remove"
              type="button"
              aria-label={t("workspace.unpin").replace("{name}", title)}
              onClick={() => togglePin(pin)}
            >
              <CloseIcon />
            </button>
          </span>
        );
      })}
    </div>
  );
}
