// biome-ignore-all lint/correctness/useExhaustiveDependencies: Each content edit intentionally restarts the autosave timer.
import { councilDecisionSummarySchema, findSirenAction, findSirenLink } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import {
  freezeCouncilDecisionDocument,
  openCouncilDecisionDocument,
  updateCouncilDecisionDraft,
} from "../../services/councilDecisionsApi";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";

type Opened = Awaited<ReturnType<typeof openCouncilDecisionDocument>>;

export function useCouncilDecisionDraft(id: string) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const current = useRef<Opened | null>(null);
  const latest = useRef("");
  const pending = useRef<Promise<boolean> | null>(null);
  const freezingRef = useRef(false);
  const sequence = useRef(0);
  const accept = useCallback((result: Opened) => {
    const { content: _content, facts: _facts, ...summary } = result.data;
    current.current = result;
    setOpened(result);
    useCouncilDecisionsStore.getState().accept(councilDecisionSummarySchema.parse(summary));
  }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const result = await openCouncilDecisionDocument(id);
      if (request !== sequence.current) return;
      accept(result);
      latest.current = result.data.content;
      setContent(result.data.content);
    } catch (failure) {
      if (request === sequence.current) setError(apiErrorCode(failure));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [id, accept]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  const flush = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    const save = async () => {
      setSaving(true);
      try {
        while (current.current && current.current.data.content !== latest.current) {
          const result = await updateCouncilDecisionDraft(id, {
            expectedVersion: current.current.data.version,
            content: latest.current,
          });
          accept(result);
        }
        setError(null);
        return true;
      } catch (failure) {
        setError(apiErrorCode(failure));
        return false;
      } finally {
        setSaving(false);
      }
    };
    pending.current = save().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [id, accept]);
  const dirty = Boolean(opened && opened.data.content !== content);
  const blocker = useBlocker(dirty || saving || freezing);
  useEffect(() => {
    if (!dirty || error || freezing) return;
    const timer = window.setTimeout(() => void flush(), 1000);
    return () => window.clearTimeout(timer);
  }, [content, dirty, error, freezing, flush]);
  useEffect(() => {
    if (blocker.state !== "blocked" || freezing) return;
    let active = true;
    void flush().then((ok) => {
      if (active) {
        if (ok) blocker.proceed();
        else blocker.reset();
      }
    });
    return () => {
      active = false;
    };
  }, [blocker, freezing, flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        pending.current ||
        freezingRef.current ||
        (current.current && current.current.data.content !== latest.current)
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return {
    decision: opened?.data ?? null,
    content,
    error,
    loading,
    saving,
    freezing,
    dirty,
    documentUrl,
    load,
    flush,
    canEdit: Boolean(opened?.representation && findSirenAction(opened.representation, "decision.update-draft")),
    canFreeze: Boolean(opened?.representation && findSirenAction(opened.representation, "decision.freeze")),
    downloadHref: opened?.representation ? findSirenLink(opened.representation, "content")?.href : undefined,
    canView: Boolean(
      opened?.representation &&
        (findSirenLink(opened.representation, "content") || findSirenLink(opened.representation, "preview")),
    ),
    edit(value: string) {
      latest.current = value;
      setContent(value);
    },
    closeDocument() {
      setDocumentUrl(null);
    },
    async view() {
      if (!(await flush())) return;
      const representation = current.current?.representation;
      const link =
        representation && (findSirenLink(representation, "content") || findSirenLink(representation, "preview"));
      if (link) setDocumentUrl(link.href);
    },
    async freeze() {
      if (freezingRef.current) return false;
      freezingRef.current = true;
      setFreezing(true);
      try {
        if (!(await flush()) || !current.current) return false;
        accept(await freezeCouncilDecisionDocument(id, { expectedVersion: current.current.data.version }));
        setDocumentUrl(null);
        return true;
      } catch (failure) {
        setError(apiErrorCode(failure));
        return false;
      } finally {
        freezingRef.current = false;
        setFreezing(false);
      }
    },
  };
}
