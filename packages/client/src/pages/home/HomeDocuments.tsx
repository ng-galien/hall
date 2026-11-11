import type { ResourceSummary } from "@hall/api-contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRightIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { ListRow, ListRows } from "../../components/ui/list-row";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { photoFile } from "../../features/documents/photoFile";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { personalWorkspaceHref } from "../../shell/PhoneNavigation";
import { folderCapabilitiesAt, useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { isUnderPath } from "../workspace/paths";
import { WorkspaceCreateMenu } from "../workspace/WorkspaceCreateMenu";

const visibleRows = 5;
const documentKinds = ["text", "spreadsheet", "document", "remote"] as const;
const searchPageSize = 100;
/** The search contract has no order by modification date: the latest documents are taken from at most these pages. */
const maximumSearchPages = 5;

/** Loads readable documents through the search collection, in a bounded number of requests; the store keeps them current afterwards. */
export function useReadableDocuments() {
  const hydrate = useWorkspaceResourcesStore((state) => state.hydrate);
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      let offset = 0;
      for (let page = 0; page < maximumSearchPages; page += 1) {
        const result = await hydrate({
          query: "",
          paths: [],
          kinds: [...documentKinds],
          tags: [],
          readiness: [],
          media: [],
          limit: searchPageSize,
          offset,
        });
        if (!active) return;
        if (!result) {
          setError(useWorkspaceResourcesStore.getState().error);
          break;
        }
        offset += result.items.length;
        if (result.items.length === 0 || offset >= result.total) break;
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [hydrate]);
  const documents = useMemo(
    () =>
      Object.values(summaries)
        .filter(
          (resource): resource is DocumentaryLeafSummary =>
            resource.kind !== "folder" && documentKinds.some((kind) => kind === resource.kind),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [summaries],
  );
  return { documents, loaded, error };
}

type ReadableDocuments = ReturnType<typeof useReadableDocuments>;

function documentHref(resource: ResourceSummary) {
  return `/workspace?${new URLSearchParams({ path: resource.path, resource: resource.id }).toString()}`;
}

function DocumentRows({ documents, testId }: { documents: DocumentaryLeafSummary[]; testId: string }) {
  const { formatDate } = useI18n();
  return (
    <ListRows>
      {documents.slice(0, visibleRows).map((resource) => (
        <ListRow
          key={resource.id}
          to={documentHref(resource)}
          openTestId={`${testId}-${resource.id}`}
          head={<DocumentaryResourceGlyph resource={resource} />}
          title={resource.name}
          detail={<time dateTime={resource.updatedAt}>{formatDate(resource.updatedAt)}</time>}
        />
      ))}
    </ListRows>
  );
}

/** Latest personal files and notes, with the addition of a photo or a note. */
export function HomePersonalSpace({ documents, loaded }: ReadableDocuments) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const personalPath = useWorkspaceResourcesStore((state) => state.personalWorkspacePath);
  const loadFolder = useWorkspaceResourcesStore((state) => state.loadFolder);
  const createResource = useWorkspaceResourcesStore((state) => state.create);
  const uploadDocument = useWorkspaceResourcesStore((state) => state.uploadDocument);
  const capabilities = useWorkspaceResourcesStore((state) =>
    personalPath ? folderCapabilitiesAt(state, personalPath) : null,
  );
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const gallery = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (personalPath) void loadFolder(personalPath);
  }, [personalPath, loadFolder]);

  if (!personalPath) return null;
  const mine = documents.filter((resource) => isUnderPath(resource.path, personalPath));
  const addPhoto = (file: File) => {
    const form = new FormData();
    const named = photoFile(file, (date) => t("workspace.photoName", { date }));
    form.set("path", personalPath);
    form.set("name", named.name);
    form.set("file", named);
    form.set("onNameConflict", "suffix");
    setError(null);
    void uploadDocument(form).then((created) => {
      if (!created) setError(useWorkspaceResourcesStore.getState().error);
    });
  };

  return (
    <section className="home-block" data-testid="home-personal">
      <header className="home-block-heading">
        <h2>{t("workspace.personalWorkspace")}</h2>
        <WorkspaceCreateMenu
          placement="inline"
          title={t("create.sheetTitle", { place: t("workspace.personalWorkspace") })}
          testId="home-personal-add"
          label={t("home.add")}
          optionLabels={{ text: "home.addNote" }}
          canCreate={(kind) =>
            kind === "text"
              ? Boolean(capabilities?.create)
              : (kind === "takePhoto" || kind === "choosePhoto") && Boolean(capabilities?.uploadDocument)
          }
          onCreate={async (kind, title) => {
            if (kind === "takePhoto") camera.current?.click();
            else if (kind === "choosePhoto") gallery.current?.click();
            else if (kind === "text" && title) {
              const created = await createResource({ kind: "text", name: title, path: personalPath, content: "" });
              if (!created) return false;
              navigate(documentHref(created));
            }
            return true;
          }}
          getError={() => useWorkspaceResourcesStore.getState().error}
          clearError={() => useWorkspaceResourcesStore.setState({ error: null })}
        />
      </header>
      {[
        { ref: camera, testId: "home-personal-camera-input", capture: true },
        { ref: gallery, testId: "home-personal-photo-input", capture: false },
      ].map((photo) => (
        <input
          key={photo.testId}
          ref={photo.ref}
          type="file"
          accept="image/jpeg,image/png"
          capture={photo.capture ? "environment" : undefined}
          className="visually-hidden-input"
          data-testid={photo.testId}
          aria-label={t(photo.capture ? "workspace.takePhoto" : "workspace.choosePhoto")}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) addPhoto(file);
            event.currentTarget.value = "";
          }}
        />
      ))}
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      {mine.length > 0 ? (
        <>
          <DocumentRows documents={mine} testId="home-personal-document" />
          <Link className="home-see-all" data-testid="home-personal-all" to={personalWorkspaceHref(personalPath)}>
            {t("home.seeAll")}
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        </>
      ) : loaded ? (
        <p className="home-block-empty">{t("home.personalEmpty")}</p>
      ) : null}
    </section>
  );
}

/** Latest documents of the council, without the resources the server marks with the personal-workspace class. */
export function HomeRecentDocuments({ documents, loaded, error }: ReadableDocuments) {
  const { t } = useI18n();
  const representations = useWorkspaceResourcesStore((state) => state.representations);
  const shared = documents.filter((resource) => !representations[resource.id]?.class?.includes("personal-workspace"));
  return (
    <section className="home-block" data-testid="home-recent">
      <header className="home-block-heading">
        <h2>{t("home.recentDocuments")}</h2>
      </header>
      <RequestErrorBanner error={error} />
      {shared.length > 0 ? (
        <>
          <DocumentRows documents={shared} testId="home-recent-document" />
          <Link className="home-see-all" data-testid="home-recent-all" to="/workspace">
            {t("home.seeAll")}
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        </>
      ) : loaded && !error ? (
        <p className="home-block-empty">{t("home.recentEmpty")}</p>
      ) : null}
    </section>
  );
}
