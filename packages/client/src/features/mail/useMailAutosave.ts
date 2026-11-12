import type { MailMessage } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { type SirenApiResult, submitSirenAction } from "../../services/apiClient";

/** State of the automatic saving of a draft, written in the screen header. */
export type MailSaveStatus = "saved" | "dirty" | "saving" | "error";

const autosaveDelay = 800;

function recipientsKey(message: MailMessage) {
  return JSON.stringify(
    message.recipients.map((recipient) => [recipient.kind, recipient.name, recipient.address, recipient.contactId]),
  );
}

function differs(draft: MailMessage, stored: MailMessage) {
  return (
    draft.subject !== stored.subject ||
    draft.bodyMarkdown !== stored.bodyMarkdown ||
    recipientsKey(draft) !== recipientsKey(stored)
  );
}

/**
 * The automatic saving of a draft, as for the documents: every change is saved shortly after, against the revision
 * read, and a pending change is saved when the draft is left, within Hall or by closing the page. A stale revision is
 * reported and nothing is lost on screen.
 * @implements-requirement HALL-FR-EML-100
 */
export function useMailAutosave(initial: SirenApiResult<MailMessage>, onSaved: () => void) {
  const [stored, setStored] = useState(initial);
  const [draft, setDraftState] = useState(initial.data);
  const [status, setStatus] = useState<MailSaveStatus>("saved");
  const [error, setError] = useState<unknown>(null);
  const storedRef = useRef(stored);
  const draftRef = useRef(draft);
  const pending = useRef<Promise<SirenApiResult<MailMessage> | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const adopt = useCallback((result: SirenApiResult<MailMessage>) => {
    storedRef.current = result;
    setStored(result);
    const local = draftRef.current;
    const next = {
      ...result.data,
      subject: local.subject,
      bodyMarkdown: local.bodyMarkdown,
      recipients: local.recipients,
    };
    draftRef.current = next;
    setDraftState(next);
    setStatus(differs(next, result.data) ? "dirty" : "saved");
  }, []);

  const save = useCallback(async (): Promise<SirenApiResult<MailMessage> | null> => {
    if (pending.current) await pending.current;
    const current = storedRef.current;
    const snapshot = draftRef.current;
    if (!current.representation) return null;
    if (!differs(snapshot, current.data)) return current;
    setStatus("saving");
    const request = submitSirenAction<MailMessage>(current.representation, "mail.update", {
      subject: snapshot.subject,
      bodyMarkdown: snapshot.bodyMarkdown,
      recipients: snapshot.recipients,
      expectedRevision: current.data.revision,
    })
      .then((result) => {
        setError(null);
        adopt(result);
        onSavedRef.current();
        return result;
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
        return null;
      });
    pending.current = request;
    const result = await request;
    pending.current = null;
    return result;
  }, [adopt]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return save();
  }, [save]);

  const setDraft = useCallback(
    (next: MailMessage) => {
      draftRef.current = next;
      setDraftState(next);
      if (!differs(next, storedRef.current.data)) return;
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void save();
      }, autosaveDelay);
    },
    [save],
  );

  useEffect(() => {
    const saveOnLeave = () => {
      const current = storedRef.current;
      const snapshot = draftRef.current;
      if (!current.representation || !differs(snapshot, current.data)) return;
      void submitSirenAction<MailMessage>(
        current.representation,
        "mail.update",
        {
          subject: snapshot.subject,
          bodyMarkdown: snapshot.bodyMarkdown,
          recipients: snapshot.recipients,
          expectedRevision: current.data.revision,
        },
        { keepalive: true },
      ).catch(() => null);
    };
    window.addEventListener("pagehide", saveOnLeave);
    return () => {
      window.removeEventListener("pagehide", saveOnLeave);
      if (timer.current) clearTimeout(timer.current);
      if (differs(draftRef.current, storedRef.current.data)) void save();
    };
  }, [save]);

  return { stored, draft, setDraft, status, error, flush, adopt };
}
