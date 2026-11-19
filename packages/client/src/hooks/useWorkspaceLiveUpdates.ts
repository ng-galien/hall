import type { LiveEvent, WorkspaceChange, WorkspaceChangedResource } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { businessFolderPath } from "../pages/workspace/paths";
import { subscribeLiveUpdates } from "../services/liveUpdates";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";

const rereadDelayMs = 200;
const screenRereads = new Set<() => Promise<unknown>>();

/**
 * Registers, while the screen is shown, the reread of what it reads beyond the businesses, the catalog and the loaded
 * folders; it runs after them in each grouped reread.
 */
// @implements-requirement HALL-FR-CAL-210
export function useWorkspaceReread(reread: () => Promise<unknown>): void {
  useEffect(() => {
    screenRereads.add(reread);
    return () => {
      screenRereads.delete(reread);
    };
  }, [reread]);
}

/**
 * Rereads the businesses, the selected business, the resource catalog and every loaded folder, then what the shown
 * screens registered.
 */
export async function rereadWorkspace(selectedBusinessId: string | null): Promise<void> {
  const rereadResources = async () => {
    if (useWorkspaceResourcesStore.getState().collectionRepresentation)
      await useWorkspaceResourcesStore.getState().loadCatalog();
    const resources = useWorkspaceResourcesStore.getState();
    await Promise.all(resources.loadedPaths.map((path) => resources.loadFolder(path, { force: true })));
  };
  await Promise.all([
    useCouncilBusinessStore.getState().reloadAfterExternalChange(selectedBusinessId),
    rereadResources(),
  ]);
  await Promise.all([...screenRereads].map((reread) => reread()));
}

type ChangedResource = WorkspaceChangedResource;

/** What a group of announced writes touched, when every write announced its scope. */
interface TouchedWorkspace {
  saved: Map<string, ChangedResource>;
  resources: Map<string, ChangedResource>;
  removed: Set<string>;
  businesses: Set<string>;
}

function nothingTouched(): TouchedWorkspace {
  return { saved: new Map(), resources: new Map(), removed: new Set(), businesses: new Set() };
}

/** Adds one announced scope to a group; false when the write did not say what it touched. */
function touch(touched: TouchedWorkspace, change: WorkspaceChange | undefined): boolean {
  if (!change) return false;
  matchDiscriminated(change, "kind", {
    content: ({ resource }) => touched.saved.set(resource.id, resource),
    resource: ({ resource, councilBusinessId }) => {
      touched.resources.set(resource.id, resource);
      if (councilBusinessId) touched.businesses.add(councilBusinessId);
    },
    removed: ({ resourceId }) => touched.removed.add(resourceId),
    business: ({ councilBusinessId }) => touched.businesses.add(councilBusinessId),
  });
  return true;
}

/**
 * Rereads what announced writes touched: each created, renamed, moved or described resource, the loaded folders that
 * list each touched resource before and after, the businesses and prepared subjects that show them, the touched
 * businesses, and the shown screens when an appointment changed. A moved or deleted folder rereads the whole workspace.
 */
export async function rereadTouched(touched: TouchedWorkspace, selectedBusinessId: string | null): Promise<void> {
  const workspace = useWorkspaceResourcesStore.getState();
  const known = (id: string) =>
    workspace.catalog.find((entry) => entry.id === id) ?? workspace.summaries[id] ?? workspace.details[id];
  const previous = [...touched.resources.keys(), ...touched.removed].flatMap((id) => {
    const entry = known(id);
    return entry ? [entry] : [];
  });
  if (previous.some((entry) => entry.kind === "folder" && touched.removed.has(entry.id))) {
    await rereadWorkspace(selectedBusinessId);
    return;
  }
  const opened = await Promise.all([...touched.resources.keys()].map((id) => workspace.open(id)));
  const folderMoved = opened.some((result) => {
    const before = result && previous.find((entry) => entry.id === result.data.id);
    return result?.data.kind === "folder" && before && before.fullPath !== result.data.fullPath;
  });
  if (folderMoved) {
    await rereadWorkspace(selectedBusinessId);
    return;
  }
  if (touched.removed.size) workspace.invalidate({ ids: [...touched.removed] });
  const changed = [...touched.saved.values(), ...touched.resources.values()];
  const paths = new Set([...changed.map((resource) => resource.path), ...previous.map((entry) => entry.path)]);
  const businesses = useCouncilBusinessStore.getState();
  for (const business of businesses.businesses) {
    if (touched.businesses.has(business.id)) paths.add(businessFolderPath(business));
  }
  const loaded = useWorkspaceResourcesStore.getState().loadedPaths;
  await Promise.all([
    ...[...paths].filter((path) => loaded.includes(path)).map((path) => workspace.loadFolder(path, { force: true })),
    businesses.rereadSavedContents(
      [...changed.map((resource) => resource.id), ...touched.removed],
      touched.businesses.has(selectedBusinessId ?? "") ? null : selectedBusinessId,
    ),
    businesses.rereadBusinesses([...touched.businesses], selectedBusinessId),
  ]);
  if ([...changed, ...previous].some((resource) => resource.kind === "event")) {
    await Promise.all([...screenRereads].map((reread) => reread()));
  }
}

/**
 * Keeps the workspace current when another session or the MCP changes a resource or a business. Events are grouped:
 * a group of writes that each said what it touched rereads only that; a write that did not say it, and each
 * reconnection after the first connection, rereads the whole workspace.
 */
// @implements-requirement HALL-TR-LIV-010
export function useWorkspaceLiveUpdates(): void {
  const location = useLocation();
  const selectedBusinessId = useRef<string | null>(null);
  selectedBusinessId.current = new URLSearchParams(location.search).get("councilBusiness");

  useEffect(() => {
    let connected = false;
    let timer: number | undefined;
    let running: Promise<void> | null = null;
    let requested = false;
    let whole = false;
    let touched = nothingTouched();
    const run = () => {
      if (running) {
        requested = true;
        return;
      }
      const rereadWhole = whole;
      const group = touched;
      whole = false;
      touched = nothingTouched();
      running = (
        rereadWhole ? rereadWorkspace(selectedBusinessId.current) : rereadTouched(group, selectedBusinessId.current)
      ).finally(() => {
        running = null;
        if (requested) {
          requested = false;
          schedule();
        }
      });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, rereadDelayMs);
    };
    const receive = (event: LiveEvent) => {
      if (event.type !== "workspace.changed" || !touch(touched, event.change)) whole = true;
      schedule();
    };
    const unsubscribe = subscribeLiveUpdates({ kind: "workspace" }, receive, () => {
      if (connected) {
        whole = true;
        schedule();
      }
      connected = true;
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
