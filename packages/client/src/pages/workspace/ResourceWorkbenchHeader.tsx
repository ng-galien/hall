import type { ResourceDetail } from "@hall/api-contract";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DownloadIcon,
  FullscreenIcon,
  MailIcon,
  MapIcon,
  PinIcon,
  PinnedIcon,
  ShareIcon,
} from "../../components/icons";
import { TagInput } from "../../components/TagInput";
import type { ItemCommand } from "../../components/ui/item-commands";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { DocumentaryResourceGlyph, documentaryResourceDate } from "../../features/documents/DocumentaryResourceGlyph";
import { usePdfCommands } from "../../features/documents/PdfPreviewButton";
import { usePrepareMail } from "../../features/mail/PrepareMailButton";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { ApiErrorCode } from "../../services/apiClient";
import { type SharedFile, shareOrDownload } from "../../services/fileSharing";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore } from "./workspacePrefs";

/**
 * Title line of an opened resource: « Ouvrir dans Cartes » for a map as the main command, then « Plein écran »,
 * « Épingler », the PDF preview, the mail, the sharing and the download.
 * @implements-requirement HALL-FR-WSP-340
 */
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
  pdfMarkdown,
  primary,
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
  /** The current text of a text document, previewed as a PDF. */
  pdfMarkdown?: string;
  /** The writing command of a text. */
  primary?: ReactNode;
}) {
  const { t } = useI18n();
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "resource", id: resource.id });
  const pdf = usePdfCommands({
    markdown: pdfMarkdown ?? "",
    title: resource.name,
    testId: "resource-pdf-preview",
    disabled: pdfMarkdown === undefined,
  });
  const mail = usePrepareMail({ kind: "resource", resourceId: resource.id });
  const menu: ItemCommand[] = [
    ...(pdfMarkdown !== undefined ? pdf.commands : []),
    ...(resource.kind === "document" && mail.available
      ? [
          {
            id: "mail",
            label: t("mail.prepare"),
            icon: <MailIcon />,
            testId: "resource-prepare-mail",
            disabled: mail.busy,
            onSelect: mail.prepare,
          },
        ]
      : []),
    ...(resource.kind === "document" && shareFile
      ? [
          {
            id: "share",
            label: t("common.share"),
            icon: <ShareIcon />,
            testId: "resource-workbench-share",
            onSelect: () =>
              void shareFile()
                .then(shareOrDownload)
                .catch(() => undefined),
          },
        ]
      : []),
    ...(resource.kind === "document" && onDownload
      ? [
          {
            id: "download",
            label: t("common.download"),
            icon: <DownloadIcon />,
            testId: "resource-workbench-download",
            onSelect: onDownload,
          },
        ]
      : []),
  ];

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
      primary={
        resource.kind === "geographic" ? (
          <Button asChild variant="secondary" className="resource-open-in-maps">
            <Link data-testid="resource-open-in-maps" to={`/maps/${encodeURIComponent(resource.id)}`}>
              <MapIcon />
              {t("maps.openInMaps")}
            </Link>
          </Button>
        ) : (
          primary
        )
      }
      frequent={[
        {
          id: "fullscreen",
          label: t("common.fullscreen"),
          icon: <FullscreenIcon />,
          testId: "resource-open-extended",
          onSelect: onOpenExtended,
        },
        {
          id: "pin",
          label: t(pinned ? "workspace.unpinShort" : "workspace.pin"),
          icon: pinned ? <PinnedIcon /> : <PinIcon />,
          testId: "workspace-workbench-pin",
          pressed: pinned,
          onSelect: () => togglePin({ kind: "resource", id: resource.id }),
        },
      ]}
      menu={menu}
      dialogs={pdf.view}
      actionError={actionError}
      onDismissError={onDismissError}
      metadata={
        <div className="workbench-meta-row">
          <TagInput value={tags} onChange={onTagsChange} readOnly={!canUpdate} label={t("workspace.tags")} />
          <div className="workbench-meta" data-testid="resource-related-businesses">
            <span className="workbench-meta-label">{t("workspace.relatedCouncilBusiness")}</span>
            <div className="workbench-meta-values">
              {relatedBusinesses.length === 0 ? (
                <span className="workbench-meta-empty">{t("workspace.noRelatedCouncilBusiness")}</span>
              ) : (
                relatedBusinesses.map((business) => (
                  <Button
                    key={business.id}
                    variant="plain"
                    className="workbench-related-business"
                    data-testid={`resource-related-business-${business.id}`}
                    onClick={() => onSelect({ kind: "councilBusiness", id: business.id })}
                  >
                    <CouncilBusinessGlyph business={business} />
                    {business.title}
                  </Button>
                ))
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
