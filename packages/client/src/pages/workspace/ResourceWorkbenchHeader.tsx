import type { Resource, ResourceDetails } from "@hall/domain";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FullscreenIcon, PinIcon, PinnedIcon } from "../../components/icons";
import { TagInput } from "../../components/TagInput";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { ResourceGlyph, resourceDate } from "../../features/documents/ResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { useResourcesStore } from "../../stores/resourcesStore";
import type { WorkspaceSelection } from "./WorkspacePage";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import { useWorkspacePrefsStore } from "./workspacePrefs";

export function ResourceWorkbenchHeader({
  resource,
  details,
  canUpdate,
  actionError,
  title,
  onTitleChange,
  tags,
  onTagsChange,
  onSelect,
  onOpenExtended,
  extendedViewTriggerRef,
}: {
  resource: Resource;
  details: ResourceDetails | null;
  canUpdate: boolean;
  actionError: ApiErrorCode | null;
  title: string;
  onTitleChange(title: string): Promise<boolean>;
  tags: string[];
  onTagsChange(tags: string[]): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  onOpenExtended(): void;
  extendedViewTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const resourcesStore = useResourcesStore();
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "resource", id: resource.id });

  return (
    <WorkspaceWorkbenchHeader
      icon={<ResourceGlyph resource={resource} large />}
      title={title}
      titleLabel={t("resources.textTitle")}
      date={resourceDate(resource)}
      onTitleChange={canUpdate && !details?.snapshotted ? onTitleChange : undefined}
      actions={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={extendedViewTriggerRef}
                variant="ghost"
                size="icon"
                data-testid="resource-open-extended"
                aria-label={t("common.fullscreen")}
                onClick={onOpenExtended}
              >
                <FullscreenIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.fullscreen")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(pinned ? "workspace.unpinShort" : "workspace.pin")}
                aria-pressed={pinned}
                onClick={() => togglePin({ kind: "resource", id: resource.id })}
              >
                {pinned ? <PinnedIcon /> : <PinIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t(pinned ? "workspace.unpinShort" : "workspace.pin")}</TooltipContent>
          </Tooltip>
          {resource.kind === "document" ? (
            <Button variant="outline" onClick={() => void resourcesStore.download(resource)}>
              {t("common.download")}
            </Button>
          ) : null}
        </>
      }
      actionError={actionError}
      metadata={
        <div className="workbench-meta-row">
          <div className="workbench-meta">
            <span className="workbench-meta-label">{t("workspace.tags")}</span>
            <TagInput value={tags} onChange={onTagsChange} readOnly={!canUpdate} label={t("workspace.tags")} />
          </div>
          <div className="workbench-meta">
            <span className="workbench-meta-label">{t("workspace.relatedCouncilBusiness")}</span>
            {!details || details.councilBusiness.length === 0 ? (
              <span className="workbench-meta-empty">{t("workspace.noRelatedCouncilBusiness")}</span>
            ) : (
              details.councilBusiness.map((business) => (
                <button
                  key={business.id}
                  className="workbench-business-chip"
                  type="button"
                  onClick={() => onSelect({ kind: "councilBusiness", id: business.id })}
                >
                  <CouncilBusinessGlyph business={business} />
                  {business.title}
                </button>
              ))
            )}
          </div>
        </div>
      }
    />
  );
}
