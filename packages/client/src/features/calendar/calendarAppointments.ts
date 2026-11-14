import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";

/** Opens every appointment of the loaded catalog; true when each one was read. */
// @implements-requirement HALL-FR-CAL-210
export async function openCatalogAppointments(): Promise<boolean> {
  const store = useWorkspaceResourcesStore.getState();
  const opened = await Promise.all(
    store.catalog.filter((entry) => entry.kind === "event").map((entry) => store.open(entry.id)),
  );
  return opened.every(Boolean);
}
