import type { ResourceDetail } from "@hall/api-contract";
import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FullscreenIcon, MapIcon, PinIcon, PinnedIcon } from "../../components/icons";
import { ShareButton } from "../../components/ShareButton";
import { TagInput } from "../../components/TagInput";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { DocumentaryResourceGlyph, documentaryResourceDate } from "../../features/documents/DocumentaryResourceGlyph";
import { PdfPreviewButton } from "../../features/documents/PdfPreviewButton";
import { PrepareMailButton } from "../../features/mail/PrepareMailButton";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { ApiErrorCode } from "../../services/apiClient";
import type { SharedFile } from "../../services/fileSharing";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore } from "./workspacePrefs";

/** @implements-requirement HALL-FR-WSP-340 */
export function ResourceWorkbenchHeader({
  resource,
  relatedBusinesses,
  canUpdate,
  actionError,
  onDismissError,
  title,
  onTitleChange,
  tags,
  onTagsChange,
  onSelect,
  onOpenExtended,
  onDownload,
  shareFile,
  extendedViewTriggerRef,
  pdfMarkdown,
}: {
  resource: Exclude<ResourceDetail, { kind: "folder" }>;
  relatedBusinesses: CouncilBusinessView[];
  canUpdate: boolean;
  actionError: ApiErrorCode | null;
  onDismissError?(): void;
  title: string;
  onTitleChange(title: string): Promise<boolean>;
  tags: string[];
  onTagsChange(tags: string[]): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  onOpenExtended(): void;
  onDownload?(): void;
  shareFile?(): Promise<SharedFile>;
  extendedViewTriggerRef: RefObject<HTMLButtonElement | null>;
  /** The current text of a text document, previewed as a PDF. */
  pdfMarkdown?: string;
}) {
  const { t } = useI18n();
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "resource", id: resource.id });

  return (
    <WorkspaceWorkbenchHeader
      icon={<DocumentaryResourceGlyph resource={resource} large />}
      title={title}
      titleLabel={t("resources.textTitle")}
      date={documentaryResourceDate(resource)}
      onTitleChange={canUpdate ? onTitleChange : undefined}
      reference={{
        name: resource.name,
        path: resource.path || undefined,
        page: `/app/workspace?${new URLSearchParams({ path: resource.path, resource: resource.id })}`,
        href: `/api/resources/${resource.slug}`,
      }}
      actions={
        <>
          {resource.kind === "geographic" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="secondary" className="resource-open-in-maps">
                  <Link
                    data-testid="resource-open-in-maps"
                    aria-label={t("maps.openInMaps")}
                    to={`/maps/${encodeURIComponent(resource.id)}`}
                  >
                    <MapIcon />
                    <span className="resource-open-in-maps-label">{t("maps.openInMaps")}</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("maps.openInMaps")}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={extendedViewTriggerRef}
                variant="plain"
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
                variant="plain"
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
          {pdfMarkdown !== undefined ? (
            <PdfPreviewButton
              key={resource.id}
              markdown={pdfMarkdown}
              title={resource.name}
              testId="resource-pdf-preview"
            />
          ) : null}
          {resource.kind === "document" ? (
            <PrepareMailButton input={{ kind: "resource", resourceId: resource.id }} testId="resource-prepare-mail" />
          ) : null}
          {resource.kind === "document" && shareFile ? (
            <ShareButton testId="resource-workbench-share" file={shareFile} />
          ) : null}
          {resource.kind === "document" && onDownload ? (
            <Button variant="secondary" data-testid="resource-workbench-download" onClick={onDownload}>
              {t("common.download")}
            </Button>
          ) : null}
        </>
      }
      actionError={actionError}
      onDismissError={onDismissError}
      metadata={
        <div className="workbench-meta-row">
          <div className="workbench-meta">
            <span className="workbench-meta-label">{t("workspace.tags")}</span>
            <TagInput value={tags} onChange={onTagsChange} readOnly={!canUpdate} label={t("workspace.tags")} />
          </div>
          <div className="workbench-meta" data-testid="resource-related-businesses">
            <span className="workbench-meta-label">{t("workspace.relatedCouncilBusiness")}</span>
            {relatedBusinesses.length === 0 ? (
              <span className="workbench-meta-empty">{t("workspace.noRelatedCouncilBusiness")}</span>
            ) : (
              relatedBusinesses.map((business) => (
                <button
                  key={business.id}
                  className="workbench-business-chip"
                  data-testid={`resource-related-business-${business.id}`}
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
