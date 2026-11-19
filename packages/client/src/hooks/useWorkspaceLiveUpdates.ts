import type { LiveEvent, WorkspaceContentChange } from "@hall/api-contract";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
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

type SavedResource = WorkspaceContentChange["resource"];

/**
 * Rereads what saved contents touched: the loaded folder that lists each resource, the businesses and prepared subjects
 * that show it, and the shown screens when an appointment changed. The catalog and the other businesses stay as read.
 */
export async function rereadSavedContents(resources: readonly SavedResource[], selectedBusinessId: string | null) {
  const workspace = useWorkspaceResourcesStore.getState();
  const folders = [...new Set(resources.map((resource) => resource.path))].filter((path) =>
    workspace.loadedPaths.includes(path),
  );
  await Promise.all([
    ...folders.map((path) => workspace.loadFolder(path, { force: true })),
    useCouncilBusinessStore.getState().rereadSavedContents(
      resources.map((resource) => resource.id),
      selectedBusinessId,
    ),
  ]);
  if (resources.some((resource) => resource.kind === "event")) {
    await Promise.all([...screenRereads].map((reread) => reread()));
  }
}

/**
 * Keeps the workspace current when another session or the MCP changes a resource or a business. Events are grouped:
 * a group of saved contents rereads only what they touched; any other change, and each reconnection after the first
 * connection, rereads the whole workspace.
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
    let saved = new Map<string, SavedResource>();
    const run = () => {
      if (running) {
        requested = true;
        return;
      }
      const rereadWhole = whole;
      const resources = [...saved.values()];
      whole = false;
      saved = new Map();
      running = (
        rereadWhole
          ? rereadWorkspace(selectedBusinessId.current)
          : rereadSavedContents(resources, selectedBusinessId.current)
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
      if (event.type === "workspace.changed" && event.change)
        saved.set(event.change.resource.id, event.change.resource);
      else whole = true;
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
