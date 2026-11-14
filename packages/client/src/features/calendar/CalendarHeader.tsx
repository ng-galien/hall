import { useState } from "react";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DayViewIcon,
  ListBulletedIcon,
  MonthViewIcon,
  TodayIcon,
  WeekViewIcon,
} from "../../components/icons";
import { Button } from "../../components/ui/button";
import { type CalendarDay, DatePicker } from "../../components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { useI18n } from "../../i18n/I18nProvider";
import { ScreenTitleCommands } from "../../shell/headerTrail";

export type CalendarView = "list" | "timeGridDay" | "timeGridWeek" | "dayGridMonth";

const views = [
  { id: "list", label: "calendar.list", Icon: ListBulletedIcon },
  { id: "timeGridDay", label: "calendar.day", Icon: DayViewIcon },
  { id: "timeGridWeek", label: "calendar.week", Icon: WeekViewIcon },
  { id: "dayGridMonth", label: "calendar.month", Icon: MonthViewIcon },
] as const;

// @implements-requirement HALL-FR-CAL-010
// @implements-requirement HALL-FR-CAL-230
/**
 * The line over the calendar: the shown period, whose touch opens the date picker to reach another day, month or
 * year; « Aujourd'hui »; on a large screen the previous and next periods and the legend. The four views sit on the
 * line of the screen title.
 */
export function CalendarHeader({
  phone,
  view,
  title,
  anchor,
  marked,
  onView,
  onGoTo,
  onToday,
  onPrevious,
  onNext,
}: {
  phone: boolean;
  view: CalendarView;
  title: string;
  anchor: CalendarDay;
  marked: ReadonlySet<CalendarDay>;
  onView(view: CalendarView): void;
  onGoTo(day: CalendarDay): void;
  onToday(): void;
  onPrevious(): void;
  onNext(): void;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const period = (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="calendar-period"
          data-testid="calendar-title"
          aria-label={t("calendar.choosePeriod")}
        >
          <h2>{title}</h2>
          <CalendarIcon className="calendar-period-icon" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="calendar-period-popover" data-testid="calendar-period-picker">
        <DatePicker
          key={`${anchor}-${view}`}
          value={anchor}
          level={view === "dayGridMonth" ? "month" : "day"}
          marked={marked}
          testId="calendar-picker"
          onSelect={(day) => {
            onGoTo(day);
            setPickerOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
  return (
    <div className="calendar-toolbar" data-layout={phone ? "phone" : "wide"}>
      <ScreenTitleCommands>
        <div className="calendar-views">
          {views.map((item) => (
            <Button
              key={item.id}
              variant={view === item.id ? "secondary" : "plain"}
              size={phone ? "icon" : "default"}
              aria-pressed={view === item.id}
              aria-label={phone ? t(item.label) : undefined}
              title={t(item.label)}
              data-testid={`calendar-view-${item.id}`}
              onClick={() => onView(item.id)}
            >
              <item.Icon />
              {phone ? null : <span>{t(item.label)}</span>}
            </Button>
          ))}
        </div>
      </ScreenTitleCommands>
      {phone ? (
        <>
          {period}
          <Button variant="secondary" className="calendar-today" data-testid="calendar-today" onClick={onToday}>
            <TodayIcon />
            {t("calendar.today")}
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" data-testid="calendar-today" onClick={onToday}>
            <TodayIcon />
            {t("calendar.today")}
          </Button>
          <Button
            variant="plain"
            size="icon"
            data-testid="calendar-previous"
            aria-label={t("calendar.previous")}
            onClick={onPrevious}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="plain"
            size="icon"
            data-testid="calendar-next"
            aria-label={t("calendar.next")}
            onClick={onNext}
          >
            <ChevronRightIcon />
          </Button>
          {period}
          <div className="calendar-legend">
            <span className="calendar-legend-event">{t("workspace.type.event")}</span>
            <span className="calendar-legend-council">{t("navigation.meetings")}</span>
          </div>
        </>
      )}
    </div>
  );
}
