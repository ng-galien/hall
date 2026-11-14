import { type ApiUser, updateUserSchema } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useUsersStore } from "../../stores/usersStore";

type Draft = Pick<ApiUser, "displayName" | "email" | "contactId">;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
const empty: Draft = { displayName: "", email: "", contactId: null };
const identity = (user: ApiUser): Draft => ({
  displayName: user.displayName,
  email: user.email,
  contactId: user.contactId,
});
type IdentityField = "displayName" | "email";
/** The fields of a draft the form refuses by itself, before any save request. */
const refusedFields = (draft: Draft): IdentityField[] => {
  const result = updateUserSchema.safeParse(draft);
  if (result.success) return [];
  return (["displayName", "email"] as const).filter((field) =>
    result.error.issues.some((issue) => issue.path[0] === field),
  );
};
const same = (a: Draft, b: Draft) =>
  a.displayName === b.displayName && a.email === b.email && a.contactId === b.contactId;

export function useUserIdentity(user: ApiUser | undefined, canUpdate: boolean) {
  const update = useUsersStore((state) => state.update);
  const clearError = useUsersStore((state) => state.clearError);
  const [draft, setDraft] = useState<Draft>(empty);
  const [baseline, setBaseline] = useState<Draft>(empty);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [invalidFields, setInvalidFields] = useState<IdentityField[]>([]);
  const [emailTaken, setEmailTaken] = useState(false);
  const idRef = useRef<string | null>(null);
  const draftRef = useRef(empty);
  const baselineRef = useRef(empty);
  const revisionRef = useRef(0);
  const canUpdateRef = useRef(canUpdate);
  canUpdateRef.current = canUpdate;
  const pending = useRef<Promise<boolean> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!user || idRef.current === user.id) return;
    const next = identity(user);
    idRef.current = user.id;
    draftRef.current = next;
    baselineRef.current = next;
    revisionRef.current = 0;
    setDraft(next);
    setBaseline(next);
    setRevision(0);
    setInvalidFields([]);
    setEmailTaken(false);
    setSaveState("idle");
  }, [user]);
  const dirty = !same(draft, baseline);
  dirtyRef.current = dirty;
  const runSave = useCallback(async () => {
    const id = idRef.current;
    if (!id || !canUpdateRef.current) return true;
    while (!same(draftRef.current, baselineRef.current)) {
      const candidate = draftRef.current;
      const refused = refusedFields(candidate);
      if (refused.length > 0) {
        setInvalidFields(refused);
        setSaveState("error");
        return false;
      }
      const savedRevision = revisionRef.current;
      setSaveState("saving");
      const result = await update(id, candidate);
      if (!result) {
        setEmailTaken(useUsersStore.getState().error === "user_email_conflict");
        setSaveState("error");
        return false;
      }
      const saved = identity(result);
      baselineRef.current = saved;
      setBaseline(saved);
      if (revisionRef.current === savedRevision) {
        draftRef.current = saved;
        setDraft(saved);
      }
    }
    setSaveState("saved");
    return true;
  }, [update]);
  const flush = useCallback(() => {
    if (pending.current) return pending.current;
    const promise = runSave().finally(() => {
      pending.current = null;
    });
    pending.current = promise;
    return promise;
  }, [runSave]);
  flushRef.current = flush;
  const blocker = useBlocker(dirty || Boolean(pending.current));
  useEffect(() => {
    if (!dirty || !canUpdateRef.current) return;
    setSaveState((current) => (current === "saving" ? current : "dirty"));
    const candidateRevision = revision;
    const timer = window.setTimeout(() => {
      if (revisionRef.current === candidateRevision) void flush();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, revision, flush]);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    void flush().then((saved) => {
      if (active) {
        if (saved) blocker.proceed();
        else blocker.reset();
      }
    });
    return () => {
      active = false;
    };
  }, [blocker, flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || pending.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (dirtyRef.current) void flushRef.current();
    };
  }, []);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setDraft(next);
    setSaveState(same(next, baselineRef.current) && !pending.current ? "saved" : "dirty");
    if (invalidFields.length > 0) {
      const refused = refusedFields(next);
      setInvalidFields(refused.filter((field) => invalidFields.includes(field)));
    }
    if (key === "email") setEmailTaken(false);
    clearError();
  };
  return { draft, change, flush, saveState, invalidFields, emailTaken };
}
