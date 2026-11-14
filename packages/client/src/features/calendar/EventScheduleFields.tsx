import { useState } from "react";
import { type CalendarDay, DatePicker, dayDate } from "../../components/ui/date-picker";
import { Field, FieldPicker } from "../../components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useI18n } from "../../i18n/I18nProvider";

const quarterHours = Array.from(
  { length: 96 },
  (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
);

/** « lun. 17 novembre », the year written only when it is not the current one. */
export function useWrittenDay(): (day: CalendarDay) => string {
  const { locale } = useI18n();
  const languageTag = locale === "fr" ? "fr-FR" : "en-GB";
  return (day) => {
    const date = dayDate(day);
    return new Intl.DateTimeFormat(languageTag, {
      weekday: "short",
      day: "numeric",
      month: "long",
      ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    }).format(date);
  };
}

/** « 9 h 30 », the way a French reader writes an hour. */
export function writtenTime(time: string): string {
  const [hours, minutes] = time.split(":");
  return `${Number(hours)} h ${minutes}`;
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** A day of a form, written in full, chosen in the date picker of Hall. */
export function DayField({
  label,
  value,
  onChange,
  readOnly,
  testId,
}: {
  label: string;
  value: CalendarDay;
  onChange(day: CalendarDay): void;
  readOnly: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const written = useWrittenDay();
  return (
    <Field label={label} className="event-day-field">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={readOnly}>
          <FieldPicker data-testid={testId} data-value={value} disabled={readOnly}>
            {written(value)}
          </FieldPicker>
        </PopoverTrigger>
        <PopoverContent align="start" className="event-date-popover">
          <DatePicker
            value={value}
            testId={`${testId}-picker`}
            onSelect={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}

/** An hour of a form, chosen among the quarter hours of the day; an end on the start day shows its duration. */
export function TimeField({
  label,
  value,
  onChange,
  readOnly,
  testId,
  durationFrom,
}: {
  label: string;
  value: string;
  onChange(time: string): void;
  readOnly: boolean;
  testId: string;
  durationFrom?: string;
}) {
  const { t } = useI18n();
  const options = quarterHours.includes(value) ? quarterHours : [...quarterHours, value].sort();
  const duration = (time: string) => {
    if (durationFrom === undefined) return null;
    const minutes = minutesOf(time) - minutesOf(durationFrom);
    if (minutes <= 0) return null;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours === 0
      ? t("calendar.durationMinutes", { minutes: String(rest) })
      : rest === 0
        ? t("calendar.durationHours", { hours: String(hours) })
        : t("calendar.durationHoursMinutes", { hours: String(hours), minutes: String(rest).padStart(2, "0") });
  };
  return (
    <Field label={label} className="event-time-field">
      <Select value={value} onValueChange={onChange} disabled={readOnly}>
        <SelectTrigger data-testid={testId} data-value={value}>
          <SelectValue>{writtenTime(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="event-time-options" data-testid={`${testId}-options`}>
          {options.map((time) => {
            const length = duration(time);
            return (
              <SelectItem
                key={time}
                value={time}
                className="event-time-option"
                data-testid={`${testId}-option-${time.replace(":", "-")}`}
              >
                {writtenTime(time)}
                {length ? <span className="event-time-duration">{length}</span> : null}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </Field>
  );
}
