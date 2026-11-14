import { CalendarIcon, CouncilIcon } from "../../components/icons";
import { type CalendarDay, calendarDay, dayDate } from "../../components/ui/date-picker";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { useI18n } from "../../i18n/I18nProvider";
import { writtenTime } from "./EventScheduleFields";
import { localDateTime } from "./eventDates";

/** One occurrence shown by the calendar: an appointment or a scheduled council meeting. */
export interface CalendarOccurrence {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
  resourceId?: string;
  meetingReference?: string;
}

function occurrenceDays(occurrence: CalendarOccurrence): CalendarDay[] {
  const first = occurrence.allDay ? occurrence.start.slice(0, 10) : calendarDay(new Date(occurrence.start));
  if (!occurrence.end) return [first];
  const endDate = occurrence.allDay ? dayDate(occurrence.end.slice(0, 10)) : new Date(occurrence.end);
  if (occurrence.allDay) endDate.setDate(endDate.getDate() - 1);
  else endDate.setMilliseconds(endDate.getMilliseconds() - 1);
  const last = calendarDay(endDate);
  const days: CalendarDay[] = [];
  for (let day = dayDate(first); calendarDay(day) <= last && days.length < 62; day.setDate(day.getDate() + 1))
    days.push(calendarDay(day));
  return days.length > 0 ? days : [first];
}

// @implements-requirement HALL-FR-CAL-220
/**
 * The coming appointments and council meetings, from a day onward, grouped by day in the order of time; an
 * appointment of several days appears under each of its days.
 */
export function CalendarList({
  occurrences,
  from,
  onOpen,
}: {
  occurrences: CalendarOccurrence[];
  from: CalendarDay;
  onOpen(occurrence: CalendarOccurrence): void;
}) {
  const { t, locale } = useI18n();
  const languageTag = locale === "fr" ? "fr-FR" : "en-GB";
  const today = calendarDay(new Date());
  const groups = new Map<CalendarDay, CalendarOccurrence[]>();
  for (const occurrence of occurrences)
    for (const day of occurrenceDays(occurrence))
      if (day >= from) groups.set(day, [...(groups.get(day) ?? []), occurrence]);
  const days = [...groups.keys()].sort();
  const timeOf = (occurrence: CalendarOccurrence) => writtenTime(localDateTime(occurrence.start).slice(11, 16));
  const dayTitle = (day: CalendarDay) => {
    const date = dayDate(day);
    return new Intl.DateTimeFormat(languageTag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    }).format(date);
  };
  if (days.length === 0)
    return (
      <p className="calendar-list-empty" data-testid="calendar-list-empty">
        {t("calendar.listEmpty")}
      </p>
    );
  return (
    <div className="calendar-list" data-testid="calendar-list">
      {days.map((day) => {
        const entries = [...(groups.get(day) ?? [])].sort((left, right) =>
          left.allDay === right.allDay ? left.start.localeCompare(right.start) : left.allDay ? -1 : 1,
        );
        return (
          <section key={day} className="calendar-list-day" data-testid={`calendar-list-day-${day}`}>
            <h3 className="calendar-list-day-title" data-today={day === today ? "true" : undefined}>
              {day === today ? `${t("calendar.today")}, ${dayTitle(day)}` : dayTitle(day)}
            </h3>
            <ListRows>
              {entries.map((occurrence) => {
                const startDay = occurrence.allDay
                  ? occurrence.start.slice(0, 10)
                  : calendarDay(new Date(occurrence.start));
                const time = occurrence.allDay || startDay !== day ? t("calendar.allDay") : timeOf(occurrence);
                return (
                  <ListRow
                    key={`${occurrence.id}-${day}`}
                    data-testid={`calendar-list-item-${occurrence.id}`}
                    openTestId={`calendar-list-open-${occurrence.id}`}
                    onOpen={() => onOpen(occurrence)}
                    head={
                      <ListRowIcon nature="council">
                        {occurrence.meetingReference ? <CouncilIcon /> : <CalendarIcon />}
                      </ListRowIcon>
                    }
                    overline={time}
                    title={occurrence.title}
                    detail={occurrence.location || undefined}
                  />
                );
              })}
            </ListRows>
          </section>
        );
      })}
    </div>
  );
}
