import type { ReactNode } from "react";
import { ResourceAutosaveToggle } from "../../features/resources/ResourceAutosaveToggle";
import { ResourceChangesControl } from "../../features/resources/ResourceChangesControl";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import type { WorkbenchControls } from "./WorkspaceWorkbenchHeader";

/**
 * The controls an opened item owes to its session, the same on the workspace screen and in a document dialog: the
 * switch of the automatic saving and « Voir les modifications », visible on the line of the title, and, for an item the
 * person may modify, the save state under the title.
 */
export function useSessionControls(
  session: ResourceSession | null,
  close?: ReactNode,
  /** A further line of the tooltip of the automatic saving, such as « Modifié le … ». */
  saveDetail?: string,
): WorkbenchControls {
  const resource = session?.resource ?? null;
  return {
    menu: [],
    close,
    save:
      session && resource && session.editable
        ? { status: session.saveStatus, enabled: session.autosaveEnabled }
        : undefined,
    visible:
      session && resource ? (
        <>
          {session.canConfigureAutosave ? (
            <ResourceAutosaveToggle
              enabled={session.autosaveEnabled}
              status={session.saveStatus}
              onChange={session.updateAutosave}
              detail={saveDetail}
            />
          ) : null}
          <ResourceChangesControl
            resourceId={resource.id}
            representation={session.representation}
            onInvalidated={() => {
              if (!session.dirty && !session.submitting) void session.reload();
            }}
          />
        </>
      ) : null,
  };
}
