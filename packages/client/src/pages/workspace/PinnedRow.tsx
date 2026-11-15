import { matchDiscriminated } from "@hall/domain";
import { useEffect } from "react";
import { MoreIcon, PinIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
  documentaryResourceDate,
} from "../../features/documents/DocumentaryResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore, type WorkspacePin } from "./workspacePrefs";

// @implements-requirement HALL-FR-LAY-060
/** Pinned matters and documents, each an ordinary row of the list marked by a pin; « Désépingler » is in its « … » menu. */
export function PinnedRow({
  selection,
  onSelect,
}: {
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const { t, formatDate } = useI18n();
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
    <ListRows className="workspace-pins" aria-label={t("workspace.pinned")} data-wrap="true">
      {entries.map(({ pin, business, resource }) => {
        const title = business?.title ?? resource?.name ?? "";
        const isActive = selection !== null && selection.kind === pin.kind && selection.id === pin.id;
        const date = resource ? documentaryResourceDate(resource) : null;
        return (
          <ListRow
            key={`${pin.kind}:${pin.id}`}
            selected={isActive}
            head={
              business ? (
                <CouncilBusinessGlyph business={business} />
              ) : resource ? (
                <DocumentaryResourceGlyph resource={resource} />
              ) : null
            }
            title={title}
            detail={
              <>
                <span className="workspace-pin-mark" role="img" aria-label={t("workspace.pinnedItem")}>
                  <PinIcon />
                </span>
                {date ? formatDate(date.value) : null}
              </>
            }
            onOpen={() => onSelect(pin, business?.folderPath ?? resource?.path)}
            openTestId={`workspace-pin-open-${pin.id}`}
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="plain"
                    size="icon"
                    data-testid={`workspace-pin-commands-${pin.id}`}
                    aria-label={t("item.more")}
                  >
                    <MoreIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid={`workspace-pin-unpin-${pin.id}`}
                    aria-label={t("workspace.unpin", { name: title })}
                    onSelect={() => togglePin(pin)}
                  >
                    <PinIcon />
                    <span>{t("workspace.unpinShort")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        );
      })}
    </ListRows>
  );
}
