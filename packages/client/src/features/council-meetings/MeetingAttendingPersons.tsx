import type {
  CorrectMeetingAuxiliaryAttendance,
  DeclareMeetingAuxiliaryAttendance,
  MeetingAuxiliaryAttendance,
} from "@hall/api-contract";
import { type FormEvent, useEffect, useId, useState } from "react";
import { EntitySelect } from "../../components/search/EntitySelect";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import { useContactsStore } from "../../stores/contactsStore";

// @implements-requirement HALL-FR-ATT-140
/** Other persons present, entered at roll call and corrected until closure. */
export function MeetingAttendingPersons({
  entries,
  members,
  canDeclare,
  canCorrect,
  onDeclare,
  onCorrect,
}: {
  entries: readonly MeetingAuxiliaryAttendance[];
  members: readonly CouncilMemberView[];
  canDeclare: boolean;
  canCorrect: boolean;
  onDeclare(input: DeclareMeetingAuxiliaryAttendance): Promise<boolean>;
  onCorrect(input: CorrectMeetingAuxiliaryAttendance): Promise<boolean>;
}) {
  const { t } = useI18n();
  const id = useId();
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
  const newName = firstName.trim() !== "" && lastName.trim() !== "";
  const ready = Boolean(contactId) !== newName;

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
    if (!ready) return;
    void run(async () => {
      const saved = await onDeclare({
        person: contactId
          ? { kind: "contact", contactId }
          : { kind: "newContact", firstName: firstName.trim(), lastName: lastName.trim() },
        quality: quality.trim() || null,
      });
      if (saved) {
        setContactId("");
        setFirstName("");
        setLastName("");
        setQuality("");
      }
      return saved;
    });
  };

  return (
    <section className="grid gap-3" data-testid="live-auxiliaries">
      <strong>{t("auxiliary.title")}</strong>
      <p className="text-sm text-muted-foreground">{t("auxiliary.description")}</p>
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
        <form className="grid gap-3" data-testid="live-auxiliaries-form" onSubmit={declare}>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-contact`}>{t("auxiliary.contact")}</Label>
            <EntitySelect
              type="contact"
              testId="live-auxiliaries-contact"
              value={contactId}
              onValueChange={(value) => {
                setContactId(value);
                setFirstName("");
                setLastName("");
              }}
              disabled={submitting}
              placeholder={t("auxiliary.chooseContact")}
              options={candidates.map((contact) => ({
                value: contact.id,
                label: `${contact.firstName} ${contact.lastName}`,
              }))}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t("auxiliary.orNewName")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-first-name`}>{t("auxiliary.firstName")}</Label>
              <Input
                id={`${id}-first-name`}
                data-testid="live-auxiliaries-first-name"
                value={firstName}
                disabled={submitting}
                onChange={(event) => {
                  setFirstName(event.currentTarget.value);
                  setContactId("");
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-last-name`}>{t("auxiliary.lastName")}</Label>
              <Input
                id={`${id}-last-name`}
                data-testid="live-auxiliaries-last-name"
                value={lastName}
                disabled={submitting}
                onChange={(event) => {
                  setLastName(event.currentTarget.value);
                  setContactId("");
                }}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-quality`}>{t("auxiliary.quality")}</Label>
            <Input
              id={`${id}-quality`}
              data-testid="live-auxiliaries-quality"
              value={quality}
              disabled={submitting}
              placeholder={t("auxiliary.qualityPlaceholder")}
              onChange={(event) => setQuality(event.currentTarget.value)}
            />
          </div>
          <Button type="submit" data-testid="live-auxiliaries-submit" disabled={!ready || submitting}>
            {t(submitting ? "common.saving" : "auxiliary.declare")}
          </Button>
        </form>
      ) : null}
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
          <Input
            className="w-auto flex-1"
            aria-label={t("auxiliary.quality")}
            data-testid={`live-auxiliary-quality-${entry.contactId}`}
            value={quality}
            placeholder={t("auxiliary.qualityPlaceholder")}
            onChange={(event) => setQuality(event.currentTarget.value)}
          />
          <Button
            variant="outline"
            size="sm"
            data-testid={`live-auxiliary-save-${entry.contactId}`}
            disabled={!changed}
            onClick={() => void onCorrect({ kind: "quality", attendanceId: entry.id, quality: quality.trim() || null })}
          >
            {t("auxiliary.saveQuality")}
          </Button>
          <Button
            variant="outline"
            size="sm"
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
