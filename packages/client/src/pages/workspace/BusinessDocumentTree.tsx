import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FullscreenIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { ExplorerTreeBranch } from "../../components/ui/explorer-tree";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { FolderGlyph } from "../../features/documents/FolderGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { ResourceDeleteDialog } from "../../features/resources/ResourceDeleteDialog";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useResourceRename } from "../../features/resources/useResourceRename";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";

/** Lexical relative filing path; resources outside the base retain their parent segments. */
export function relativeDocumentPath(base: string, path: string): string {
  const from = base.split("/").filter(Boolean);
  const to = path.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
}

/** @implements-requirement HALL-FR-WSP-260 */
function documentFolderLabel(base: string, relativePath: string, rootLabel: string): string {
  const segments = base.split("/").filter(Boolean);
  for (const segment of relativePath.split("/").filter(Boolean)) {
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.at(-1) ?? rootLabel;
}

export function BusinessDocumentTree({
  resources,
  basePath,
  onOpen,
  onRenamed,
}: {
  resources: DocumentaryLeafSummary[];
  basePath: string;
  onOpen(id: string): void;
  onRenamed(): Promise<void>;
}) {
  const { t } = useI18n();
  const entries = resources.map((resource) => ({ resource, path: relativeDocumentPath(basePath, resource.path) }));
  const renderFolder = (path: string): ReactNode => {
    const prefix = path ? `${path}/` : "";
    const folders = [
      ...new Set(
        entries
          .filter((entry) => entry.path.startsWith(prefix) && entry.path !== path)
          .map((entry) => entry.path.slice(prefix.length).split("/")[0]!),
      ),
    ].sort((a, b) => a.localeCompare(b));
    return (
      <>
        {folders.map((name) => (
          <ExplorerTreeBranch
            key={name}
            title={documentFolderLabel(basePath, prefix + name, t("navigation.workspace"))}
            testId={`business-document-folder-${encodeURIComponent(prefix + name)}`}
            defaultOpen
            icon={<FolderGlyph />}
          >
            {renderFolder(prefix + name)}
          </ExplorerTreeBranch>
        ))}
        {entries
          .filter((entry) => entry.path === path)
          .map(({ resource }) => (
            <DocumentBranch key={resource.id} resource={resource} onOpen={onOpen} onRenamed={onRenamed} />
          ))}
      </>
    );
  };
  return <>{renderFolder("")}</>;
}

// @implements-requirement HALL-FR-WSP-370
function DocumentBranch({
  resource,
  onOpen,
  onRenamed,
}: {
  resource: DocumentaryLeafSummary;
  onOpen(id: string): void;
  onRenamed(): Promise<void>;
}) {
  const { t } = useI18n();
  const representation = useWorkspaceResourcesStore((state) => state.representations[resource.id]);
  const canDelete = resourceCapabilities(representation ?? null).deleteResource;
  const { submitting, run } = useSubmitting();
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = () =>
    run(async () => {
      setError(null);
      try {
        if (await useWorkspaceResourcesStore.getState().remove(resource.id)) await onRenamed();
      } catch (failure) {
        setError(apiErrorCode(failure));
      }
    });
  const rename = useResourceRename({
    resourceId: resource.id,
    testId: `business-document-rename-${resource.id}`,
    onRenamed,
  });
  return (
    <>
      <ExplorerTreeBranch
        title={resource.name}
        testId={`business-attached-resource-${resource.id}`}
        icon={<DocumentaryResourceGlyph resource={resource} />}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="business-document-view"
                variant="plain"
                size="icon"
                data-testid={`business-document-view-${resource.id}`}
                aria-label={t("workspace.openDocumentFullscreen")}
                onClick={() => onOpen(resource.id)}
              >
                <FullscreenIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.openDocumentFullscreen")}</TooltipContent>
          </Tooltip>
        }
        contextMenu={
          <>
            <ContextMenuItem data-testid={`business-document-open-${resource.id}`} onSelect={() => onOpen(resource.id)}>
              {t("workspace.openDocument")}
            </ContextMenuItem>
            {rename.menuItem}
            {canDelete ? (
              <ContextMenuItem
                data-testid={`business-document-delete-${resource.id}`}
                disabled={submitting}
                onSelect={() => setConfirmingDelete(true)}
              >
                {t("workspace.deleteResource")}
              </ContextMenuItem>
            ) : null}
          </>
        }
      >
        <li>
          <InlineResourceContent resourceId={resource.id} />
        </li>
      </ExplorerTreeBranch>
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      {rename.dialog}
      {confirmingDelete ? (
        <ResourceDeleteDialog
          name={resource.name}
          onConfirm={async () => {
            await remove();
          }}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </>
  );
}
