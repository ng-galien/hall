import { findSirenAction, findSirenLink } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import type { SaveStatus } from "../../components/ui/save-status-indicator";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { generateMinutes, minutesContentHref, openMinutes, updateMinutesDraft } from "../../services/minutesApi";

type OpenedMinutes = Awaited<ReturnType<typeof openMinutes>>;
export type MinutesSaveStatus = SaveStatus;
type SectionDrafts = Record<string, string>;

function changedSection(opened: OpenedMinutes | null, drafts: SectionDrafts) {
  return opened?.data.sections.find((section) => drafts[section.agendaItemId] !== section.content);
}

export function useMinutesDraft(id: string) {
  const [opened, setOpened] = useState<OpenedMinutes | null>(null);
  const [sections, setSections] = useState<SectionDrafts>({});
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [savedSectionId, setSavedSectionId] = useState<string | null>(null);
  const [failedSectionId, setFailedSectionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const latest = useRef<SectionDrafts>({});
  const current = useRef<OpenedMinutes | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const generationPending = useRef(false);
  const openRequest = useRef(0);
  const [previewing, setPreviewing] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const previewRequest = useRef(0);
  const previewPending = useRef(false);
  const clearPreview = useCallback(() => {
    previewRequest.current += 1;
    setDocumentUrl(null);
  }, []);
  useEffect(
    () => () => {
      previewRequest.current += 1;
    },
    [],
  );
  const accept = useCallback((result: OpenedMinutes) => {
    current.current = result;
    setOpened(result);
  }, []);
  const load = useCallback(async () => {
    const request = ++openRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await openMinutes(id);
      if (request !== openRequest.current) return;
      accept(result);
      latest.current = Object.fromEntries(
        result.data.sections.map((section) => [section.agendaItemId, section.content]),
      );
      setSections(latest.current);
    } catch (failure) {
      if (request === openRequest.current) setError(apiErrorCode(failure));
    } finally {
      if (request === openRequest.current) setLoading(false);
    }
  }, [id, accept]);
  useEffect(() => {
    void load();
    return () => {
      openRequest.current += 1;
    };
  }, [load]);

  const flush = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    const save = async () => {
      let section = changedSection(current.current, latest.current);
      try {
        while (current.current && section) {
          setSaving(true);
          setSavingSectionId(section.agendaItemId);
          setFailedSectionId(null);
          const result = await updateMinutesDraft(id, {
            expectedVersion: current.current.data.version,
            agendaItemId: section.agendaItemId,
            content: latest.current[section.agendaItemId],
          });
          accept(result);
          setSavedSectionId(section.agendaItemId);
          section = changedSection(current.current, latest.current);
        }
        setError(null);
        setSaved(true);
        return true;
      } catch (failure) {
        setFailedSectionId(section?.agendaItemId ?? null);
        setError(apiErrorCode(failure));
        return false;
      } finally {
        setSaving(false);
        setSavingSectionId(null);
      }
    };
    pending.current = save().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [id, accept]);
  const dirty = Boolean(changedSection(opened, sections));
  const blocker = useBlocker(dirty || saving || generating);
  useEffect(() => {
    if (!dirty || error) return;
    const timer = window.setTimeout(() => {
      if (latest.current === sections) void flush();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [sections, dirty, error, flush]);
  useEffect(() => {
    if (blocker.state !== "blocked" || generating) return;
    if (error && !dirty) {
      blocker.reset();
      return;
    }
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
  }, [blocker, flush, generating, error, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current || generationPending.current || changedSection(current.current, latest.current))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const saveStatus: MinutesSaveStatus = saving
    ? "saving"
    : error && dirty
      ? "error"
      : dirty
        ? "dirty"
        : saved
          ? "saved"
          : "idle";
  return {
    minutes: opened?.data ?? null,
    sections,
    error,
    loading,
    generating,
    previewing,
    documentUrl,
    closeDocument: clearPreview,
    openDocument() {
      if (current.current?.data.documentId) setDocumentUrl(minutesContentHref(id));
    },
    failDocument() {
      clearPreview();
      setError("request_failed");
    },
    saveStatus,
    sectionSaveStatus(agendaItemId: string): MinutesSaveStatus {
      const persisted = opened?.data.sections.find((section) => section.agendaItemId === agendaItemId)?.content;
      const sectionDirty = persisted !== undefined && sections[agendaItemId] !== persisted;
      if (savingSectionId === agendaItemId) return "saving";
      if (failedSectionId === agendaItemId && sectionDirty) return "error";
      if (sectionDirty) return "dirty";
      if (savedSectionId === agendaItemId) return "saved";
      return "idle";
    },
    canEdit: Boolean(opened?.representation && findSirenAction(opened.representation, "minutes.update-draft")),
    canGenerate: Boolean(opened?.representation && findSirenAction(opened.representation, "minutes.generate")),
    canPreview: Boolean(opened?.representation && findSirenLink(opened.representation, "preview")),
    load,
    flush,
    edit(agendaItemId: string, value: string) {
      clearPreview();
      latest.current = { ...latest.current, [agendaItemId]: value };
      setSections(latest.current);
      setError(null);
      setFailedSectionId(null);
      if (savedSectionId === agendaItemId) setSavedSectionId(null);
      setSaved(false);
    },
    async generate() {
      if (generationPending.current || previewPending.current) return;
      generationPending.current = true;
      setGenerating(true);
      try {
        if (!(await flush()) || !current.current) return;
        accept(await generateMinutes(id, { expectedVersion: current.current.data.version }));
        clearPreview();
        setDocumentUrl(minutesContentHref(id));
      } catch (failure) {
        setError(apiErrorCode(failure));
      } finally {
        generationPending.current = false;
        setGenerating(false);
      }
    },
    async preview() {
      if (generationPending.current || previewPending.current) return;
      previewPending.current = true;
      setPreviewing(true);
      clearPreview();
      const request = previewRequest.current;
      try {
        if (!(await flush()) || !current.current?.representation) return;
        const link = findSirenLink(current.current.representation, "preview");
        if (!link) return;
        if (request !== previewRequest.current) return;
        setDocumentUrl(link.href);
      } catch (failure) {
        if (request === previewRequest.current) setError(apiErrorCode(failure));
      } finally {
        previewPending.current = false;
        setPreviewing(false);
      }
    },
  };
}
