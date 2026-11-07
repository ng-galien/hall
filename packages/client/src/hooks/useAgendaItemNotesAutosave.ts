import { useCallback, useEffect, useRef, useState } from "react";

export const AGENDA_ITEM_NOTES_AUTOSAVE_DELAY_MS = 2000;

export type AgendaItemNotesSave = (
  itemId: string,
  notes: string,
  options: { clearConfirmed: boolean },
) => Promise<boolean>;

export interface AgendaItemNotesAutosave {
  /** Text shown in the notes editor. */
  readonly text: string;
  /** Records a change typed by the user and schedules its save. */
  edit(text: string): void;
  /** Saves the typed text now when it has not been saved yet; resolves true when nothing remains to save. */
  flush(): Promise<boolean>;
}

/**
 * Discussion notes of the agenda item selected in a conduct view.
 *
 * Only a change typed in this view is sent to the server. While nothing typed
 * remains unsaved, the view shows the server text. Saving stops when another
 * item is selected or the item is no longer in discussion.
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
  /** The item is in discussion; its notes are saved while it is. */
  active: boolean;
  save: AgendaItemNotesSave;
}): AgendaItemNotesAutosave {
  const [text, setText] = useState(serverText);
  const current = useRef({ itemId, text: serverText, revision: 0, savedRevision: 0, clearedByUser: false });
  const timer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const cancelTimer = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const send = useCallback(async (): Promise<boolean> => {
    cancelTimer();
    const state = current.current;
    if (state.itemId === null || state.revision === state.savedRevision) return true;
    const { itemId: target, text: sent, revision, clearedByUser } = state;
    const saved = await saveRef.current(target, sent, { clearConfirmed: sent === "" && clearedByUser });
    if (saved && current.current.itemId === target && current.current.revision === revision) {
      current.current.savedRevision = revision;
    }
    return saved;
  }, [cancelTimer]);

  useEffect(() => {
    if (current.current.itemId === itemId) return;
    cancelTimer();
    current.current = { itemId, text: serverText, revision: 0, savedRevision: 0, clearedByUser: false };
    setText(serverText);
  }, [itemId, serverText, cancelTimer]);

  useEffect(() => {
    const state = current.current;
    if (state.itemId !== itemId || state.revision !== state.savedRevision || state.text === serverText) return;
    current.current.text = serverText;
    current.current.clearedByUser = false;
    setText(serverText);
  }, [itemId, serverText]);

  useEffect(() => {
    if (active) return;
    cancelTimer();
    current.current.savedRevision = current.current.revision;
  }, [active, cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  const edit = useCallback(
    (next: string) => {
      const state = current.current;
      if (!active || state.itemId === null || next === state.text) return;
      state.clearedByUser = next === "" && state.text !== "";
      state.text = next;
      state.revision += 1;
      setText(next);
      cancelTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void send();
      }, AGENDA_ITEM_NOTES_AUTOSAVE_DELAY_MS);
    },
    [active, cancelTimer, send],
  );

  return { text, edit, flush: send };
}
