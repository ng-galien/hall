import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { FolderIcon, PinIcon, PinnedIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { RequestErrorBanner } from "../../components/Ui";
import { ExplorerTree } from "../../components/ui/explorer-tree";
import { CouncilBusinessCommittees } from "../../features/council-business/CouncilBusinessCommittees";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { PdfPreviewButton } from "../../features/documents/PdfPreviewButton";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { useEditorDocumentUpload } from "../../features/documents/useEditorDocumentUpload";
import { useWorkspaceResourceImageUpload } from "../../features/documents/useWorkspaceResourceImageUpload";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import { ReferenceBusinessContext, useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { ApiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useWorkspaceCouncilActivityStore } from "../../stores/workspaceCouncilActivityStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { AttachmentPicker } from "./AttachmentPicker";
import { BusinessDocumentTree } from "./BusinessDocumentTree";
import { CouncilBusinessSubjects } from "./CouncilBusinessSubjects";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import type { WorkspaceCreateKind } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore } from "./workspacePrefs";
import "./CouncilBusinessWorkbench.css";

// @implements-requirement HALL-FR-WSP-370
export function CouncilBusinessWorkbench({
  business,
  reportSession,
  onCreate,
}: {
  business: CouncilBusinessView;
  reportSession: ResourceSession;
  onCreate(kind: WorkspaceCreateKind, title?: string): Promise<WorkspaceSelection>;
}) {
  const mentionables = useReferenceMentionables(business.id);
  const { canUpload: canUploadImage, uploadImage } = useWorkspaceResourceImageUpload();
  const uploadDocument = useEditorDocumentUpload(business.folderPath, business.id);
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const preparedSubjects = useCouncilBusinessStore((state) => state.preparedSubjects);
  const subjectResourceIds = new Set(
    preparedSubjects
      .filter((subject) => subject.councilBusinessId === business.id)
      .map((subject) => subject.textResourceId),
  );
  const attachedResources = business.resources.filter((resource) => !subjectResourceIds.has(resource.id));
  const folderRepresentation = useWorkspaceResourcesStore(
    (state) => state.representations[business.folderResourceId] ?? null,
  );
  const folderCapabilities = resourceCapabilities(folderRepresentation);
  const loadCouncilActivity = useWorkspaceCouncilActivityStore((state) => state.load);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const [documentsState, setDocumentsState] = useState({ businessId: business.id, open: false });
  const documentsOpen = documentsState.businessId === business.id && documentsState.open;
  const setDocumentsOpen = (open: boolean) => setDocumentsState({ businessId: business.id, open });
  useEffect(() => {
    setDocumentsState((current) =>
      current.businessId === business.id ? current : { businessId: business.id, open: false },
    );
  }, [business.id]);
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "councilBusiness", id: business.id });
  const editable = reportSession.editable;

  const documentsLoaded = useCouncilBusinessStore((state) => Boolean(state.resourceItemsLoadedById?.[business.id]));
  const documentsError = useCouncilBusinessStore((state) => state.resourceItemsErrorById?.[business.id] ?? null);

  useEffect(() => {
    const store = useCouncilBusinessStore.getState();
    void Promise.all([store.loadPreparedSubjects(business.id), useCouncilDecisionsStore.getState().load()]);
  }, [business.id]);

  const renameBusiness = async (nextTitle: string) => {
    const renamed = await run(async () => {
      setActionError(null);
      const folder = await useWorkspaceResourcesStore.getState().relocate(business.folderResourceId, {
        path: business.folderPath,
        name: nextTitle,
      });
      if (!folder) {
        setActionError(useWorkspaceResourcesStore.getState().error);
        return false;
      }
      return Boolean(await useCouncilBusinessStore.getState().refresh(business.id));
    });
    return Boolean(renamed);
  };

  const saveReport = async () => {
    const saved = await reportSession.save();
    if (saved) await useCouncilBusinessStore.getState().refresh(business.id);
    return saved;
  };

  const createDocument = async (kind: WorkspaceCreateKind, title?: string) => {
    const selection = await onCreate(kind, title);
    if (!selection) return false;
    await useCouncilBusinessStore.getState().loadResources(business.id);
    if (selection.kind === "resource") setViewedResourceId(selection.id);
    return true;
  };

  return (
    <ReferenceBusinessContext.Provider value={business.id}>
      <div className="workbench workspace-business-workbench" data-testid="council-business-workbench">
        <WorkspaceWorkbenchHeader
          icon={<CouncilBusinessGlyph business={business} large />}
          title={business.title}
          titleLabel={t("meeting.subject")}
          date={
            editable ? { kind: "updated", value: business.updatedAt } : { kind: "created", value: business.createdAt }
          }
          onTitleChange={folderCapabilities.relocate ? renameBusiness : undefined}
          hint={<CouncilBusinessCommittees businessId={business.id} />}
          actions={
            <>
              <PdfPreviewButton
                key={business.id}
                markdown={reportSession.content}
                testId="business-report-pdf-preview"
                disabled={!reportSession.resource}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(pinned ? "workspace.unpinShort" : "workspace.pin")}
                    aria-pressed={pinned}
                    onClick={() => togglePin({ kind: "councilBusiness", id: business.id })}
                  >
                    {pinned ? <PinnedIcon /> : <PinIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t(pinned ? "workspace.unpinShort" : "workspace.pin")}</TooltipContent>
              </Tooltip>
            </>
          }
          actionError={actionError ?? reportSession.actionError}
        />

        <section className="workbench-section" data-testid="business-report" aria-label={t("meeting.report")}>
          <div className="grid gap-1.5">
            {reportSession.resource ? (
              reportSession.editable ? (
                <div data-testid="business-report-editor">
                  <MarkdownEditor
                    title={`${t("meeting.report")} : ${business.title}`}
                    markdown={reportSession.content}
                    onChange={reportSession.setContent}
                    mentionables={mentionables}
                    searchContext={business.folderPath}
                    onUploadImage={
                      canUploadImage
                        ? (file) => uploadImage(file, { kind: "textResourceContent", id: business.reportResourceId })
                        : undefined
                    }
                    onUploadDocument={uploadDocument}
                  />
                </div>
              ) : (
                <div data-testid="business-report-readonly">
                  {reportSession.content ? (
                    <MarkdownView markdown={reportSession.content} />
                  ) : (
                    <p className="workspace-list-empty">{t("meeting.itemReportEmpty")}</p>
                  )}
                </div>
              )
            ) : reportSession.detailsFailed ? (
              <div className="business-report-load-failure" data-testid="business-report-load-error">
                <RequestErrorBanner error={reportSession.actionError ?? "request_failed"} />
                <Button
                  variant="outline"
                  onClick={() => void reportSession.reload()}
                  data-testid="business-report-retry"
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <div className="business-report-loading" role="status" data-testid="business-report-loading">
                <p>{t("common.loading")}</p>
                <div className="business-report-loading-placeholder" aria-hidden="true">
                  <span className="business-report-loading-toolbar" />
                  <span className="business-report-loading-line" />
                  <span className="business-report-loading-line business-report-loading-line-short" />
                  <span className="business-report-loading-line" />
                </div>
              </div>
            )}
          </div>
          {reportSession.editable && (!reportSession.autosaveEnabled || reportSession.actionError) ? (
            <div className="workbench-actions">
              <span className="composer-editor-spacer" />
              <Button
                data-testid="business-report-save"
                variant="default"
                disabled={submitting || reportSession.submitting || !reportSession.dirty || !reportSession.editable}
                onClick={() => void run(saveReport)}
              >
                {t(submitting || reportSession.submitting ? "common.saving" : "common.save")}
              </Button>
            </div>
          ) : null}
        </section>
        <CouncilBusinessSubjects businessId={business.id} />
        <CollapsibleSection
          className="business-content-section"
          testId="business-category-documents"
          title={t("workspace.documentCategory")}
          icon={<FolderIcon />}
          count={documentsLoaded ? attachedResources.length : undefined}
          open={documentsOpen}
          onOpenChange={setDocumentsOpen}
          actions={
            <AttachmentPicker
              business={business}
              disabled={submitting}
              onCreate={createDocument}
              onAttached={() => void loadCouncilActivity()}
              onError={setActionError}
            />
          }
        >
          {!documentsOpen ? null : documentsError ? (
            <div data-testid="business-documents-load-error">
              <RequestErrorBanner error={documentsError} />
              <Button
                data-testid="business-documents-retry"
                onClick={() => void useCouncilBusinessStore.getState().loadResources(business.id)}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : !documentsLoaded ? (
            <p className="workspace-list-empty" role="status">
              {t("common.loading")}
            </p>
          ) : attachedResources.length ? (
            <ExplorerTree className="business-document-tree" data-testid="business-resource-tree">
              <BusinessDocumentTree
                resources={attachedResources}
                basePath={business.folderPath}
                onOpen={setViewedResourceId}
                onRenamed={async () => {
                  await useCouncilBusinessStore.getState().loadResources(business.id);
                }}
              />
            </ExplorerTree>
          ) : (
            <p className="workspace-list-empty" data-testid="business-documents-empty">
              {t("workspace.businessDocumentsEmpty")}
            </p>
          )}
        </CollapsibleSection>

        {viewedResourceId ? (
          <ResourcePreview
            resourceId={viewedResourceId}
            onClose={() => {
              setViewedResourceId(null);
              void useCouncilBusinessStore.getState().loadPreparedSubjects(business.id);
            }}
          />
        ) : null}
      </div>
    </ReferenceBusinessContext.Provider>
  );
}
