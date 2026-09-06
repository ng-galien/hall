import { matchLiteral } from "@hall/domain";
import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";

/** Save state of the open workbench; `idle` hides the breadcrumb indicator. */
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function priority(status: SaveStatus): number {
  return matchLiteral(status, { idle: () => 0, saved: () => 1, dirty: () => 2, saving: () => 3, error: () => 4 });
}

function aggregate(sessions: ReadonlyMap<symbol, SaveStatus>): SaveStatus {
  return [...sessions.values()].reduce<SaveStatus>(
    (current, next) => (priority(next) > priority(current) ? next : current),
    "idle",
  );
}

export const useSaveStatusStore = create<{
  status: SaveStatus;
  sessions: ReadonlyMap<symbol, SaveStatus>;
  registerSession(session: symbol): void;
  updateSession(session: symbol, status: SaveStatus): void;
  removeSession(session: symbol): void;
}>((set) => ({
  status: "idle",
  sessions: new Map(),
  registerSession: (session) =>
    set((state) => {
      if (state.sessions.has(session)) return state;
      const sessions = new Map(state.sessions).set(session, "idle" as const);
      return { sessions, status: aggregate(sessions) };
    }),
  updateSession: (session, status) =>
    set((state) => {
      if (!state.sessions.has(session) || state.sessions.get(session) === status) return state;
      const sessions = new Map(state.sessions).set(session, status);
      return { sessions, status: aggregate(sessions) };
    }),
  removeSession: (session) =>
    set((state) => {
      if (!state.sessions.has(session)) return state;
      const sessions = new Map(state.sessions);
      sessions.delete(session);
      return { sessions, status: aggregate(sessions) };
    }),
}));

/** Each mounted persistence owner contributes independently to the visible workbench. */
export function useResourceSaveStatus(resourceId: string | null) {
  const session = useMemo(() => Symbol(resourceId ?? "unopened"), [resourceId]);
  const status = useSaveStatusStore((state) => state.sessions.get(session) ?? "idle");
  const setStatus = useCallback(
    (next: SaveStatus) => {
      useSaveStatusStore.getState().updateSession(session, next);
    },
    [session],
  );

  useEffect(() => {
    if (!resourceId) return;
    useSaveStatusStore.getState().registerSession(session);
    return () => useSaveStatusStore.getState().removeSession(session);
  }, [resourceId, session]);

  return { status, setStatus };
}
