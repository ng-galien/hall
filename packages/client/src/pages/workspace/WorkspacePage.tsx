import { emptyEventDocument } from "../../features/calendar/eventDates";
import { matchDiscriminated, matchLiteral } from "@hall/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { ResourceAutosaveToggle } from "../../features/resources/ResourceAutosaveToggle";
import { useResourceSession } from "../../features/resources/useResourceSession";
import { createEmptySpreadsheetDocument } from "../../features/spreadsheet/univerWorkbook";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { CouncilBusinessWorkbench } from "./CouncilBusinessWorkbench";
import { PathContents } from "./PathContents";
import { PinnedRow } from "./PinnedRow";
import { isUnderPath } from "./paths";
import { ResourceWorkbench } from "./ResourceWorkbench";
import { WorkspaceBreadcrumb } from "./WorkspaceBreadcrumb";
import { WorkspaceHome } from "./WorkspaceHome";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import { emptySearch, isSearchActive, WorkspaceSearch, type WorkspaceSearchState } from "./WorkspaceSearch";
import type { WorkspaceCreateKind } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";

export type { WorkspaceSelection } from "./workspaceItemReference";

export function WorkspacePage() {
  const { locale, t } = useI18n();
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
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void resourcesStore.loadCatalog();
  }, [resourcesStore.loadCatalog]);

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
    void (async () => {
      if (
        selection?.kind === "resource" &&
        resourceSession.resource &&
        useWorkspaceResourcesStore.getState().details[resourceSession.resource.id] &&
        !(await resourceSession.flush())
      ) {
        return;
      }
      setSearchParams(params, { replace: true });
    })();
  };

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
  const selectedBusiness = selected.business;
  const resourceSession = useResourceSession({
    resourceId: selection?.kind === "resource" ? selection.id : null,
  });
  const presentedResource = resourceSession.resource;

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
          await resourcesStore.create({ kind: "text", name: normalizedTitle, path: folderPath, content: "", ...scope }, source),
        );
      },
      remote: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create({
            kind: "remote",
            name: normalizedTitle,
            path: folderPath,
            target: { kind: "unconfigured" },
            ...scope,
          }, source),
        );
      },
      spreadsheet: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create({
            kind: "spreadsheet",
            name: normalizedTitle,
            path: folderPath,
            document: createEmptySpreadsheetDocument(normalizedTitle, locale),
            ...scope,
          }, source),
        );
      },
      event: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create({ kind: "event", name: normalizedTitle, path: folderPath, document: emptyEventDocument(), ...scope }, source),
        );
      },
      geographic: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create({ kind: "geographic", name: normalizedTitle, path: folderPath, ...scope }, source),
        );
      },
      legalReference: async () => {
        if (!normalizedTitle) return null;
        return resourceSelection(
          await resourcesStore.create({ kind: "legalReference", name: normalizedTitle, path: folderPath, ...scope }, source),
        );
      },
    });
  };

  const importFile = (file: File) => {
    const business = creationBusinessRef.current;
    const source = business ? councilBusinessStore.representationsById[business.id] : undefined;
    const form = new FormData();
    if (business) form.set("councilBusinessId", business.id);
    form.set("path", creationFolderPathRef.current);
    form.set("name", file.name.replace(/\.(?:csv|xlsx)$/i, ""));
    form.set("file", file);
    void run(async () => {
      if (/\.(?:csv|xlsx)$/i.test(file.name)) {
        const spreadsheet = await resourcesStore.importSpreadsheet(form, source);
        if (spreadsheet && business) await councilBusinessStore.loadResources(business.id);
        if (spreadsheet) select({ kind: "resource", id: spreadsheet.id }, spreadsheet.path);
        return spreadsheet;
      }
      form.set("name", file.name);
      const uploaded = await resourcesStore.uploadDocument(form, source);
      if (uploaded) {
        if (business) await councilBusinessStore.loadResources(business.id);
        select({ kind: "resource", id: uploaded.id }, uploaded.path);
      }
      return uploaded;
    });
  };

  const searchActive = isSearchActive(search);
  return (
    <div className="page workspace-page">
      <div className="workspace">
        <RequestErrorBanner error={councilBusinessError ?? resourcesError} />
        <div className="workspace-topzone">
          <div className="workspace-bar-row">
            <div className="workspace-bar-search">
              <WorkspaceSearch search={search} onSearch={setSearch} onSelect={select} context={path} />
            </div>
            {!selectedBusiness ? <WorkspaceCreateMenu
              canCreate={(kind) => matchLiteral(kind, {
                councilMatter: () => councilBusinessStore.canCreate,
                text: () => resourcesStore.collectionCapabilities.create,
                spreadsheet: () => resourcesStore.collectionCapabilities.create,
                remote: () => resourcesStore.collectionCapabilities.create,
                geographic: () => resourcesStore.collectionCapabilities.create,
                event: () => resourcesStore.collectionCapabilities.create,
                legalReference: () => resourcesStore.collectionCapabilities.create && resourcesStore.collectionCapabilities.searchLegalReferences,
                file: () => resourcesStore.collectionCapabilities.uploadDocument || resourcesStore.collectionCapabilities.importSpreadsheet,
              })}
              onCreate={async (kind, title) => {
                const created = await createInFolder(kind, path, title);
                if (created) select(created, path);
                return Boolean(created);
              }}
            /> : null}
          </div>
          {resourcesStore.collectionCapabilities.uploadDocument ||
          resourcesStore.collectionCapabilities.importSpreadsheet ? (
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
                onClose={selectedBusiness || selection?.kind === "resource" ? () => select(null) : undefined}
                onSelect={select}
                showSaveStatus={selection?.kind !== "resource"}
                statusControl={
                  selection?.kind === "resource" && resourceSession.canConfigureAutosave ? (
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
                  hidden={Boolean(selectedBusiness || selection?.kind === "resource")}
                />
              ) : selectedBusiness || selection?.kind === "resource" ? null : (
                <WorkspaceHome onSelect={select} />
              )}
              {selectedBusiness || selection?.kind === "resource" ? (
                <section className="workspace-bench workspace-bench-full" aria-label={t("workspace.bench")}>
                  {selectedBusiness ? (
                    <CouncilBusinessWorkbench key={selectedBusiness.id} business={selectedBusiness}
                      onCreate={(kind, title) => createInFolder(kind, selectedBusiness.folderPath, title, selectedBusiness)} />
                  ) : selection?.kind === "resource" ? (
                    <ResourceWorkbench key={selection.id} session={resourceSession} onSelect={select} />
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
