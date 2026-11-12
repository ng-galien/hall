import { type Contact, formatPhoneNumber, normalizePhoneNumber } from "@hall/api-contract";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldRow, FieldValue } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeleteIcon, PhoneIcon } from "../components/icons";
import { EmptyState, PageHeader, RequestErrorBanner } from "../components/Ui";
import { SectionHeader } from "../components/ui/section-header";
import { ContactEmailAction, ContactEmailLink } from "../features/contacts/ContactEmailLink";
import {
  type ContactPhoneField,
  contactPhoneFields,
  phoneHref,
  useTouchScreen,
} from "../features/contacts/contactPhones";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type Draft = Pick<
  Contact,
  "firstName" | "lastName" | "organizationName" | "jobTitle" | "email" | ContactPhoneField | "notes"
>;

const emptyDraft: Draft = {
  firstName: "",
  lastName: "",
  organizationName: null,
  jobTitle: null,
  email: null,
  mobilePhone: null,
  personalPhone: null,
  professionalPhone: null,
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
    mobilePhone: contact.mobilePhone && formatPhoneNumber(contact.mobilePhone),
    personalPhone: contact.personalPhone && formatPhoneNumber(contact.personalPhone),
    professionalPhone: contact.professionalPhone && formatPhoneNumber(contact.professionalPhone),
    notes: contact.notes,
  };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return draftKeys.every((key) => left[key] === right[key]);
}

function validIdentity(draft: Draft): boolean {
  return Boolean(draft.firstName.trim() && draft.lastName.trim());
}

/** The numbers of a draft that are not telephone numbers; they keep the contact from being saved. */
function invalidPhones(draft: Draft): ContactPhoneField[] {
  return contactPhoneFields.filter((key) => {
    const value = draft[key];
    return Boolean(value?.trim()) && normalizePhoneNumber(value ?? "") === null;
  });
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
  const [phonesInvalid, setPhonesInvalid] = useState<ContactPhoneField[]>([]);
  const touchScreen = useTouchScreen();
  const draftRef = useRef<Draft>(emptyDraft);
  const baselineRef = useRef<Draft>(emptyDraft);
  const draftIdRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const dirtyRef = useRef(false);
  const canUpdateRef = useRef(false);

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
    setPhonesInvalid([]);
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
      const refusedPhones = invalidPhones(candidate);
      if (refusedPhones.length > 0) {
        setPhonesInvalid(refusedPhones);
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
    if (phonesInvalid.length > 0)
      setPhonesInvalid(invalidPhones(next).filter((field) => phonesInvalid.includes(field)));
    if (error) clearError();
  };
  const editable = Boolean(canUpdate[contact.id]);
  const name = `${contact.firstName} ${contact.lastName}`;
  const textField = (key: "firstName" | "lastName" | "jobTitle" | "organizationName") => {
    const identityField = key === "firstName" || key === "lastName";
    return (
      <Field key={key} label={t(`contacts.${key === "organizationName" ? "organization" : key}`)}>
        <Input
          value={draft[key] ?? ""}
          readOnly={!editable}
          required={identityField}
          aria-invalid={identityField && identityInvalid}
          onChange={(event) => setDraft(key, event.currentTarget.value || (identityField ? "" : null))}
          data-testid={`contact-${key}`}
        />
      </Field>
    );
  };
  /** A coordinate: an input for a person who edits the contact, its value as a link for a person who reads it. */
  const coordinateField = (
    key: "email" | ContactPhoneField,
    readValue: ReactNode,
    action: ReactNode,
    error?: ReactNode,
  ) => (
    <Field key={key} label={t(`contacts.${key}`)} error={error} action={editable ? action : undefined}>
      {editable ? (
        <Input
          type={key === "email" ? "email" : "tel"}
          inputMode={key === "email" ? "email" : "tel"}
          value={draft[key] ?? ""}
          onChange={(event) => setDraft(key, event.currentTarget.value || null)}
          data-testid={`contact-${key}`}
        />
      ) : (
        <FieldValue data-testid={`contact-${key}`}>{readValue}</FieldValue>
      )}
    </Field>
  );
  const phoneField = (key: ContactPhoneField) => {
    const stored = contact[key];
    const shown = stored ? formatPhoneNumber(stored) : null;
    const call =
      stored && touchScreen ? (
        <a href={phoneHref(stored)} className="hall-link" data-testid={`contact-${key}-call`}>
          {shown}
        </a>
      ) : (
        shown
      );
    return coordinateField(
      key,
      call,
      stored && touchScreen ? (
        <Button asChild variant="plain" size="icon">
          <a href={phoneHref(stored)} aria-label={t("contacts.call")} data-testid={`contact-${key}-call`}>
            <PhoneIcon />
          </a>
        </Button>
      ) : null,
      phonesInvalid.includes(key) ? t("contacts.phoneInvalid") : undefined,
    );
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
          <section className="admin-record" aria-labelledby="contact-identity-title">
            <SectionHeader
              titleId="contact-identity-title"
              title={t("contacts.identity")}
              description={editable ? t("contacts.identityDescription") : undefined}
              commands={
                <>
                  {saveState !== "idle" ? (
                    <span className="record-state" data-save={saveState} role="status">
                      {saveLabels[saveState]}
                    </span>
                  ) : null}
                </>
              }
            />
            {identityInvalid ? (
              <p className="form-error" role="alert" data-testid="contact-identity-error">
                {t("contacts.identityRequired")}
              </p>
            ) : null}
            <div className="admin-fields">
              <FieldRow>
                {textField("firstName")}
                {textField("lastName")}
              </FieldRow>
              <FieldRow>
                {textField("jobTitle")}
                {textField("organizationName")}
              </FieldRow>
            </div>
          </section>
          <section className="admin-record" aria-labelledby="contact-coordinates-title">
            <SectionHeader titleId="contact-coordinates-title" title={t("contacts.coordinates")} />
            <div className="admin-fields">
              {coordinateField(
                "email",
                contact.email ? (
                  <ContactEmailLink
                    contactId={contact.id}
                    name={name}
                    email={contact.email}
                    testId="contact-email-write"
                  />
                ) : null,
                contact.email ? (
                  <ContactEmailAction
                    contactId={contact.id}
                    name={name}
                    email={contact.email}
                    testId="contact-email-write"
                  />
                ) : null,
              )}
              <FieldRow>{contactPhoneFields.map(phoneField)}</FieldRow>
            </div>
          </section>
          <section className="admin-record" aria-labelledby="contact-notes-title">
            <SectionHeader titleId="contact-notes-title" title={t("contacts.notes")} />
            <Field label={t("contacts.notes")}>
              <Textarea
                value={draft.notes}
                readOnly={!editable}
                onChange={(event) => setDraft("notes", event.currentTarget.value)}
                data-testid="contact-notes"
              />
            </Field>
            {saveState === "error" && !identityInvalid && phonesInvalid.length === 0 ? (
              <Button variant="secondary" onClick={() => void flush()} data-testid="contact-save-retry">
                {t("common.retry")}
              </Button>
            ) : null}
          </section>
          {canArchive[contact.id] ? (
            <section className="admin-danger-zone">
              <SectionHeader
                title={t("contacts.archive")}
                description={t("contacts.archiveDescription")}
                commands={
                  <>
                    <Button
                      variant="danger"
                      disabled={submitting}
                      onClick={() => void archiveContact()}
                      data-testid="contact-archive"
                    >
                      <DeleteIcon />
                      {t(submitting ? "common.saving" : "contacts.archive")}
                    </Button>
                  </>
                }
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
