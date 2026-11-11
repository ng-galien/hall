import type { EventDocument } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { useId, useState } from "react";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { CloseIcon } from "../../components/icons";
import { ResourceSearchField } from "../../components/search/ResourceSearchField";
import { Button } from "../../components/ui/button";
import { Field, FieldRow } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ListRow, ListRows } from "../../components/ui/list-row";
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
  const participantsId = useId();
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
      <label className="checkbox-field">
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
      <FieldRow>
        <Field label={t("calendar.start")}>
          <Input
            data-testid="event-start"
            type={allDay ? "date" : "datetime-local"}
            step={allDay ? undefined : 900}
            readOnly={readOnly}
            value={allDay ? value.schedule.start : localDateTime(value.schedule.start)}
            onChange={(event) => updateDate("start", event.target.value)}
          />
        </Field>
        <Field label={t("calendar.end")}>
          <Input
            data-testid="event-end"
            type={allDay ? "date" : "datetime-local"}
            step={allDay ? undefined : 900}
            readOnly={readOnly}
            value={allDay ? shiftDate(value.schedule.end, -1) : localDateTime(value.schedule.end)}
            onChange={(event) => updateDate("end", event.target.value)}
          />
        </Field>
      </FieldRow>
      {onCouncilBusinessChange ? (
        <Field label={t("calendar.councilBusiness")}>
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
        </Field>
      ) : null}
      <Field label={t("calendar.location")}>
        <Input
          data-testid="event-location"
          readOnly={readOnly}
          value={value.location}
          onChange={(event) => onChange({ ...value, location: event.target.value })}
        />
      </Field>
      <section className="event-participants" aria-labelledby={`${participantsId}-title`}>
        <h3 id={`${participantsId}-title`}>{t("calendar.participants")}</h3>
        {value.participants.length > 0 ? (
          <ListRows>
            {value.participants.map((participant, index) => (
              <ListRow
                data-testid={`event-participant-${index}`}
                key={JSON.stringify(participant)}
                title={matchDiscriminated(participant, "kind", {
                  guest: (entry) => entry.name,
                  contact: (entry) => {
                    const contact = contacts.find((item) => item.id === entry.contactId);
                    return contact ? `${contact.firstName} ${contact.lastName}` : t("calendar.contact");
                  },
                })}
                action={
                  readOnly ? undefined : (
                    <Button
                      type="button"
                      variant="plain"
                      size="icon"
                      aria-label={t("common.delete")}
                      data-testid={`event-remove-participant-${index}`}
                      onClick={() =>
                        onChange({ ...value, participants: value.participants.filter((_, i) => i !== index) })
                      }
                    >
                      <CloseIcon />
                    </Button>
                  )
                }
              />
            ))}
          </ListRows>
        ) : null}
        {!readOnly && (
          <>
            <Button
              type="button"
              variant="secondary"
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
            <div className="event-guest">
              <Field label={t("calendar.guest")}>
                <Input data-testid="event-guest" value={guest} onChange={(event) => setGuest(event.target.value)} />
              </Field>
              <Button
                type="button"
                variant="secondary"
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
      </section>
      <div className="event-context">
        <h3>{t("calendar.context")}</h3>
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
