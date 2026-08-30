import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
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

export type WorkspaceSelection = { kind: "councilBusiness"; id: string } | { kind: "resource"; id: string } | null;

export type WorkspaceCreateKind = "councilMatter" | "text" | "remote" | "geographic" | "legalReference" | "document";

export function WorkspacePage() {
  const { t } = useI18n();
  const { run } = useSubmitting();
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
    if (next?.kind === "councilBusiness") params.set("councilBusiness", next.id);
    if (next?.kind === "resource") params.set("resource", next.id);
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

  const selectedBusiness =
    selection?.kind === "councilBusiness"
      ? (businesses.find((business) => business.id === selection.id) ?? null)
      : null;
  const selectedResource =
    selection?.kind === "resource" ? (resources.find((resource) => resource.id === selection.id) ?? null) : null;

  const createInFolder = async (
    kind: WorkspaceCreateKind,
    folderPath: string,
    title?: string,
  ): Promise<WorkspaceSelection> => {
    creationFolderPathRef.current = folderPath;
    if (kind === "document") {
      fileInput.current?.click();
      return null;
    }
    const normalizedTitle = title?.trim();
    if (!normalizedTitle) return null;
    if (kind === "councilMatter") {
      const business = await councilBusinessStore.create({
        kind: "matter",
        title: normalizedTitle,
        report: "",
        folderPath,
        resourceIds: [],
      });
      return business ? { kind: "councilBusiness", id: business.id } : null;
    }
    if (kind === "remote") {
      const created = await resourcesStore.createRemote({ title: normalizedTitle, url: null, folderPath, tags: [] });
      return created ? { kind: "resource", id: created.id } : null;
    }
    if (kind === "geographic") {
      const created = await resourcesStore.createGeographic({
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
      });
      return created ? { kind: "resource", id: created.id } : null;
    }
    if (kind === "legalReference") {
      const created = await resourcesStore.createLegalReference({
        title: normalizedTitle,
        folderPath,
        tags: [],
        provider: "legifrance",
        referenceKind: "article",
      });
      return created ? { kind: "resource", id: created.id } : null;
    }
    const created = await resourcesStore.createText({
      title: normalizedTitle,
      folderPath,
      tags: [],
      content: "",
    });
    return created ? { kind: "resource", id: created.id } : null;
  };

  const uploadDocument = (file: File) => {
    const form = new FormData();
    form.set("folderPath", creationFolderPathRef.current);
    form.set("category", "supporting");
    form.set("file", file);
    void run(async () => {
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
          {canUpload ? (
            <input
              ref={fileInput}
              type="file"
              className="visually-hidden-input"
              aria-label={t("documents.file")}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) uploadDocument(file);
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
                path={selectedBusiness?.folderPath ?? selectedResource?.folderPath ?? path}
                currentLabel={selectedBusiness?.title ?? selectedResource?.title}
                originPath={selectedBusiness || selectedResource ? path : undefined}
                onClose={selectedBusiness || selectedResource ? () => select(null) : undefined}
                onSelect={select}
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
                    <CouncilBusinessWorkbench key={selectedBusiness.id} business={selectedBusiness} onSelect={select} />
                  ) : selectedResource ? (
                    <ResourceWorkbench key={selectedResource.id} resource={selectedResource} onSelect={select} />
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
