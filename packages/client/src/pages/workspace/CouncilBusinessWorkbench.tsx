import { ContextMenuItem } from "../../components/ui/context-menu";
import { BusinessDocumentTree } from "./BusinessDocumentTree";
import { useEffect, useMemo, useState } from "react";
import { ExplorerTree, ExplorerTreeBranch } from "../../components/ui/explorer-tree";
import { matchLiteral } from "@hall/domain";
import type { WorkspaceCreateKind } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import { CouncilBusinessSubjects } from "./CouncilBusinessSubjects";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { FolderIcon, EditIcon, LockIcon, PinIcon, PinnedIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { type DocumentaryLeafSummary } from "../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { useWorkspaceResourceImageUpload } from "../../features/documents/useWorkspaceResourceImageUpload";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useResourceSession } from "../../features/resources/useResourceSession";
import { ReferenceBusinessContext, useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceCouncilActivityStore } from "../../stores/workspaceCouncilActivityStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { ResourcePicker } from "./ResourcePicker";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import { useWorkspacePrefsStore } from "./workspacePrefs";

export function CouncilBusinessWorkbench({
  business,
  onCreate,
}: {
  business: CouncilBusinessView;
  onCreate(kind: WorkspaceCreateKind, title?: string): Promise<WorkspaceSelection>;
}) {
  const mentionables = useReferenceMentionables(business.id);
  const { canUpload: canUploadImage, uploadImage } = useWorkspaceResourceImageUpload();
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
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
  const reportSession = useResourceSession({ resourceId: business.reportResourceId });
  const businessCapabilities = useCouncilBusinessStore((state) => state.capabilitiesById[business.id]);
  const loadCouncilActivity = useWorkspaceCouncilActivityStore((state) => state.load);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [pickingResource, setPickingResource] = useState(false);
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const { isPinned, togglePin } = useWorkspacePrefsStore();
  const pinned = isPinned({ kind: "councilBusiness", id: business.id });
  const editable = reportSession.editable;

  useEffect(() => {
    void Promise.all([
      useCouncilBusinessStore.getState().loadResources(business.id),
      useCouncilBusinessStore.getState().loadPreparedSubjects(),
      useCouncilDecisionsStore.getState().load(),
    ]);
  }, [business.id, loadCouncilActivity]);

  const act = (action: () => Promise<boolean>) =>
    run(async () => {
      setActionError(null);
      try {
        const completed = await action();
        if (!completed) {
          setActionError(useCouncilBusinessStore.getState().error);
          return false;
        }
        await loadCouncilActivity();
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        return false;
      }
    });

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

  const associateResource = (resourceId: string) =>
    act(() => useCouncilBusinessStore.getState().associateResource(business.id, resourceId));

  const associatedIds = useMemo(
    () => new Set([business.folderResourceId, business.reportResourceId, ...business.resources.map(({ id }) => id)]),
    [business.folderResourceId, business.reportResourceId, business.resources],
  );
  const candidateResources = useMemo(
    () =>
      Object.values(summaries).filter(
        (resource): resource is DocumentaryLeafSummary => resource.kind !== "folder" && !associatedIds.has(resource.id),
      ),
    [associatedIds, summaries],
  );
  const suggestions = candidateResources.filter((resource) => resource.path === business.folderPath);
  const otherCandidates = candidateResources.filter((resource) => resource.path !== business.folderPath);

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
        hint={
          reportSession.resource ? (
            <span
              data-testid="business-edit-hint"
              className={`workbench-edit-hint${editable ? "" : " workbench-edit-hint-locked"}`}
            >
              {editable ? <EditIcon aria-hidden="true" /> : <LockIcon aria-hidden="true" />}
              {t(editable ? "workspace.editableHint" : "workspace.lockedHint")}
            </span>
          ) : undefined
        }
        actions={
          <>
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
        <div className="business-section-heading">
          <h2>{t("workspace.businessReport")}</h2>
          <p>{t("workspace.businessReportDescription")}</p>
        </div>
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
          ) : (
            <p>{t("common.loading")}</p>
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
      <ExplorerTree className="business-unified-tree" data-testid="business-resource-tree">
        <CouncilBusinessSubjects businessId={business.id} />
        <WorkspaceCreateMenu
          compact
          testId="business-create-documents"
          canCreate={(kind) =>
            matchLiteral(kind, {
              councilMatter: () => false,
              text: () => Boolean(businessCapabilities?.createResource),
              spreadsheet: () => Boolean(businessCapabilities?.createResource),
              remote: () => Boolean(businessCapabilities?.createResource),
              geographic: () => Boolean(businessCapabilities?.createResource),
              event: () => Boolean(businessCapabilities?.createResource),
              legalReference: () => Boolean(businessCapabilities?.createResource),
              file: () => Boolean(businessCapabilities?.uploadDocument || businessCapabilities?.importSpreadsheet),
            })
          }
          onCreate={async (kind, title) => {
            const selection = await onCreate(kind, title);
            if (!selection) return false;
            await useCouncilBusinessStore.getState().loadResources(business.id);
            if (selection.kind === "resource") setViewedResourceId(selection.id);
            return true;
          }}
          render={(trigger, contextItems) => (
            <ExplorerTreeBranch
              title={t("workspace.documentCategory")}
              testId="business-category-documents"
              defaultOpen
              icon={
                <span className="workspace-glyph">
                  <FolderIcon />
                </span>
              }
              onContextMenuCloseAutoFocus={(event) => {
                if (pickingResource) event.preventDefault();
              }}
              actions={
                <>
                  {trigger}
                  {businessCapabilities?.associateResource ? (
                    <ResourcePicker
                      compact
                      open={pickingResource}
                      onOpenChange={setPickingResource}
                      suggestions={suggestions}
                      others={otherCandidates}
                      disabled={submitting}
                      onPick={(resourceId) => void associateResource(resourceId)}
                    />
                  ) : null}
                </>
              }
              contextMenu={
                contextItems || businessCapabilities?.associateResource ? (
                  <>
                    {contextItems}
                    {businessCapabilities?.associateResource ? (
                      <ContextMenuItem
                        disabled={submitting || !candidateResources.length}
                        data-testid="business-context-attach"
                        onSelect={() => setPickingResource(true)}
                      >
                        {t("workspace.addResource")}
                      </ContextMenuItem>
                    ) : null}
                  </>
                ) : undefined
              }
            >
              <BusinessDocumentTree
                resources={attachedResources}
                basePath={business.folderPath}
                onOpen={setViewedResourceId}
                onRenamed={async () => {
                  await useCouncilBusinessStore.getState().loadResources(business.id);
                }}
              />
            </ExplorerTreeBranch>
          )}
        />
      </ExplorerTree>

      {viewedResourceId ? (
        <ResourcePreview
          resourceId={viewedResourceId}
          onClose={() => {
            setViewedResourceId(null);
            void useCouncilBusinessStore.getState().loadPreparedSubjects();
          }}
        />
      ) : null}
    </div>
    </ReferenceBusinessContext.Provider>
  );
}
