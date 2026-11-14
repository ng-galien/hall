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

/**
 * Keeps the workspace current when another session or the MCP changes a resource or a business: each change event,
 * and each reconnection after the first connection, triggers one grouped reread.
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
    const run = () => {
      if (running) {
        requested = true;
        return;
      }
      running = rereadWorkspace(selectedBusinessId.current).finally(() => {
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
    const unsubscribe = subscribeLiveUpdates({ kind: "workspace" }, schedule, () => {
      if (connected) schedule();
      connected = true;
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
