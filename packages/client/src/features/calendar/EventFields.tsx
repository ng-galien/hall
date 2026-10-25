import type { EventDocument } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { useState } from "react";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { ResourceSearchField } from "../../components/search/ResourceSearchField";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ReferenceBusinessContext } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { useContactsStore } from "../../stores/contactsStore";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { localDateTime, nextDate, shiftDate } from "./eventDates";

// @implements-requirement HALL-FR-CAL-120
// @implements-requirement HALL-FR-CAL-140
// @implements-requirement HALL-FR-CAL-150
// @implements-requirement HALL-FR-CAL-160
// @implements-requirement HALL-FR-CAL-170
// @implements-requirement HALL-FR-CAL-100
// @implements-requirement HALL-FR-CAL-110
// @implements-requirement HALL-FR-CAL-130
export function EventFields({
  value,
  onChange,
  councilBusinessId = null,
  onCouncilBusinessChange,
  councilBusinessPending = false,
  readOnly = false,
}: {
  value: EventDocument;
  onChange(value: EventDocument): void;
  councilBusinessId?: string | null;
  onCouncilBusinessChange?(value: string | null): void | Promise<void>;
  councilBusinessPending?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const contacts = useContactsStore((state) => state.contacts);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const councilMembers = useCouncilMembersStore((state) => state.members);
  const [guest, setGuest] = useState("");
  const allDay = value.schedule.kind === "allDay";
  const updateDate = (field: "start" | "end", raw: string) => {
    if (!raw) return;
    const schedule = matchDiscriminated(value.schedule, "kind", {
      allDay: (current) => ({ ...current, [field]: field === "end" ? nextDate(raw) : raw }),
      timed: (current) => {
        const next = new Date(raw).toISOString();
        const updated = { ...current, [field]: next };
        const enteredDate = new Date(next);
        const followsQuarterHourStep = enteredDate.getSeconds() === 0 && enteredDate.getMinutes() % 15 === 0;
        if (!followsQuarterHourStep) return updated;
        if (field === "start" && Date.parse(updated.end) <= Date.parse(next)) {
          const midnight = new Date(next);
          midnight.setHours(24, 0, 0, 0);
          updated.end = new Date(Math.min(Date.parse(next) + 60 * 60 * 1000, midnight.getTime())).toISOString();
        }
        return updated;
      },
    });
    onChange({ ...value, schedule });
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
            step={allDay ? undefined : 900}
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
            step={allDay ? undefined : 900}
            readOnly={readOnly}
            value={allDay ? shiftDate(value.schedule.end, -1) : localDateTime(value.schedule.end)}
            onChange={(event) => updateDate("end", event.target.value)}
          />
        </div>
      </div>
      {onCouncilBusinessChange ? (
        <div>
          <Label htmlFor="event-council-business">{t("calendar.councilBusiness")}</Label>
          <ResourceSearchField
            testId="event-council-business"
            label={
              businesses.find((business) => business.id === councilBusinessId)?.title ?? t("calendar.noCouncilBusiness")
            }
            scope={{ types: ["councilBusiness"] }}
            disabled={readOnly || councilBusinessPending}
            onPick={(item) => void onCouncilBusinessChange(item.id)}
            onClear={() => void onCouncilBusinessChange(null)}
            clearLabel={t("calendar.noCouncilBusiness")}
          />
        </div>
      ) : null}
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
            <Button
              type="button"
              variant="outline"
              data-testid="event-add-council-members"
              onClick={() => {
                const existing = new Set(
                  value.participants.flatMap((participant) =>
                    participant.kind === "contact" ? [participant.contactId] : [],
                  ),
                );
                const additions = councilMembers
                  .filter((member) => member.active && !existing.has(member.contactId))
                  .map((member) => ({ kind: "contact" as const, contactId: member.contactId }));
                onChange({ ...value, participants: [...value.participants, ...additions] });
              }}
            >
              {t("calendar.addCouncilMembers")}
            </Button>
            <ResourceSearchField
              testId="event-contact"
              label={t("calendar.addContact")}
              scope={{
                types: ["contact"],
                excludedIds: value.participants.flatMap((participant) =>
                  participant.kind === "contact" ? [participant.contactId] : [],
                ),
              }}
              onPick={(item) =>
                onChange({ ...value, participants: [...value.participants, { kind: "contact", contactId: item.id }] })
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
        {(() => {
          const missing = value.participants.flatMap((participant) => {
            if (participant.kind !== "contact") return [];
            const contact = contacts.find((entry) => entry.id === participant.contactId);
            return contact && !contact.email ? [`${contact.firstName} ${contact.lastName}`] : [];
          });
          return missing.length > 0 ? (
            <p role="alert" data-testid="event-missing-email-warning">
              {t("calendar.missingEmails", { names: missing.join(", ") })}
            </p>
          ) : null;
        })()}
      </div>
      <div>
        <Label>{t("calendar.context")}</Label>
        <ReferenceBusinessContext.Provider value={councilBusinessId ?? undefined}>
          <MarkdownEditor
            title={t("calendar.context")}
            markdown={value.content}
            onChange={(content) => onChange({ ...value, content })}
            readOnly={readOnly}
            variant="compact"
          />
        </ReferenceBusinessContext.Provider>
      </div>
    </div>
  );
}

import "./calendar.css";
