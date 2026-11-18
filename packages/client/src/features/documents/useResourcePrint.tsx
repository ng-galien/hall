import type { ResourcePrint } from "@hall/domain";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { create } from "zustand";
import { PrintIcon } from "../../components/icons";
import type { ItemCommand } from "../../components/ui/item-commands";
import { LoadingIndicator } from "../../components/ui/loading-indicator";
import { useI18n } from "../../i18n/I18nProvider";
import { printResourcePdf } from "../../services/templatesApi";
import { usePdfViewer } from "./PdfPreviewButton";

/** What a spreadsheet or a map displays at the moment of printing, read from the view that shows it. */
type DisplayedState = Omit<ResourcePrint, "resourceId" | "map"> & {
  map?: Omit<NonNullable<ResourcePrint["map"]>, "elementList">;
};

const useDisplayedStates = create<{
  readers: Record<string, () => DisplayedState>;
  register(resourceId: string, read: (() => DisplayedState) | null): void;
}>((set) => ({
  readers: {},
  register: (resourceId, read) =>
    set((state) => {
      const readers = { ...state.readers };
      if (read) readers[resourceId] = read;
      else delete readers[resourceId];
      return { readers };
    }),
}));

/** Lets the print read what the view of a resource displays: its sheet, or the framing and options of its map. A
 * view that is not the document itself, such as a map embedded in a text, passes null. */
export function useDisplayedResourceState(resourceId: string | null, read: () => DisplayedState) {
  const register = useDisplayedStates((state) => state.register);
  useEffect(() => {
    if (!resourceId) return;
    register(resourceId, read);
    return () => register(resourceId, null);
  }, [read, register, resourceId]);
}

// @implements-requirement HALL-FR-DOC-600
/** « Imprimer » of a spreadsheet or a map: saves what is pending, then opens its PDF in the viewer. A map offers its
 * print with or without the list of its elements. */
export function useResourcePrintCommands({
  resource,
  flush,
  testId,
}: {
  resource: { id: string; name: string; kind: string };
  flush(): Promise<boolean>;
  testId: string;
}): { commands: ItemCommand[]; view: ReactNode } {
  const { t } = useI18n();
  const { status, open, view } = usePdfViewer({ title: resource.name, testId });
  const printable = resource.kind === "spreadsheet" || resource.kind === "geographic";
  const print = (elementList: boolean) =>
    void open(async () => {
      if (!(await flush())) return null;
      const displayed = useDisplayedStates.getState().readers[resource.id]?.() ?? {};
      if (resource.kind === "geographic" && !displayed.map) throw new Error("map_not_displayed");
      return printResourcePdf({
        resourceId: resource.id,
        ...(displayed.sheetId ? { sheetId: displayed.sheetId } : {}),
        ...(displayed.map ? { map: { ...displayed.map, elementList } } : {}),
      });
    });
  if (!printable) return { commands: [], view: null };
  const label = t("documents.print");
  const icon = status === "loading" ? <LoadingIndicator label={t("documents.printLoading")} /> : <PrintIcon />;
  const unavailable = status === "loading";
  const commands: ItemCommand[] =
    resource.kind === "geographic"
      ? [
          {
            id: "print-map",
            label: `${label} · ${t("documents.printMapOnly")}`,
            icon,
            testId: `${testId}-map-only`,
            group: testId,
            disabled: unavailable,
            onSelect: () => print(false),
          },
          {
            id: "print-map-elements",
            label: `${label} · ${t("documents.printMapWithElements")}`,
            icon,
            testId: `${testId}-with-elements`,
            group: testId,
            disabled: unavailable,
            onSelect: () => print(true),
          },
        ]
      : [{ id: "print", label, icon, testId, disabled: unavailable, onSelect: () => print(false) }];
  return { commands, view };
}
