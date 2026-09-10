import type { EventDocument } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { useState } from "react";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { Autocomplete } from "../../components/ui/autocomplete";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import { useContactsStore } from "../../stores/contactsStore";
import { localDateTime, nextDate, shiftDate } from "./eventDates";

export function EventFields({
  value,
  onChange,
  readOnly = false,
}: {
  value: EventDocument;
  onChange(value: EventDocument): void;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const contacts = useContactsStore((state) => state.contacts);
  const [guest, setGuest] = useState("");
  const allDay = value.schedule.kind === "allDay";
  const updateDate = (field: "start" | "end", raw: string) => {
    if (!raw) return;
    const next = allDay ? (field === "end" ? nextDate(raw) : raw) : new Date(raw).toISOString();
    onChange({ ...value, schedule: { ...value.schedule, [field]: next } });
  };
  return (
    <div className="event-fields">
      <label className="flex items-center gap-2">
        <input
          data-testid="event-all-day"
          type="checkbox"
          disabled={readOnly}
          checked={allDay}
          onChange={(event) => {
            const start = value.schedule.start.slice(0, 10);
            const schedule = event.target.checked
              ? { kind: "allDay" as const, start, end: nextDate(start) }
              : {
                  kind: "timed" as const,
                  start: new Date(`${start}T09:00`).toISOString(),
                  end: new Date(`${start}T10:00`).toISOString(),
                };
            onChange({ ...value, schedule });
          }}
        />
        {t("calendar.allDay")}
      </label>
      <div className="event-date-fields">
        <div>
          <Label htmlFor="event-start">{t("calendar.start")}</Label>
          <Input
            id="event-start"
            data-testid="event-start"
            type={allDay ? "date" : "datetime-local"}
            readOnly={readOnly}
            value={allDay ? value.schedule.start : localDateTime(value.schedule.start)}
            onChange={(event) => updateDate("start", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="event-end">{t("calendar.end")}</Label>
          <Input
            id="event-end"
            data-testid="event-end"
            type={allDay ? "date" : "datetime-local"}
            readOnly={readOnly}
            value={allDay ? shiftDate(value.schedule.end, -1) : localDateTime(value.schedule.end)}
            onChange={(event) => updateDate("end", event.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="event-location">{t("calendar.location")}</Label>
        <Input
          id="event-location"
          data-testid="event-location"
          readOnly={readOnly}
          value={value.location}
          onChange={(event) => onChange({ ...value, location: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>{t("calendar.participants")}</Label>
        <div className="flex flex-wrap gap-2">
          {value.participants.map((participant, index) => (
            <Badge
              variant="outline"
              className="event-participant-badge"
              data-testid={`event-participant-${index}`}
              key={JSON.stringify(participant)}
            >
              <span>
                {matchDiscriminated(participant, "kind", {
                  guest: (entry) => entry.name,
                  contact: (entry) => {
                    const contact = contacts.find((item) => item.id === entry.contactId);
                    return contact ? `${contact.firstName} ${contact.lastName}` : t("calendar.contact");
                  },
                })}
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  className="event-participant-remove"
                  aria-label={t("common.delete")}
                  data-testid={`event-remove-participant-${index}`}
                  onClick={() => onChange({ ...value, participants: value.participants.filter((_, i) => i !== index) })}
                >
                  ×
                </Button>
              )}
            </Badge>
          ))}
        </div>
        {!readOnly && (
          <>
            <Autocomplete
              testId="event-contact"
              label={t("calendar.contact")}
              placeholder={t("calendar.addContact")}
              options={contacts
                .filter(
                  (contact) =>
                    !value.participants.some(
                      (participant) => participant.kind === "contact" && participant.contactId === contact.id,
                    ),
                )
                .map((contact) => ({ value: contact.id, label: `${contact.firstName} ${contact.lastName}` }))}
              onSelect={(contactId) =>
                onChange({ ...value, participants: [...value.participants, { kind: "contact", contactId }] })
              }
            />
            <div className="flex gap-2">
              <Input
                data-testid="event-guest"
                aria-label={t("calendar.guest")}
                value={guest}
                onChange={(event) => setGuest(event.target.value)}
              />
              <Button
                type="button"
                data-testid="event-add-guest"
                disabled={!guest.trim()}
                onClick={() => {
                  onChange({ ...value, participants: [...value.participants, { kind: "guest", name: guest.trim() }] });
                  setGuest("");
                }}
              >
                {t("calendar.addGuest")}
              </Button>
            </div>
          </>
        )}
      </div>
      <div>
        <Label>{t("calendar.context")}</Label>
        <MarkdownEditor
          title={t("calendar.context")}
          markdown={value.content}
          onChange={(content) => onChange({ ...value, content })}
          readOnly={readOnly}
          variant="compact"
        />
      </div>
    </div>
  );
}

import "./calendar.css";
