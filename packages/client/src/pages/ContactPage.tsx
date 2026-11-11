import type { Contact } from "@hall/api-contract";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeleteIcon } from "../components/icons";
import { EmptyState, PageHeader, RequestErrorBanner } from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type Draft = Pick<Contact, "firstName" | "lastName" | "organizationName" | "jobTitle" | "email" | "phone" | "notes">;

const emptyDraft: Draft = {
  firstName: "",
  lastName: "",
  organizationName: null,
  jobTitle: null,
  email: null,
  phone: null,
  notes: "",
};
const draftKeys = Object.keys(emptyDraft) as Array<keyof Draft>;

function contactDraft(contact: Contact): Draft {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    organizationName: contact.organizationName,
    jobTitle: contact.jobTitle,
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes,
  };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return draftKeys.every((key) => left[key] === right[key]);
}

function validIdentity(draft: Draft): boolean {
  return Boolean(draft.firstName.trim() && draft.lastName.trim());
}

export function ContactPage() {
  const { contactId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const { contacts, error, canUpdate, canArchive, clearError, loadDetail, update, archive } = useContactsStore();
  const contact = contacts.find((candidate) => candidate.id === contactId);
  const [draft, setDraftState] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [identityInvalid, setIdentityInvalid] = useState(false);
  const draftRef = useRef<Draft>(emptyDraft);
  const baselineRef = useRef<Draft>(emptyDraft);
  const draftIdRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const dirtyRef = useRef(false);
  const canUpdateRef = useRef(false);
  const fieldId = useId();

  useEffect(() => {
    if (contactId) void loadDetail(contactId);
  }, [contactId, loadDetail]);

  useEffect(() => {
    if (!contact || draftIdRef.current === contact.id) return;
    const hydrated = contactDraft(contact);
    draftRef.current = hydrated;
    baselineRef.current = hydrated;
    draftIdRef.current = contact.id;
    revisionRef.current = 0;
    setDraftRevision(0);
    setDraftState(hydrated);
    setBaseline(hydrated);
    setDraftId(contact.id);
    setSaveState("idle");
    setIdentityInvalid(false);
  }, [contact]);

  const dirty = Boolean(draftId === contactId && !sameDraft(draft, baseline));
  dirtyRef.current = dirty;
  canUpdateRef.current = Boolean(contact && canUpdate[contact.id]);

  const runSave = useCallback(async () => {
    const savedContactId = draftIdRef.current;
    if (!savedContactId || !canUpdateRef.current) return true;
    while (!sameDraft(draftRef.current, baselineRef.current)) {
      const candidate = draftRef.current;
      if (!validIdentity(candidate)) {
        setIdentityInvalid(true);
        setSaveState("error");
        return false;
      }
      const savedRevision = revisionRef.current;
      setSaveState("saving");
      const saved = await update(savedContactId, candidate);
      if (!saved) {
        setSaveState("error");
        return false;
      }
      const savedDraft = contactDraft(saved);
      baselineRef.current = savedDraft;
      setBaseline(savedDraft);
      if (revisionRef.current === savedRevision) {
        draftRef.current = savedDraft;
        setDraftState(savedDraft);
      }
    }
    setSaveState("saved");
    return true;
  }, [update]);

  const flush = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const promise = runSave().finally(() => {
      savePromiseRef.current = null;
    });
    savePromiseRef.current = promise;
    return promise;
  }, [runSave]);
  flushRef.current = flush;
  const navigationBlocker = useBlocker(dirty || Boolean(savePromiseRef.current));

  useEffect(() => {
    if (!dirty || !canUpdateRef.current) return;
    setSaveState((current) => (current === "saving" ? current : "dirty"));
    const revisionToSave = draftRevision;
    const timer = window.setTimeout(() => {
      if (revisionRef.current === revisionToSave) void flush();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, draftRevision, flush]);

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    let active = true;
    void flush().then((saved) => {
      if (!active) return;
      if (saved) navigationBlocker.proceed();
      else navigationBlocker.reset();
    });
    return () => {
      active = false;
    };
  }, [flush, navigationBlocker]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || savePromiseRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      if (dirtyRef.current) void flushRef.current();
    };
  }, []);

  if (!contact) {
    return (
      <div className="page">
        <PageHeader title={t("contacts.title")} description={t("contacts.description")} />
        <div className="page-content">
          <EmptyState>{t("contacts.notFound")}</EmptyState>
        </div>
      </div>
    );
  }

  const setDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    revisionRef.current += 1;
    setDraftRevision(revisionRef.current);
    setDraftState(next);
    setSaveState("dirty");
    if (identityInvalid && validIdentity(next)) setIdentityInvalid(false);
    if (error) clearError();
  };
  const saveLabels: Record<SaveState, string> = {
    idle: "",
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };
  const archiveContact = () =>
    run(async () => {
      if (!(await flush())) return false;
      const archived = await archive(contact.id);
      if (archived) navigate("/contacts");
      return archived;
    });

  return (
    <div className="page">
      <PageHeader title={`${contact.firstName} ${contact.lastName}`} description={t("contacts.detailDescription")} />
      <div className="page-content admin-detail-page">
        <RequestErrorBanner error={error} />
        <div className="admin-detail-surface">
          <section className="admin-record" aria-labelledby="contact-record-title">
            <div className="admin-section-heading">
              <div>
                <h2 id="contact-record-title">{t("contacts.identity")}</h2>
                <p>{t("contacts.identityDescription")}</p>
              </div>
              {saveState !== "idle" ? (
                <span className={`admin-save-state admin-save-${saveState}`} role="status">
                  <span aria-hidden="true" />
                  {saveLabels[saveState]}
                </span>
              ) : null}
            </div>
            {identityInvalid ? (
              <p className="form-error" role="alert" data-testid="contact-identity-error">
                {t("contacts.identityRequired")}
              </p>
            ) : null}
            <div className="admin-edit-grid admin-member-edit-grid">
              {(["firstName", "lastName", "organizationName", "jobTitle", "email", "phone"] as const).map((key) => {
                const identityField = key === "firstName" || key === "lastName";
                return (
                  <div className="grid gap-1.5" key={key}>
                    <Label htmlFor={`${fieldId}-${key}`}>
                      {t(`contacts.${key === "organizationName" ? "organization" : key}` as Parameters<typeof t>[0])}
                    </Label>
                    <Input
                      id={`${fieldId}-${key}`}
                      type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                      value={draft[key] ?? ""}
                      readOnly={!canUpdate[contact.id]}
                      required={identityField}
                      aria-invalid={identityField && identityInvalid}
                      onChange={(event) => setDraft(key, event.currentTarget.value || (identityField ? "" : null))}
                      data-testid={`contact-${key}`}
                    />
                  </div>
                );
              })}
              <div className="grid gap-1.5 admin-edit-wide">
                <Label htmlFor={`${fieldId}-notes`}>{t("contacts.notes")}</Label>
                <Textarea
                  id={`${fieldId}-notes`}
                  value={draft.notes}
                  readOnly={!canUpdate[contact.id]}
                  onChange={(event) => setDraft("notes", event.currentTarget.value)}
                  data-testid="contact-notes"
                />
              </div>
            </div>
            {saveState === "error" && !identityInvalid ? (
              <Button variant="secondary" onClick={() => void flush()} data-testid="contact-save-retry">
                {t("common.retry")}
              </Button>
            ) : null}
          </section>
          {canArchive[contact.id] ? (
            <div className="admin-danger-zone">
              <div>
                <strong>{t("contacts.archive")}</strong>
                <p>{t("contacts.archiveDescription")}</p>
              </div>
              <Button
                variant="danger"
                disabled={submitting}
                onClick={() => void archiveContact()}
                data-testid="contact-archive"
              >
                <DeleteIcon />
                {t(submitting ? "common.saving" : "contacts.archive")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
