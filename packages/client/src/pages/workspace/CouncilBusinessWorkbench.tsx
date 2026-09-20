import { matchLiteral } from "@hall/domain";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { FolderIcon, PinIcon, PinnedIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { ExplorerTree } from "../../components/ui/explorer-tree";
import { CouncilBusinessCommittees } from "../../features/council-business/CouncilBusinessCommittees";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import type { DocumentaryLeafSummary } from "../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { useWorkspaceResourceImageUpload } from "../../features/documents/useWorkspaceResourceImageUpload";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import { ReferenceBusinessContext, useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useWorkspaceCouncilActivityStore } from "../../stores/workspaceCouncilActivityStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { BusinessDocumentTree } from "./BusinessDocumentTree";
import { CouncilBusinessSubjects } from "./CouncilBusinessSubjects";
import { ResourcePicker } from "./ResourcePicker";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import { WorkspaceWorkbenchHeader } from "./WorkspaceWorkbenchHeader";
import type { WorkspaceCreateKind } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { useWorkspacePrefsStore } from "./workspacePrefs";
import "./CouncilBusinessWorkbench.css";

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
      useCouncilBusinessStore.getState().loadPreparedSubjects(business.id),
      useCouncilDecisionsStore.getState().load(),
    ]);
  }, [business.id]);

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
          hint={<CouncilBusinessCommittees businessId={business.id} />}
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
        <CouncilBusinessSubjects businessId={business.id} />
        <WorkspaceCreateMenu
          compact
          testId="business-create-documents"
          getError={() => useWorkspaceResourcesStore.getState().error ?? useCouncilBusinessStore.getState().error}
          clearError={() => {
            useWorkspaceResourcesStore.setState({ error: null });
            useCouncilBusinessStore.setState({ error: null });
          }}
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
          render={(trigger) => (
            <section className="business-content-section" data-testid="business-category-documents">
              <header className="business-content-section-header">
                <span className="business-content-section-icon workspace-glyph">
                  <FolderIcon />
                </span>
                <h2>{t("workspace.documentCategory")}</h2>
                <span className="business-content-section-actions">
                  {trigger}
                  {businessCapabilities?.associateResource ? (
                    <ResourcePicker
                      compact
                      open={pickingResource}
                      onOpenChange={setPickingResource}
                      excludedIds={[...associatedIds]}
                      context={business.folderPath}
                      suggestions={suggestions}
                      others={otherCandidates}
                      disabled={submitting}
                      onPick={(resourceId) => void associateResource(resourceId)}
                    />
                  ) : null}
                </span>
              </header>
              {attachedResources.length ? (
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
              ) : null}
            </section>
          )}
        />

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
