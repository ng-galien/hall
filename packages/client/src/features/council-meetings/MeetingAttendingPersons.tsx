import type {
  CorrectMeetingAuxiliaryAttendance,
  DeclareMeetingAuxiliaryAttendance,
  MeetingAuxiliaryAttendance,
} from "@hall/api-contract";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AddIcon, CheckIcon } from "../../components/icons";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field, FieldRow } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type { ApiErrorCode } from "../../services/apiClient";
import { useContactsStore } from "../../stores/contactsStore";

// @implements-requirement HALL-FR-ATT-140
/** Other persons present, entered at roll call and corrected until closure. */
export function MeetingAttendingPersons({
  entries,
  members,
  canDeclare,
  canCorrect,
  error,
  onDeclare,
  onCorrect,
}: {
  entries: readonly MeetingAuxiliaryAttendance[];
  members: readonly CouncilMemberView[];
  canDeclare: boolean;
  canCorrect: boolean;
  error: ApiErrorCode | null;
  onDeclare(input: DeclareMeetingAuxiliaryAttendance): Promise<boolean>;
  onCorrect(input: CorrectMeetingAuxiliaryAttendance): Promise<boolean>;
}) {
  const { t } = useI18n();
  const addButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"contact" | "newContact">("contact");
  const [failed, setFailed] = useState(false);
  const [contactId, setContactId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [quality, setQuality] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const contacts = useContactsStore((state) => state.contacts);
  useEffect(() => {
    if (canDeclare) void useContactsStore.getState().load();
  }, [canDeclare]);
  const memberContactIds = new Set(members.map((member) => member.contact.id));
  const enteredContactIds = new Set(entries.map((entry) => entry.contactId));
  const candidates = contacts.filter(
    (contact) => !contact.archivedAt && !memberContactIds.has(contact.id) && !enteredContactIds.has(contact.id),
  );
  const ready = mode === "contact" ? Boolean(contactId) : firstName.trim() !== "" && lastName.trim() !== "";

  const openForm = () => {
    setMode("contact");
    setContactId("");
    setFirstName("");
    setLastName("");
    setQuality("");
    setFailed(false);
    setOpen(true);
  };

  const run = async (action: () => Promise<boolean>) => {
    if (submitting) return false;
    setSubmitting(true);
    try {
      return await action();
    } finally {
      setSubmitting(false);
    }
  };
  const declare = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || submitting) return;
    setFailed(false);
    void run(async () => {
      const saved = await onDeclare({
        person:
          mode === "contact"
            ? { kind: "contact", contactId }
            : { kind: "newContact", firstName: firstName.trim(), lastName: lastName.trim() },
        quality: quality.trim() || null,
      });
      if (saved) setOpen(false);
      else setFailed(true);
      return saved;
    });
  };

  return (
    <section className="grid gap-3" data-testid="live-auxiliaries">
      <strong>{t("auxiliary.title")}</strong>
      <p className="text-sm text-muted">{t("auxiliary.description")}</p>
      {entries.length > 0 ? (
        <ul className="grid gap-2" data-testid="live-auxiliaries-list">
          {entries.map((entry) => (
            <AttendingPersonRow
              key={entry.id}
              entry={entry}
              disabled={submitting || !canCorrect}
              onCorrect={(input) => run(() => onCorrect(input))}
            />
          ))}
        </ul>
      ) : (
        <p data-testid="live-auxiliaries-empty">{t("auxiliary.empty")}</p>
      )}
      {canDeclare ? (
        <div>
          <Button
            ref={addButton}
            type="button"
            variant="secondary"
            data-testid="live-auxiliaries-open"
            onClick={openForm}
            disabled={submitting}
          >
            <AddIcon aria-hidden="true" />
            {t("auxiliary.addPerson")}
          </Button>
        </div>
      ) : null}
      <Modal
        open={open}
        title={t("auxiliary.addPerson")}
        testId="live-auxiliaries-dialog"
        returnFocusRef={addButton}
        onClose={() => {
          if (!submitting) setOpen(false);
        }}
      >
        <form className="modal-form" data-testid="live-auxiliaries-form" onSubmit={declare}>
          <RequestErrorBanner error={failed ? (error ?? "request_failed") : null} compact />
          <fieldset className="grid gap-2 sm:grid-cols-2" disabled={submitting}>
            <legend className="sr-only">{t("auxiliary.contact")}</legend>
            <Button
              type="button"
              variant="secondary"
              aria-pressed={mode === "contact"}
              data-testid="live-auxiliaries-existing-mode"
              onClick={() => setMode("contact")}
            >
              {mode === "contact" && <CheckIcon aria-hidden="true" />}
              {t("auxiliary.existingContact")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-pressed={mode === "newContact"}
              data-testid="live-auxiliaries-new-mode"
              onClick={() => setMode("newContact")}
            >
              {mode === "newContact" && <CheckIcon aria-hidden="true" />}
              {t("auxiliary.newContact")}
            </Button>
          </fieldset>
          {mode === "contact" ? (
            <Field label={t("auxiliary.contact")}>
              <EntitySelect
                type="contact"
                testId="live-auxiliaries-contact"
                value={contactId}
                onValueChange={setContactId}
                disabled={submitting}
                options={candidates.map((contact) => ({
                  value: contact.id,
                  label: `${contact.firstName} ${contact.lastName}`,
                }))}
              />
            </Field>
          ) : (
            <FieldRow>
              <Field label={t("auxiliary.firstName")}>
                <Input
                  data-testid="live-auxiliaries-first-name"
                  value={firstName}
                  disabled={submitting}
                  onChange={(event) => setFirstName(event.currentTarget.value)}
                />
              </Field>
              <Field label={t("auxiliary.lastName")}>
                <Input
                  data-testid="live-auxiliaries-last-name"
                  value={lastName}
                  disabled={submitting}
                  onChange={(event) => setLastName(event.currentTarget.value)}
                />
              </Field>
            </FieldRow>
          )}
          <Field label={t("auxiliary.quality")}>
            <Input
              data-testid="live-auxiliaries-quality"
              value={quality}
              disabled={submitting}
              onChange={(event) => setQuality(event.currentTarget.value)}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              data-testid="live-auxiliaries-cancel"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" data-testid="live-auxiliaries-submit" disabled={!ready || submitting || !canDeclare}>
              {t(submitting ? "common.saving" : "common.add")}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function AttendingPersonRow({
  entry,
  disabled,
  onCorrect,
}: {
  entry: MeetingAuxiliaryAttendance;
  disabled: boolean;
  onCorrect(input: CorrectMeetingAuxiliaryAttendance): Promise<boolean>;
}) {
  const { t } = useI18n();
  const [quality, setQuality] = useState(entry.quality ?? "");
  useEffect(() => setQuality(entry.quality ?? ""), [entry.quality]);
  const changed = quality.trim() !== (entry.quality ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid={`live-auxiliary-${entry.contactId}`}>
      <strong>{entry.name}</strong>
      {disabled ? (
        entry.quality ? (
          <span>· {entry.quality}</span>
        ) : null
      ) : (
        <>
          <Field label={t("auxiliary.quality")} className="flex-1">
            <Input
              data-testid={`live-auxiliary-quality-${entry.contactId}`}
              value={quality}
              onChange={(event) => setQuality(event.currentTarget.value)}
            />
          </Field>
          <Button
            variant="secondary"
            data-testid={`live-auxiliary-save-${entry.contactId}`}
            disabled={!changed}
            onClick={() => void onCorrect({ kind: "quality", attendanceId: entry.id, quality: quality.trim() || null })}
          >
            {t("auxiliary.saveQuality")}
          </Button>
          <Button
            variant="secondary"
            data-testid={`live-auxiliary-remove-${entry.contactId}`}
            onClick={() => void onCorrect({ kind: "removal", attendanceId: entry.id })}
          >
            {t("auxiliary.remove")}
          </Button>
        </>
      )}
    </li>
  );
}
