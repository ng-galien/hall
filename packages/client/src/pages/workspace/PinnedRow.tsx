import { matchDiscriminated } from "@hall/domain";
import { useEffect } from "react";
import { CloseIcon, PinIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
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
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const openResource = useWorkspaceResourcesStore((state) => state.open);

  useEffect(() => {
    for (const pin of pins) {
      if (pin.kind === "resource" && !summaries[pin.id]) void openResource(pin.id);
    }
  }, [openResource, pins, summaries]);

  interface PinEntry {
    pin: WorkspacePin;
    business?: CouncilBusinessView;
    resource?: DocumentaryLeafSummary;
  }
  const entries = pins.flatMap((pin): PinEntry[] => {
    return matchDiscriminated(pin, "kind", {
      councilBusiness: (entry) => {
        const business = businesses.find((candidate) => candidate.id === entry.id);
        return business ? [{ pin, business }] : [];
      },
      resource: (entry) => {
        const resource = summaries[entry.id];
        return resource && resource.kind !== "folder" ? [{ pin, resource }] : [];
      },
    });
  });

  if (entries.length === 0) return null;

  return (
    <div className="wpins" role="toolbar" aria-label={t("workspace.pinned")}>
      <PinIcon aria-hidden="true" className="wpins-icon" />
      {entries.map(({ pin, business, resource }) => {
        const title = business?.title ?? resource?.name ?? "";
        const isActive = selection !== null && selection.kind === pin.kind && selection.id === pin.id;
        return (
          <span className="wpins-item" key={`${pin.kind}:${pin.id}`}>
            <Button
              variant="secondary"
              aria-pressed={isActive}
              onClick={() => onSelect(pin, business?.folderPath ?? resource?.path)}
            >
              {business ? (
                <CouncilBusinessGlyph business={business} />
              ) : resource ? (
                <DocumentaryResourceGlyph resource={resource} />
              ) : null}
              <span className="wpins-title">{title}</span>
            </Button>
            <Button
              variant="plain"
              size="icon"
              aria-label={t("workspace.unpin", { name: title })}
              onClick={() => togglePin(pin)}
            >
              <CloseIcon />
            </Button>
          </span>
        );
      })}
    </div>
  );
}
