import { matchDiscriminated, matchLiteral } from "@hall/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CloseIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { LoadingIndicator } from "../../components/ui/loading-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { emptyEventDocument } from "../../features/calendar/eventDates";
import {
  BusinessBundleExportDialog,
  BusinessBundleImportDialog,
} from "../../features/council-business/BusinessBundleDialogs";
import { BusinessDeleteDialog } from "../../features/council-business/BusinessDeleteDialog";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { photoFile } from "../../features/documents/photoFile";
import { ResourceAutosaveToggle } from "../../features/resources/ResourceAutosaveToggle";
import { ResourceChangesControl } from "../../features/resources/ResourceChangesControl";
import { useResourceSession } from "../../features/resources/useResourceSession";
import { createEmptySpreadsheetDocument } from "../../features/spreadsheet/univerWorkbook";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { type DocumentDuplicate, findDocumentDuplicates } from "../../services/documentDuplicates";
import { HeaderTrail, ScreenActions } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { folderCapabilitiesAt, useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { CouncilBusinessWorkbench } from "./CouncilBusinessWorkbench";
import {
  droppedFolder,
  type LocalDirectoryHandle,
  type LocalFolderImport,
  pickedFolder,
  selectedFolder,
} from "./localFolderImport";
import { PathContents } from "./PathContents";
import { PinnedRow } from "./PinnedRow";
import { isUnderPath } from "./paths";
import { ResourceWorkbench } from "./ResourceWorkbench";
import { WorkspaceBreadcrumb } from "./WorkspaceBreadcrumb";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import {
  emptySearch,
  isSearchActive,
  PhoneWorkspaceSearch,
  WorkspaceSearch,
  type WorkspaceSearchState,
} from "./WorkspaceSearch";
import { WorkbenchControlsContext } from "./WorkspaceWorkbenchHeader";
import type { WorkspaceCreateKind } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";

export type { WorkspaceSelection } from "./workspaceItemReference";

/** @implements-requirement HALL-FR-WSP-270 */
export function WorkspacePage() {
  const { locale, t } = useI18n();
  const phone = usePhoneLayout();
  const { submitting, run } = useSubmitting();
  const [searchParams, setSearchParams] = useSearchParams();
  const councilBusinessStore = useCouncilBusinessStore();
  const resourcesStore = useWorkspaceResourcesStore();
  const { businesses, error: councilBusinessError } = councilBusinessStore;
  const resources = Object.values(resourcesStore.summaries).filter(
    (resource): resource is DocumentaryLeafSummary => resource.kind !== "folder",
  );
  const resourcesError = resourcesStore.error;
  const [search, setSearch] = useState<WorkspaceSearchState>(emptySearch);
  const creationFolderPathRef = useRef("");
  const creationBusinessRef = useRef<CouncilBusinessView | undefined>(undefined);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const folderTarget = useRef<{ path: string; business?: CouncilBusinessView }>({ path: "" });
  const [duplicates, setDuplicates] = useState<DocumentDuplicate[]>([]);
  const [duplicateCheckError, setDuplicateCheckError] = useState(false);
  const checkDuplicates = async (files: readonly File[], append = false) => {
    if (!append) {
      setDuplicates([]);
      setDuplicateCheckError(false);
    }
    try {
      const found = await findDocumentDuplicates(files);
      setDuplicates((previous) => (append ? [...previous, ...found] : found));
    } catch {
      setDuplicateCheckError(true);
    }
  };
  const [deleteBusiness, setDeleteBusiness] = useState<CouncilBusinessView | null>(null);
  const [exportBundleId, setExportBundleId] = useState<string | null>(null);
  const [importBundleOpen, setImportBundleOpen] = useState(false);
  const [folderError, setFolderError] = useState<ApiErrorCode | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const galleryInput = useRef<HTMLInputElement | null>(null);

  const path = searchParams.get("path") ?? "";
  const folderCapabilities = folderCapabilitiesAt(resourcesStore, path);
  const selection: WorkspaceSelection = searchParams.get("councilBusiness")
    ? { kind: "councilBusiness", id: searchParams.get("councilBusiness") as string }
    : searchParams.get("resource")
      ? { kind: "resource", id: searchParams.get("resource") as string }
      : null;

  useEffect(() => {
    if (selection?.kind === "councilBusiness") void councilBusinessStore.loadSelected(selection.id);
  }, [selection?.kind, selection?.id, councilBusinessStore.loadSelected]);

  useEffect(() => {
    if (selection?.kind !== "councilBusiness") void resourcesStore.loadCatalog();
  }, [selection?.kind, resourcesStore.loadCatalog]);

  const pathBusinesses = useMemo(
    () => businesses.filter((business) => isUnderPath(business.folderPath, path)),
    [businesses, path],
  );
  const pathResources = useMemo(
    () => resources.filter((resource) => isUnderPath(resource.path, path)),
    [resources, path],
  );

  const selected = selection
    ? matchDiscriminated(selection, "kind", {
        councilBusiness: (entry) => ({
          business: businesses.find((business) => business.id === entry.id) ?? null,
          resource: null,
        }),
        resource: (entry) => ({
          business: null,
          resource: resourcesStore.summaries[entry.id] ?? null,
        }),
      })
    : { business: null, resource: null };
  const currentFolder =
    !selection && path
      ? Object.values(resourcesStore.summaries).find(
          (resource) => resource.kind === "folder" && resource.fullPath === path,
        )
      : undefined;
  const currentFolderId = currentFolder?.id;
  useEffect(() => {
    if (currentFolderId) void resourcesStore.open(currentFolderId);
  }, [currentFolderId, resourcesStore.open]);
  const selectedBusiness = selected.business;
  const resourceSession = useResourceSession({
    resourceId: selection?.kind === "resource" ? selection.id : null,
  });
  const businessReportSession = useResourceSession({
    resourceId: selectedBusiness?.reportResourceId ?? null,
  });
  useEffect(() => {
    const report = businessReportSession.resource;
    if (
      report &&
      selection?.kind === "councilBusiness" &&
      selectedBusiness?.reportResourceId === report.id &&
      report.kind === "text"
    ) {
      councilBusinessStore.adoptReport(selection.id, report);
    }
  }, [
    selection?.kind,
    selection?.id,
    selectedBusiness?.reportResourceId,
    businessReportSession.resource,
    councilBusinessStore.adoptReport,
  ]);
  const presentedResource = resourceSession.resource;
  const openedSession =
    selection?.kind === "resource"
      ? resourceSession
      : selection?.kind === "councilBusiness"
        ? businessReportSession
        : null;

  const [searchResultsTarget, setSearchResultsTarget] = useState<HTMLElement | null>(null);
  const openedControls = selection ? (
    <>
      {openedSession?.resource && openedSession.canConfigureAutosave ? (
        <ResourceAutosaveToggle
          enabled={openedSession.autosaveEnabled}
          status={openedSession.saveStatus}
          disabled={openedSession.submitting}
          onChange={openedSession.updateAutosave}
        />
      ) : null}
      {openedSession?.resource ? (
        <ResourceChangesControl
          resourceId={openedSession.resource.id}
          representation={openedSession.representation}
          onInvalidated={() => {
            if (!openedSession.dirty && !openedSession.submitting) void openedSession.reload();
          }}
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="plain"
            size="icon"
            data-testid="workspace-breadcrumb-close"
            aria-label={t("common.close")}
            onClick={() => select(null)}
          >
            <CloseIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("common.close")}</TooltipContent>
      </Tooltip>
    </>
  ) : null;

  const select = (next: WorkspaceSelection, nextPath?: string) => {
    const params = new URLSearchParams();
    const targetPath = nextPath ?? path;
    if (targetPath) params.set("path", targetPath);
    if (next) {
      matchDiscriminated(next, "kind", {
        councilBusiness: (entry) => params.set("councilBusiness", entry.id),
        resource: (entry) => params.set("resource", entry.id),
      });
    }
    void (async () => {
      if (
        openedSession?.resource &&
        useWorkspaceResourcesStore.getState().details[openedSession.resource.id] &&
        !(await openedSession.flush())
      ) {
        return;
      }
      setSearchParams(params, { replace: !phone || (next === null && selection !== null) });
    })();
  };

  const createInFolder = async (
    kind: WorkspaceCreateKind,
    folderPath: string,
    title?: string,
    business?: CouncilBusinessView,
  ): Promise<WorkspaceSelection> => {
    creationFolderPathRef.current = folderPath;
    creationBusinessRef.current = business;
    const source = business ? councilBusinessStore.representationsById[business.id] : undefined;
    const scope = business ? { councilBusinessId: business.id } : {};
    const normalizedTitle = title?.trim();
    const resourceSelection = (created: { id: string } | null) =>
      created ? ({ kind: "resource", id: created.id } as const) : null;
    return matchLiteral(kind, {
      file: () => {
        fileInput.current?.click();
        return Promise.resolve(null);
      },
      takePhoto: () => {
        cameraInput.current?.click();
        return Promise.resolve(null);
      },
      choosePhoto: () => {
        galleryInput.current?.click();
        return Promise.resolve(null);
      },
      councilMatter: async () => {
        if (!normalizedTitle) return null;
        const business = await councilBusinessStore.create({
          path: folderPath,
          name: normalizedTitle,
          reportName: t("meeting.report"),
          reportContent: "",
        });
        return business ? ({ kind: "councilBusiness", id: business.id } as const) : null;
      },
      text: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create(
            { kind: "text", name: normalizedTitle, path: folderPath, content: "", ...scope },
            source,
          ),
        );
      },
      remote: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create(
            {
              kind: "remote",
              name: normalizedTitle,
              path: folderPath,
              target: { kind: "unconfigured" },
              ...scope,
            },
            source,
          ),
        );
      },
      spreadsheet: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create(
            {
              kind: "spreadsheet",
              name: normalizedTitle,
              path: folderPath,
              document: createEmptySpreadsheetDocument(normalizedTitle, locale),
              ...scope,
            },
            source,
          ),
        );
      },
      event: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create(
            { kind: "event", name: normalizedTitle, path: folderPath, document: emptyEventDocument(), ...scope },
            source,
          ),
        );
      },
      geographic: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create(
            { kind: "geographic", name: normalizedTitle, path: folderPath, ...scope },
            source,
          ),
        );
      },
      legalReference: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create(
            { kind: "legalReference", name: normalizedTitle, path: folderPath, ...scope },
            source,
          ),
        );
      },
    });
  };

  const importFile = (file: File, { numberTakenName = false }: { numberTakenName?: boolean } = {}) => {
    const business = creationBusinessRef.current;
    const source = business ? councilBusinessStore.representationsById[business.id] : undefined;
    const form = new FormData();
    if (business) form.set("councilBusinessId", business.id);
    form.set("path", creationFolderPathRef.current);
    form.set("name", file.name.replace(/\.(?:csv|xlsx)$/i, ""));
    form.set("file", file);
    void run(async () => {
      await checkDuplicates([file]);
      if (/\.(?:csv|xlsx)$/i.test(file.name)) {
        const spreadsheet = await resourcesStore.importSpreadsheet(form, source);
        if (spreadsheet && business) await councilBusinessStore.loadResources(business.id);
        if (spreadsheet) select({ kind: "resource", id: spreadsheet.id }, spreadsheet.path);
        return spreadsheet;
      }
      form.set("name", file.name);
      if (numberTakenName) form.set("onNameConflict", "suffix");
      const uploaded = await resourcesStore.uploadDocument(form, source);
      if (uploaded) {
        if (business) await councilBusinessStore.loadResources(business.id);
        select({ kind: "resource", id: uploaded.id }, uploaded.path);
      }
      return uploaded;
    });
  };

  const importFolder = (folderPath: string, business?: CouncilBusinessView, transfer?: DataTransfer) => {
    if (submitting) return;
    const folder = business ? resourcesStore.summaries[business.folderResourceId] : undefined;
    const targetPath = folder?.kind === "folder" ? folder.fullPath : folderPath;
    folderTarget.current = { path: targetPath, business };
    if (transfer) {
      const read = droppedFolder(transfer);
      void executeFolderImport(read, targetPath, business);
    } else {
      const picker = (window as Window & { showDirectoryPicker?: () => Promise<LocalDirectoryHandle> })
        .showDirectoryPicker;
      if (picker) void executeFolderImport(picker.call(window).then(pickedFolder), targetPath, business);
      else folderInput.current?.click();
    }
  };
  const executeFolderImport = (read: Promise<LocalFolderImport>, targetPath: string, business?: CouncilBusinessView) =>
    run(async () => {
      setFolderError(null);
      try {
        const imported = await read;
        setDuplicates([]);
        setDuplicateCheckError(false);
        const join = (relative: string) => [targetPath, relative].filter(Boolean).join("/");
        for (const directory of imported.directories.sort((a, b) => a.split("/").length - b.split("/").length)) {
          const parts = directory.split("/");
          const name = parts.pop() ?? "";
          if (!(await resourcesStore.create({ kind: "folder", path: join(parts.join("/")), name }))) {
            setFolderError(useWorkspaceResourcesStore.getState().error);
            return;
          }
        }
        const source = business ? councilBusinessStore.representationsById[business.id] : undefined;
        for (const entry of imported.files) {
          await checkDuplicates([entry.file], true);
          const form = new FormData();
          form.set("path", join(entry.relativePath.split("/").slice(0, -1).join("/")));
          form.set("file", entry.file);
          if (business) form.set("councilBusinessId", business.id);
          const spreadsheet = /\.(?:csv|xlsx)$/i.test(entry.file.name);
          form.set("name", spreadsheet ? entry.file.name.replace(/\.(?:csv|xlsx)$/i, "") : entry.file.name);
          const created = spreadsheet
            ? await resourcesStore.importSpreadsheet(form, source)
            : await resourcesStore.uploadDocument(form, source);
          if (!created) {
            setFolderError(useWorkspaceResourcesStore.getState().error);
            return;
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFolderError(apiErrorCode(error));
      } finally {
        await resourcesStore.loadCatalog();
        if (business) await councilBusinessStore.loadResources(business.id);
      }
    });

  const searchActive = isSearchActive(search);
  const createMenu = !selectedBusiness ? (
    <WorkspaceCreateMenu
      compact={phone}
      getError={() => useWorkspaceResourcesStore.getState().error ?? useCouncilBusinessStore.getState().error}
      clearError={() => {
        useWorkspaceResourcesStore.setState({ error: null });
        useCouncilBusinessStore.setState({ error: null });
      }}
      canCreate={(kind) =>
        matchLiteral(kind, {
          councilMatter: () => folderCapabilities.createCouncilBusiness,
          text: () => folderCapabilities.create,
          spreadsheet: () => folderCapabilities.create,
          remote: () => folderCapabilities.create,
          geographic: () => folderCapabilities.create,
          event: () => folderCapabilities.create,
          legalReference: () => folderCapabilities.create && folderCapabilities.searchLegalReferences,
          file: () => folderCapabilities.uploadDocument || folderCapabilities.importSpreadsheet,
          takePhoto: () => folderCapabilities.uploadDocument,
          choosePhoto: () => folderCapabilities.uploadDocument,
        })
      }
      onCreate={async (kind, title) => {
        const created = await createInFolder(kind, path, title);
        if (created) select(created, path);
        return Boolean(created);
      }}
    />
  ) : null;

  return (
    <div className="page workspace-page">
      <div className="workspace">
        {deleteBusiness ? (
          <BusinessDeleteDialog
            businessId={deleteBusiness.id}
            name={deleteBusiness.title}
            onClose={() => setDeleteBusiness(null)}
            onDeleted={async () => {
              await Promise.all([resourcesStore.loadCatalog(), councilBusinessStore.load()]);
              select(null, deleteBusiness.folderPath);
            }}
          />
        ) : null}
        {exportBundleId ? (
          <BusinessBundleExportDialog businessId={exportBundleId} onClose={() => setExportBundleId(null)} />
        ) : null}
        {importBundleOpen ? (
          <BusinessBundleImportDialog
            onClose={() => setImportBundleOpen(false)}
            onImported={async (id) => {
              await Promise.all([resourcesStore.loadCatalog(), councilBusinessStore.load()]);
              const imported = useCouncilBusinessStore.getState().businesses.find((business) => business.id === id);
              if (imported) select({ kind: "councilBusiness", id }, imported.folderPath);
            }}
          />
        ) : null}
        <RequestErrorBanner
          error={folderError ?? councilBusinessError ?? resourcesError}
          onDismiss={() => {
            setFolderError(null);
            useCouncilBusinessStore.setState({ error: null });
            useWorkspaceResourcesStore.setState({ error: null });
          }}
        />
        {duplicates.length ? (
          <section role="status" data-testid="workspace-import-duplicates" aria-label={t("workspace.identicalFiles")}>
            <ListRows>
              {duplicates.map((duplicate) => (
                <ListRow
                  key={duplicate.id}
                  title={t("workspace.identicalFile", { name: duplicate.fileName })}
                  detail={duplicate.existing.map((resource) => (
                    <Button
                      key={resource.id}
                      variant="plain"
                      data-testid={`workspace-import-existing-${resource.id}`}
                      onClick={() => select({ kind: "resource", id: resource.id }, resource.path)}
                    >
                      {resource.path}/{resource.name}
                    </Button>
                  ))}
                />
              ))}
            </ListRows>
          </section>
        ) : null}
        {duplicateCheckError ? (
          <p role="status" data-testid="workspace-import-duplicate-check-failed">
            {t("workspace.duplicateCheckFailed")}
          </p>
        ) : null}
        {submitting ? (
          <LoadingIndicator data-testid="workspace-import-progress">{t("common.saving")}</LoadingIndicator>
        ) : null}
        <HeaderTrail>
          <WorkspaceBreadcrumb
            path={selectedBusiness?.folderPath ?? presentedResource?.path ?? path}
            currentLabel={selectedBusiness?.title ?? presentedResource?.name}
            currentIcon={
              selectedBusiness ? (
                <CouncilBusinessGlyph business={selectedBusiness} />
              ) : presentedResource ? (
                <DocumentaryResourceGlyph resource={presentedResource} />
              ) : undefined
            }
            currentSelection={selection}
            originPath={selectedBusiness || selection?.kind === "resource" ? path : undefined}
            onSelect={select}
            showSaveStatus={false}
          />
        </HeaderTrail>
        <div className="workspace-topzone" data-item-open={selection ? "true" : undefined}>
          {phone ? null : (
            <div className="workspace-bar-row">
              <div className="workspace-bar-search">
                <WorkspaceSearch
                  search={search}
                  onSearch={setSearch}
                  onSelect={select}
                  context={path}
                  resultsTarget={searchResultsTarget}
                />
              </div>
              {resourcesStore.personalWorkspacePath ? (
                <Button
                  className="workspace-personal-open"
                  variant="secondary"
                  data-testid="workspace-personal-open"
                  onClick={() => select(null, resourcesStore.personalWorkspacePath ?? "")}
                >
                  {t("workspace.personalWorkspace")}
                </Button>
              ) : null}
              {createMenu}
            </div>
          )}
          {phone && !selection ? (
            <ScreenActions>
              <PhoneWorkspaceSearch onSelect={select} context={path} />
              {createMenu}
            </ScreenActions>
          ) : null}
          {folderCapabilities.uploadDocument || folderCapabilities.importSpreadsheet ? (
            <input
              ref={fileInput}
              type="file"
              disabled={submitting}
              className="visually-hidden-input"
              data-testid="workspace-file-input"
              aria-label={t("documents.file")}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) importFile(file);
                event.currentTarget.value = "";
              }}
            />
          ) : null}
          {[
            { ref: cameraInput, testId: "workspace-camera-input", capture: true },
            { ref: galleryInput, testId: "workspace-photo-input", capture: false },
          ].map((photo) => (
            <input
              key={photo.testId}
              ref={photo.ref}
              type="file"
              accept="image/jpeg,image/png"
              capture={photo.capture ? "environment" : undefined}
              disabled={submitting}
              className="visually-hidden-input"
              data-testid={photo.testId}
              aria-label={t(photo.capture ? "workspace.takePhoto" : "workspace.choosePhoto")}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file)
                  importFile(
                    photoFile(file, (date) => t("workspace.photoName", { date })),
                    { numberTakenName: true },
                  );
                event.currentTarget.value = "";
              }}
            />
          ))}
          <input
            ref={folderInput}
            type="file"
            {...{ webkitdirectory: "" }}
            multiple
            disabled={submitting}
            className="visually-hidden-input"
            data-testid="workspace-folder-input"
            aria-label={t("workspace.importFolder")}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              const target = folderTarget.current;
              if (files.length)
                void executeFolderImport(Promise.resolve(selectedFolder(files)), target.path, target.business);
              event.currentTarget.value = "";
            }}
          />
          {!searchActive ? <PinnedRow selection={selection} onSelect={select} /> : null}
        </div>

        {searchActive ? (
          <section
            ref={setSearchResultsTarget}
            className="workspace-contents workspace-search-results"
            aria-label={t("common.search")}
          />
        ) : (
          <section className="workspace-contents" aria-label={t("workspace.contents")}>
            <div className="workspace-container-body">
              <PathContents
                path={path}
                businesses={pathBusinesses}
                resources={pathResources}
                selection={selection}
                onSelect={select}
                onImportFolder={importFolder}
                onDeleteBusiness={setDeleteBusiness}
                onImportBundle={() => setImportBundleOpen(true)}
                onExportBundle={(business) => setExportBundleId(business.id)}
                onCreate={createInFolder}
                onPreview={(resource) => select({ kind: "resource", id: resource.id })}
                hidden={Boolean(selection)}
                toolbarControls={
                  currentFolder ? (
                    <ResourceChangesControl
                      resourceId={currentFolder.id}
                      representation={resourcesStore.representations[currentFolder.id] ?? null}
                      onInvalidated={() => {
                        void resourcesStore.open(currentFolder.id);
                      }}
                    />
                  ) : null
                }
              />
              {selection ? (
                <WorkbenchControlsContext.Provider value={openedControls}>
                  <section className="workspace-bench workspace-bench-full" aria-label={t("workspace.bench")}>
                    {selectedBusiness ? (
                      <CouncilBusinessWorkbench
                        key={selectedBusiness.id}
                        business={selectedBusiness}
                        reportSession={businessReportSession}
                        onCreate={(kind, title) =>
                          createInFolder(kind, selectedBusiness.folderPath, title, selectedBusiness)
                        }
                      />
                    ) : selection?.kind === "resource" ? (
                      <ResourceWorkbench key={selection.id} session={resourceSession} onSelect={select} />
                    ) : councilBusinessError ? (
                      <Button onClick={() => void councilBusinessStore.loadSelected(selection.id)}>
                        {t("common.retry")}
                      </Button>
                    ) : (
                      <LoadingIndicator data-testid="business-selection-loading">
                        {t("common.loading")}
                      </LoadingIndicator>
                    )}
                  </section>
                </WorkbenchControlsContext.Provider>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
