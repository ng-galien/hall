import { useState } from "react";
import { RequestErrorBanner } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { apiErrorCode, type ApiErrorCode } from "../../services/apiClient";
import { useResourceRename } from "../../features/resources/useResourceRename";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { useI18n } from "../../i18n/I18nProvider";
import type { ReactNode } from "react";
import { ExplorerTreeBranch } from "../../components/ui/explorer-tree";
import { FolderIcon } from "../../components/icons";
import {
  DocumentaryResourceGlyph,
  type DocumentaryLeafSummary,
} from "../../features/documents/DocumentaryResourceGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";

/** Lexical relative filing path; resources outside the base retain their parent segments. */
export function relativeDocumentPath(base: string, path: string): string {
  const from = base.split("/").filter(Boolean);
  const to = path.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
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
            title={name}
            testId={`business-document-folder-${encodeURIComponent(prefix + name)}`}
            defaultOpen
            icon={
              <span className="workspace-glyph">
                <FolderIcon />
              </span>
            }
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
  const remove = () => void run(async () => {
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
        contextMenu={
          <>
            <ContextMenuItem data-testid={`business-document-open-${resource.id}`} onSelect={() => onOpen(resource.id)}>
              {t("workspace.openDocument")}
            </ContextMenuItem>
            {rename.menuItem}
            {canDelete ? (
              <ContextMenuItem data-testid={`business-document-delete-${resource.id}`} disabled={submitting} onSelect={remove}>
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
    </>
  );
}
