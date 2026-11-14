import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "./button";
import "./date-picker.css";

/** A calendar day written `YYYY-MM-DD`, in local time. */
export type CalendarDay = string;

export function calendarDay(date: Date): CalendarDay {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayDate(day: CalendarDay): Date {
  return new Date(`${day}T12:00:00`);
}

function monthStart(day: CalendarDay): Date {
  const date = dayDate(day);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

/** The six weeks of a month grid, Monday first, as days. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + index, 12),
  );
}

export type DatePickerLevel = "day" | "month";

/**
 * The date picker of Hall: a month of days, Monday first, today circled and the chosen day filled; its title opens the
 * twelve months of a year, so that a far date is two touches away. `level="month"` chooses a month only.
 */
export function DatePicker({
  value,
  onSelect,
  level = "day",
  marked,
  testId = "date-picker",
  className,
}: {
  value: CalendarDay | null;
  onSelect(day: CalendarDay): void;
  level?: DatePickerLevel;
  /** Days that carry something, drawn with a mark under their number. */
  marked?: ReadonlySet<CalendarDay>;
  testId?: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const languageTag = locale === "fr" ? "fr-FR" : "en-GB";
  const today = calendarDay(new Date());
  const [shown, setShown] = useState(() => monthStart(value ?? today));
  const [choosingMonth, setChoosingMonth] = useState(level === "month");
  const shift = (months: number) =>
    setShown((current) =>
      choosingMonth
        ? new Date(current.getFullYear() + months, current.getMonth(), 1, 12)
        : new Date(current.getFullYear(), current.getMonth() + months, 1, 12),
    );
  const monthName = (month: number) =>
    new Intl.DateTimeFormat(languageTag, { month: "long" }).format(new Date(2026, month, 1, 12));
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(languageTag, { weekday: "narrow" }).format(new Date(2026, 10, 2 + index, 12)),
  );
  const weekdayNames = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(languageTag, { weekday: "long" }).format(new Date(2026, 10, 2 + index, 12)),
  );
  const selectedMonth = value ? monthStart(value) : null;
  const heading = choosingMonth
    ? String(shown.getFullYear())
    : new Intl.DateTimeFormat(languageTag, { month: "long", year: "numeric" }).format(shown);
  return (
    <div
      className={cn("hall-date-picker", className)}
      data-testid={testId}
      data-level={choosingMonth ? "month" : "day"}
    >
      <div className="hall-date-picker-head">
        <Button
          variant="plain"
          size="icon"
          data-testid={`${testId}-previous`}
          aria-label={t(choosingMonth ? "datePicker.previousYear" : "datePicker.previousMonth")}
          onClick={() => shift(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <button
          type="button"
          className="hall-date-picker-heading"
          data-testid={`${testId}-heading`}
          aria-live="polite"
          disabled={level === "month"}
          onClick={() => setChoosingMonth((current) => !current)}
        >
          {heading}
        </button>
        <Button
          variant="plain"
          size="icon"
          data-testid={`${testId}-next`}
          aria-label={t(choosingMonth ? "datePicker.nextYear" : "datePicker.nextMonth")}
          onClick={() => shift(1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      {choosingMonth ? (
        <div className="hall-date-picker-months">
          {Array.from({ length: 12 }, (_, month) => {
            const current = selectedMonth?.getFullYear() === shown.getFullYear() && selectedMonth.getMonth() === month;
            const now = new Date();
            const thisMonth = now.getFullYear() === shown.getFullYear() && now.getMonth() === month;
            return (
              <button
                key={monthName(month)}
                type="button"
                className="hall-date-picker-cell"
                data-selected={current ? "true" : undefined}
                data-today={thisMonth ? "true" : undefined}
                aria-pressed={current}
                data-testid={`${testId}-month-${shown.getFullYear()}-${String(month + 1).padStart(2, "0")}`}
                onClick={() => {
                  const first = new Date(shown.getFullYear(), month, 1, 12);
                  if (level === "month") onSelect(calendarDay(first));
                  else {
                    setShown(first);
                    setChoosingMonth(false);
                  }
                }}
              >
                {monthName(month)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hall-date-picker-days">
          {weekdays.map((weekday, index) => (
            <abbr key={weekdayNames[index]} className="hall-date-picker-weekday" title={weekdayNames[index]}>
              {weekday}
            </abbr>
          ))}
          {monthGrid(shown).map((date) => {
            const day = calendarDay(date);
            return (
              <button
                key={day}
                type="button"
                className="hall-date-picker-cell"
                data-outside={date.getMonth() !== shown.getMonth() ? "true" : undefined}
                data-today={day === today ? "true" : undefined}
                data-selected={day === value ? "true" : undefined}
                data-marked={marked?.has(day) ? "true" : undefined}
                aria-pressed={day === value}
                aria-label={new Intl.DateTimeFormat(languageTag, { dateStyle: "full" }).format(date)}
                data-testid={`${testId}-day-${day}`}
                onClick={() => onSelect(day)}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
