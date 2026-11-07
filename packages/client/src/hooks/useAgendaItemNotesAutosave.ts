import { useCallback, useEffect, useRef, useState } from "react";

export const AGENDA_ITEM_NOTES_AUTOSAVE_DELAY_MS = 2000;
export const AGENDA_ITEM_NOTES_AUTOSAVE_MAX_WAIT_MS = 10_000;

export type AgendaItemNotesSave = (
  itemId: string,
  notes: string,
  options: { clearConfirmed: boolean; keepalive: boolean },
) => Promise<boolean>;

export interface AgendaItemNotesAutosave {
  /** Text shown in the notes editor. */
  readonly text: string;
  /** Records a change typed by the user and schedules its save. */
  edit(text: string): void;
  /** Saves the typed text now when it has not been saved yet; resolves true when nothing remains to save. */
  flush(): Promise<boolean>;
}

interface NotesState {
  itemId: string | null;
  /** Text shown in this view. */
  text: string;
  /** Last text known to be recorded on the server, as adopted or saved by this view. */
  recorded: string;
  revision: number;
  savedRevision: number;
  /** Instant of the first unsaved change since the last save. */
  pendingSince: number | null;
}

function initialState(itemId: string | null, serverText: string): NotesState {
  return { itemId, text: serverText, recorded: serverText, revision: 0, savedRevision: 0, pendingSince: null };
}

/**
 * Discussion notes of the agenda item selected in a conduct view.
 *
 * Only a change typed in this view is sent to the server: two seconds after the
 * last keystroke, at least every ten seconds while typing continues, and once
 * more when the item leaves discussion, another item is selected or the view
 * closes. While nothing typed remains unsaved, the view shows the server text.
 * A later state for the same item is not marked saved by an earlier send.
 *
 * @implements-requirement HALL-FR-MTG-380
 */
export function useAgendaItemNotesAutosave({
  itemId,
  serverText,
  active,
  save,
}: {
  itemId: string | null;
  serverText: string;
  /** The item is in discussion; typing is accepted and saved while it is. */
  active: boolean;
  save: AgendaItemNotesSave;
}): AgendaItemNotesAutosave {
  const [text, setText] = useState(serverText);
  const current = useRef<NotesState>(initialState(itemId, serverText));
  const timer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const cancelTimer = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const sendState = useCallback(async (state: NotesState, keepalive = false): Promise<boolean> => {
    if (state.itemId === null || state.revision === state.savedRevision) return true;
    const { itemId: target, text: sent, revision, recorded } = state;
    state.pendingSince = null;
    if (sent === recorded) {
      state.savedRevision = revision;
      return true;
    }
    const saved = await saveRef.current(target, sent, {
      clearConfirmed: sent.trim() === "" && recorded.trim() !== "",
      keepalive,
    });
    if (saved && state.revision === revision) {
      state.savedRevision = revision;
      state.recorded = sent;
    }
    return saved;
  }, []);

  const send = useCallback((): Promise<boolean> => {
    cancelTimer();
    return sendState(current.current);
  }, [cancelTimer, sendState]);

  useEffect(() => {
    if (current.current.itemId === itemId) return;
    cancelTimer();
    void sendState(current.current);
    current.current = initialState(itemId, serverText);
    setText(serverText);
  }, [itemId, serverText, cancelTimer, sendState]);

  useEffect(() => {
    const state = current.current;
    if (state.itemId !== itemId || state.revision !== state.savedRevision) return;
    state.recorded = serverText;
    if (state.text === serverText) return;
    state.text = serverText;
    setText(serverText);
  }, [itemId, serverText]);

  useEffect(() => {
    if (!active) void send();
  }, [active, send]);

  useEffect(() => {
    const sendBeforeLeaving = () => {
      cancelTimer();
      void sendState(current.current, true);
    };
    window.addEventListener("pagehide", sendBeforeLeaving);
    return () => {
      window.removeEventListener("pagehide", sendBeforeLeaving);
      sendBeforeLeaving();
    };
  }, [cancelTimer, sendState]);

  const edit = useCallback(
    (next: string) => {
      const state = current.current;
      if (!active || state.itemId === null || next === state.text) return;
      state.text = next;
      state.revision += 1;
      state.pendingSince ??= Date.now();
      setText(next);
      cancelTimer();
      const untilMaximum = state.pendingSince + AGENDA_ITEM_NOTES_AUTOSAVE_MAX_WAIT_MS - Date.now();
      timer.current = window.setTimeout(
        () => {
          timer.current = null;
          void sendState(state);
        },
        Math.max(0, Math.min(AGENDA_ITEM_NOTES_AUTOSAVE_DELAY_MS, untilMaximum)),
      );
    },
    [active, cancelTimer, sendState],
  );

  return { text, edit, flush: send };
}
