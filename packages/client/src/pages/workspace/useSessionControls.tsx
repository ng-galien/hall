import { findSirenLink } from "@hall/api-contract";
import { type ReactNode, useRef } from "react";
import { AutosaveOffIcon, AutosaveOnIcon, RedoIcon } from "../../components/icons";
import type { ItemCommand } from "../../components/ui/item-commands";
import { ResourceChangesControl } from "../../features/resources/ResourceChangesControl";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import { useI18n } from "../../i18n/I18nProvider";
import type { WorkbenchControls } from "./WorkspaceWorkbenchHeader";

/**
 * The controls an opened item owes to its session, the same on the workspace screen and in a document dialog:
 * « Voir les modifications » and the switch of the automatic saving in the « … » menu, the save state under the title.
 */
export function useSessionControls(session: ResourceSession | null, close?: ReactNode): WorkbenchControls {
  const { t } = useI18n();
  const openChanges = useRef<(() => void) | null>(null);
  const resource = session?.resource ?? null;
  const menu: ItemCommand[] = [];
  if (session && resource && session.representation && findSirenLink(session.representation, "changes"))
    menu.push({
      id: "changes",
      label: t("resourceChanges.open"),
      icon: <RedoIcon />,
      testId: "resource-changes-trigger",
      onSelect: () => openChanges.current?.(),
    });
  if (session && resource && session.canConfigureAutosave)
    menu.push({
      id: "autosave",
      label: t(session.autosaveEnabled ? "workspace.autosaveTurnOff" : "workspace.autosaveTurnOn"),
      icon: session.autosaveEnabled ? <AutosaveOffIcon /> : <AutosaveOnIcon />,
      testId: "resource-autosave-toggle",
      pressed: session.autosaveEnabled,
      disabled: session.submitting,
      onSelect: () => session.updateAutosave(!session.autosaveEnabled),
    });
  return {
    menu,
    close,
    save: session && resource ? { status: session.saveStatus, enabled: session.autosaveEnabled } : undefined,
    dialogs:
      session && resource ? (
        <ResourceChangesControl
          resourceId={resource.id}
          representation={session.representation}
          openRef={openChanges}
          onInvalidated={() => {
            if (!session.dirty && !session.submitting) void session.reload();
          }}
        />
      ) : null,
  };
}
