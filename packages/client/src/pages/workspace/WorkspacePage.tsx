import { matchDiscriminated, matchLiteral } from "@hall/domain";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { ResourceAutosaveToggle } from "../../features/resources/ResourceAutosaveToggle";
import { useResourceSession } from "../../features/resources/useResourceSession";
import { createEmptySpreadsheetDocument } from "../../features/spreadsheet/univerWorkbook";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { CouncilBusinessWorkbench } from "./CouncilBusinessWorkbench";
import { PathContents } from "./PathContents";
import { PinnedRow } from "./PinnedRow";
import { isUnderPath } from "./paths";
import { ResourceWorkbench } from "./ResourceWorkbench";
import { WorkspaceBreadcrumb } from "./WorkspaceBreadcrumb";
import { WorkspaceHome } from "./WorkspaceHome";
import { emptySearch, isSearchActive, WorkspaceSearch, type WorkspaceSearchState } from "./WorkspaceSearch";
import type { WorkspaceCreateKind } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";

export type { WorkspaceSelection } from "./workspaceItemReference";

export function WorkspacePage() {
  const { locale, t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [searchParams, setSearchParams] = useSearchParams();
  const councilBusinessStore = useCouncilBusinessStore();
  const resourcesStore = useResourcesStore();
  const { businesses, error: councilBusinessError } = councilBusinessStore;
  const { resources, error: resourcesError, canUpload } = resourcesStore;
  const { error: decisionsError } = useCouncilDecisionsStore();
  const [search, setSearch] = useState<WorkspaceSearchState>(emptySearch);
  const creationFolderPathRef = useRef("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const path = searchParams.get("path") ?? "";
  const selection: WorkspaceSelection = searchParams.get("councilBusiness")
    ? { kind: "councilBusiness", id: searchParams.get("councilBusiness") as string }
    : searchParams.get("resource")
      ? { kind: "resource", id: searchParams.get("resource") as string }
      : null;

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
    setSearchParams(params, { replace: true });
  };

  const pathBusinesses = useMemo(
    () => businesses.filter((business) => isUnderPath(business.folderPath, path)),
    [businesses, path],
  );
  const pathResources = useMemo(
    () => resources.filter((resource) => isUnderPath(resource.folderPath, path)),
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
          resource: resources.find((resource) => resource.id === entry.id) ?? null,
        }),
      })
    : { business: null, resource: null };
  const selectedBusiness = selected.business;
  const selectedResource = selected.resource;
  const resourceSession = useResourceSession({
    resourceId: selectedResource?.id ?? null,
    initialResource: selectedResource,
  });
  const presentedResource = resourceSession.resource ?? selectedResource;

  const createInFolder = async (
    kind: WorkspaceCreateKind,
    folderPath: string,
    title?: string,
  ): Promise<WorkspaceSelection> => {
    creationFolderPathRef.current = folderPath;
    const normalizedTitle = title?.trim();
    const resourceSelection = (created: { id: string } | null) =>
      created ? ({ kind: "resource", id: created.id } as const) : null;
    return matchLiteral(kind, {
      file: () => {
        fileInput.current?.click();
        return Promise.resolve(null);
      },
      councilMatter: async () => {
        if (!normalizedTitle) return null;
        const business = await councilBusinessStore.create({
          kind: "matter",
          title: normalizedTitle,
          report: "",
          folderPath,
          resourceIds: [],
        });
        return business ? ({ kind: "councilBusiness", id: business.id } as const) : null;
      },
      text: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.createText({ title: normalizedTitle, folderPath, tags: [], content: "" }),
        );
      },
      remote: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.createRemote({ title: normalizedTitle, url: null, folderPath, tags: [] }),
        );
      },
      spreadsheet: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.createSpreadsheet({
            title: normalizedTitle,
            folderPath,
            tags: [],
            document: createEmptySpreadsheetDocument(normalizedTitle, locale),
          }),
        );
      },
      geographic: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.createGeographic({
            title: normalizedTitle,
            folderPath,
            tags: [],
            provider: "ign",
            layers: [
              { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
              { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: false, opacity: 1 },
              { id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS", visible: false, opacity: 0.7 },
            ],
            hallLayer: { type: "FeatureCollection", features: [] },
          }),
        );
      },
      legalReference: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.createLegalReference({
            title: normalizedTitle,
            folderPath,
            tags: [],
            provider: "legifrance",
            referenceKind: "article",
          }),
        );
      },
    });
  };

  const importFile = (file: File) => {
    const form = new FormData();
    form.set("folderPath", creationFolderPathRef.current);
    form.set("file", file);
    void run(async () => {
      if (/\.(?:csv|xlsx)$/i.test(file.name)) {
        const spreadsheet = await resourcesStore.importSpreadsheet(form);
        if (spreadsheet) select({ kind: "resource", id: spreadsheet.id });
        return spreadsheet;
      }
      form.set("category", "supporting");
      const uploaded = await resourcesStore.upload(form);
      if (uploaded) {
        const fresh = useResourcesStore
          .getState()
          .resources.find((resource) => resource.kind === "document" && resource.fileName === file.name);
        if (fresh) select({ kind: "resource", id: fresh.id });
      }
      return uploaded;
    });
  };

  const searchActive = isSearchActive(search);
  return (
    <div className="page workspace-page">
      <div className="workspace">
        <RequestErrorBanner error={councilBusinessError ?? resourcesError ?? decisionsError} />
        <div className="workspace-topzone">
          <div className="workspace-bar-row">
            <div className="workspace-bar-search">
              <WorkspaceSearch search={search} onSearch={setSearch} onSelect={select} context={path} />
            </div>
          </div>
          {canUpload || resourcesStore.canImportSpreadsheet ? (
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
          {!searchActive ? <PinnedRow selection={selection} onSelect={select} /> : null}
        </div>

        {searchActive ? null : (
          <section className="workspace-contents" aria-label={t("workspace.contents")}>
            <header className="workspace-contents-header">
              <WorkspaceBreadcrumb
                path={selectedBusiness?.folderPath ?? presentedResource?.folderPath ?? path}
                currentLabel={selectedBusiness?.title ?? presentedResource?.title}
                originPath={selectedBusiness || selectedResource ? path : undefined}
                onClose={selectedBusiness || selectedResource ? () => select(null) : undefined}
                onSelect={select}
                showSaveStatus={!selectedResource}
                statusControl={
                  selectedResource && resourceSession.canConfigureAutosave ? (
                    <ResourceAutosaveToggle
                      enabled={resourceSession.autosaveEnabled}
                      status={resourceSession.saveStatus}
                      disabled={resourceSession.submitting}
                      onChange={resourceSession.updateAutosave}
                    />
                  ) : null
                }
              />
            </header>
            <div className="workspace-container-body">
              {path ? (
                <PathContents
                  path={path}
                  businesses={pathBusinesses}
                  resources={pathResources}
                  selection={selection}
                  onSelect={select}
                  onCreate={createInFolder}
                  onPreview={(resource) => select({ kind: "resource", id: resource.id })}
                  hidden={Boolean(selectedBusiness || selectedResource)}
                />
              ) : selectedBusiness || selectedResource ? null : (
                <WorkspaceHome onSelect={select} />
              )}
              {selectedBusiness || selectedResource ? (
                <section className="workspace-bench workspace-bench-full" aria-label={t("workspace.bench")}>
                  {selectedBusiness ? (
                    <CouncilBusinessWorkbench key={selectedBusiness.id} business={selectedBusiness} />
                  ) : selectedResource ? (
                    <ResourceWorkbench key={selectedResource.id} session={resourceSession} onSelect={select} />
                  ) : null}
                </section>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
