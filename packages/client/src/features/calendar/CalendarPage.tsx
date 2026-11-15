import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import frLocale from "@fullcalendar/react/locales/fr";
import themePlugin from "@fullcalendar/react/themes/monarch";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { type EventDocument, eventDocumentSchema, findSirenAction } from "@hall/api-contract";
import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "../../components/icons";
import { Modal } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { CreateButton } from "../../components/ui/create-button";
import { type CalendarDay, calendarDay, dayDate } from "../../components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useWorkspaceReread } from "../../hooks/useWorkspaceLiveUpdates";
import { useI18n } from "../../i18n/I18nProvider";
import { CouncilMeetingPage } from "../../pages/council-meetings/CouncilMeetingPage";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";
import { ResourcePreview } from "../documents/ResourcePreview";
import { CalendarHeader, type CalendarView } from "./CalendarHeader";
import { CalendarList, type CalendarOccurrence } from "./CalendarList";
import { openCatalogAppointments } from "./calendarAppointments";
import { EventCreateSheet } from "./EventCreateSheet";
import { EventSheet } from "./EventSheet";
import { emptyEventDocument, localDate, nextDate } from "./eventDates";
import { useCalendarSwipe } from "./useCalendarSwipe";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "./calendar.css";

function shiftMonths(day: CalendarDay, months: number): CalendarDay {
  const date = dayDate(day);
  return calendarDay(new Date(date.getFullYear(), date.getMonth() + months, 1, 12));
}

function oneHourLater(start: Date): Date {
  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  return new Date(Math.min(start.getTime() + 60 * 60 * 1000, midnight.getTime()));
}

/** The shown period, in words: the month, the two months of a week across them, or the day; the year when not current. */
function usePeriodTitle() {
  const { locale } = useI18n();
  const languageTag = locale === "fr" ? "fr-FR" : "en-GB";
  return (view: CalendarView, start: Date, end: Date) => {
    const year = (date: Date) => (date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" as const });
    const last = new Date(end.getTime() - 1);
    if (view === "timeGridDay")
      return new Intl.DateTimeFormat(languageTag, {
        weekday: "short",
        day: "numeric",
        month: "long",
        ...year(start),
      }).format(start);
    if (view === "timeGridWeek" && last.getMonth() !== start.getMonth()) {
      const short = (date: Date) => new Intl.DateTimeFormat(languageTag, { month: "short" }).format(date);
      const suffix = last.getFullYear() === new Date().getFullYear() ? "" : ` ${last.getFullYear()}`;
      return `${short(start)} – ${short(last)}${suffix}`;
    }
    return new Intl.DateTimeFormat(languageTag, { month: "long", ...year(start) }).format(start);
  };
}

// @implements-requirement HALL-FR-CAL-010
// @implements-requirement HALL-FR-CAL-050
// @implements-requirement HALL-FR-CAL-060
// @implements-requirement HALL-FR-CAL-070
// @implements-requirement HALL-FR-CAL-090
// @implements-requirement HALL-FR-CAL-020
// @implements-requirement HALL-FR-CAL-030
// @implements-requirement HALL-FR-CAL-040
// @implements-requirement HALL-FR-CAL-080
// @implements-requirement HALL-FR-CAL-100
// @implements-requirement HALL-FR-CAL-110
// @implements-requirement HALL-FR-CAL-130
// @implements-requirement HALL-FR-CAL-210
// @implements-requirement HALL-FR-CAL-220
// @implements-requirement HALL-FR-CAL-230
/**
 * Council calendar. On a phone the day view opens half an hour before the current hour, a swipe changes the period,
 * a touch on a day or an hour opens the creation sheet and an appointment opens in a sheet from the bottom. The list
 * view gives the coming appointments and meetings day by day.
 */
export function CalendarPage() {
  const { t, locale, formatDate } = useI18n();
  const periodTitle = usePeriodTitle();
  const calendar = useRef<CalendarRef>(null);
  const grid = useRef<HTMLDivElement>(null);
  const deleting = useRef(false);
  const contextMenuListeners = useRef(new WeakMap<HTMLElement, EventListener>());
  const resources = useWorkspaceResourcesStore();
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [creation, setCreation] = useState<EventDocument | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [selectedMeetingReference, setSelectedMeetingReference] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [contextTarget, setContextTarget] = useState<{
    resourceId?: string;
    meetingReference?: string;
    x: number;
    y: number;
  } | null>(null);
  const phone = usePhoneLayout();
  const [phoneWidth] = useState(phone);
  const [phoneScrollTime] = useState(() => `${String(Math.max(new Date().getHours() - 1, 0)).padStart(2, "0")}:30:00`);
  const [view, setView] = useState<CalendarView>(phoneWidth ? "timeGridDay" : "dayGridMonth");
  const [anchor, setAnchor] = useState<CalendarDay>(() => calendarDay(new Date()));
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const store = useWorkspaceResourcesStore.getState();
      await Promise.all([store.loadCatalog(), useCouncilMeetingsStore.getState().load()]);
      const opened = await openCatalogAppointments();
      if (active) {
        setError(
          !opened || Boolean(useWorkspaceResourcesStore.getState().error || useCouncilMeetingsStore.getState().error),
        );
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useWorkspaceReread(openCatalogAppointments);
  const api = () => calendar.current?.getApi();
  const acceptTap = useCalendarSwipe(
    grid,
    phone && view !== "list",
    () => api()?.prev(),
    () => api()?.next(),
  );
  const eventResources = Object.values(resources.details).filter((entry) => entry.kind === "event");
  const occurrences: CalendarOccurrence[] = [
    ...eventResources.map((entry) => ({
      id: entry.id,
      title: entry.name,
      start: entry.document.schedule.start,
      end: entry.document.schedule.end,
      allDay: entry.document.schedule.kind === "allDay",
      location: entry.document.location,
      resourceId: entry.id,
    })),
    ...meetings
      .filter((entry) => entry.scheduledAt)
      .map((entry) => ({
        id: `meeting-${entry.id}`,
        title: t("calendar.meetingLabel", { number: String(entry.number) }),
        start: entry.scheduledAt!,
        allDay: false,
        meetingReference: entry.reference,
      })),
  ];
  const events = occurrences.map((occurrence) => ({
    id: occurrence.id,
    title: occurrence.title,
    start: occurrence.start,
    end: occurrence.end,
    allDay: occurrence.allDay,
    className: occurrence.resourceId ? "hall-calendar-appointment" : "hall-calendar-council",
    editable: Boolean(
      occurrence.resourceId &&
        resources.representations[occurrence.resourceId] &&
        findSirenAction(resources.representations[occurrence.resourceId], "resource.update-content"),
    ),
    extendedProps: { resourceId: occurrence.resourceId, meetingReference: occurrence.meetingReference },
  }));
  const marked = new Set(
    occurrences.map((occurrence) =>
      occurrence.allDay ? occurrence.start.slice(0, 10) : calendarDay(new Date(occurrence.start)),
    ),
  );
  const allDayShown =
    range !== null &&
    occurrences.some((occurrence) => {
      if (!occurrence.allDay) return false;
      const first = occurrence.start.slice(0, 10);
      const end = occurrence.end ? occurrence.end.slice(0, 10) : nextDate(first);
      return first < calendarDay(range.end) && end > calendarDay(range.start);
    });
  const contextResource = contextTarget?.resourceId ? resources.details[contextTarget.resourceId] : null;
  const contextEvent = contextResource?.kind === "event" ? contextResource : null;
  const canCreate = resources.collectionCapabilities.create;
  const open = (target: { resourceId?: string; meetingReference?: string }) => {
    if (target.meetingReference) setSelectedMeetingReference(target.meetingReference);
    else if (target.resourceId && resources.details[target.resourceId]) setSelectedResourceId(target.resourceId);
  };
  const startEvent = () => {
    const today = calendarDay(new Date());
    const shown = range && calendarDay(range.start) <= today && today < calendarDay(range.end) ? today : anchor;
    setCreation(emptyEventDocument(view === "list" ? today : shown));
  };
  const changeView = (next: CalendarView) => {
    setView(next);
    if (next === "list") {
      setTitle(periodTitle("dayGridMonth", dayDate(anchor), dayDate(anchor)));
      return;
    }
    api()?.changeView(next, anchor);
  };
  const goTo = (day: CalendarDay) => {
    setAnchor(day);
    if (view === "list") setTitle(periodTitle("dayGridMonth", dayDate(day), dayDate(day)));
    else api()?.gotoDate(day);
  };
  const shift = (direction: -1 | 1) => {
    if (view === "list") goTo(shiftMonths(anchor, direction));
    else if (direction < 0) api()?.prev();
    else api()?.next();
  };
  return (
    <div className="hall-calendar" data-testid="calendar-page" data-view={view}>
      <CreateButton
        testId="calendar-new"
        options={
          canCreate
            ? [
                {
                  id: "event",
                  label: t("workspace.createEvent"),
                  Icon: CalendarIcon,
                  nature: "council",
                  onSelect: startEvent,
                },
              ]
            : []
        }
      />
      <CalendarHeader
        phone={phone}
        view={view}
        title={title}
        anchor={anchor}
        marked={marked}
        onView={changeView}
        onGoTo={goTo}
        onToday={() => goTo(calendarDay(new Date()))}
        onPrevious={() => shift(-1)}
        onNext={() => shift(1)}
      />
      {loading && <p role="status">{t("calendar.loading")}</p>}
      {error && <p role="alert">{t("calendar.error")}</p>}
      {view === "list" ? <CalendarList occurrences={occurrences} from={anchor} onOpen={open} /> : null}
      <div className="hall-calendar-grid" ref={grid} hidden={view === "list"}>
        <FullCalendar
          ref={calendar}
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={locale === "fr" ? frLocale : "en"}
          initialView={phoneWidth ? "timeGridDay" : "dayGridMonth"}
          headerToolbar={false}
          height="100%"
          dayHeaderInnerClass="hall-calendar-day-header"
          dayCellTopInnerClass="hall-calendar-day-number"
          {...(phone
            ? {
                borderless: true,
                scrollTime: phoneScrollTime,
              }
            : {})}
          allDaySlot={allDayShown}
          allDayHeaderContent={() => ""}
          events={events}
          firstDay={1}
          nowIndicator
          selectable={canCreate && !phone}
          editable={!saving}
          eventDurationEditable={!saving}
          datesSet={(info) => {
            const type = info.view.type as CalendarView;
            setTitle(periodTitle(type, info.view.currentStart, info.view.currentEnd));
            setRange({ start: info.view.currentStart, end: info.view.currentEnd });
            const today = calendarDay(new Date());
            const first = calendarDay(info.view.currentStart);
            setAnchor(first <= today && today < calendarDay(info.view.currentEnd) ? today : first);
            setView((current) => (current === "list" ? current : type));
          }}
          select={(info) => {
            setCreation({
              ...emptyEventDocument(),
              schedule: info.allDay
                ? { kind: "allDay", start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) }
                : { kind: "timed", start: info.startStr, end: info.endStr },
            });
            api()?.unselect();
          }}
          dateClick={(info) => {
            if (!phone || !canCreate || !acceptTap()) return;
            const day = localDate(info.date);
            setCreation({
              ...emptyEventDocument(day),
              schedule: info.allDay
                ? { kind: "allDay", start: day, end: nextDate(day) }
                : { kind: "timed", start: info.date.toISOString(), end: oneHourLater(info.date).toISOString() },
            });
          }}
          eventClick={(info) => {
            if (acceptTap()) open(info.event.extendedProps);
          }}
          eventChange={async (info) => {
            const resource = resources.details[info.event.extendedProps.resourceId];
            if (resource?.kind !== "event" || saving) {
              info.revert();
              return;
            }
            const start = info.event.startStr;
            const end = info.event.endStr || (info.event.allDay ? nextDate(start.slice(0, 10)) : "");
            const document: EventDocument = {
              ...resource.document,
              schedule: info.event.allDay
                ? { kind: "allDay", start: start.slice(0, 10), end: end.slice(0, 10) }
                : { kind: "timed", start, end },
            };
            if (!eventDocumentSchema.safeParse(document).success) {
              info.revert();
              return;
            }
            setSaving(true);
            const result = await resources.updateContent(resource.id, {
              kind: "event",
              expectedVersion: resource.version,
              document,
            });
            if (!result) {
              info.revert();
              setError(true);
            }
            setSaving(false);
          }}
          eventContent={(info) => {
            return (
              <span
                className="hall-calendar-event-label"
                data-line={info.view.type.startsWith("dayGrid") ? "one" : undefined}
                title={`${info.timeText} ${info.event.title}`.trim()}
              >
                {info.timeText} {info.event.title}
              </span>
            );
          }}
          eventDidMount={(info) => {
            info.el.dataset.testid = `calendar-event-${info.event.id}`;
            info.el.classList.add("hall-calendar-event");
            const listener: EventListener = (rawEvent) => {
              const event = rawEvent as MouseEvent;
              event.preventDefault();
              setContextTarget({
                resourceId: info.event.extendedProps.resourceId,
                meetingReference: info.event.extendedProps.meetingReference,
                x: event.clientX,
                y: event.clientY,
              });
            };
            contextMenuListeners.current.set(info.el, listener);
            info.el.addEventListener("contextmenu", listener);
          }}
          eventWillUnmount={(info) => {
            const listener = contextMenuListeners.current.get(info.el);
            if (listener) info.el.removeEventListener("contextmenu", listener);
          }}
          dayCellDidMount={(info) => {
            info.el.dataset.testid = `calendar-day-${localDate(info.date)}`;
          }}
          slotHeaderDidMount={(info) => {
            info.el.dataset.testid = "calendar-slot-label";
          }}
          slotLaneDidMount={(info) => {
            info.el.dataset.testid = `calendar-slot-${info.el.dataset.time}`;
          }}
        />
      </div>
      {contextTarget ? (
        <DropdownMenu
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setContextTarget(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="fixed size-px" style={{ left: contextTarget.x, top: contextTarget.y }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              data-testid="calendar-event-open"
              onSelect={() => {
                open(contextTarget);
                setContextTarget(null);
              }}
            >
              {t("workspace.open")}
            </DropdownMenuItem>
            {contextTarget.resourceId &&
            contextEvent &&
            Date.parse(contextEvent.document.schedule.end) > Date.now() &&
            resources.representations[contextTarget.resourceId] &&
            findSirenAction(resources.representations[contextTarget.resourceId], "resource.delete") ? (
              <DropdownMenuItem
                data-testid="calendar-event-delete"
                disabled={saving}
                onSelect={() => {
                  setDeleteStep(1);
                  setDeleteId(contextTarget.resourceId!);
                  setContextTarget(null);
                }}
              >
                {t("common.delete")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {meetings.some((meeting) => !meeting.scheduledAt) && (
        <div className="calendar-undated">
          <span>{t("calendar.undated")}</span>
          {meetings
            .filter((meeting) => !meeting.scheduledAt)
            .map((meeting) => (
              <Button
                variant="plain"
                key={meeting.id}
                data-testid={`calendar-undated-${meeting.id}`}
                onClick={() => setSelectedMeetingReference(meeting.reference)}
              >
                {formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
              </Button>
            ))}
        </div>
      )}
      <Dialog
        open={deleteId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !saving) {
            setDeleteId(null);
            setDeleteStep(1);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(deleteStep === 1 ? "calendar.deleteConfirm" : "calendar.deleteConfirmFinal")}</DialogTitle>
          </DialogHeader>
          <p>{deleteId ? resources.details[deleteId]?.name : ""}</p>
          <div className="dialog-actions">
            <Button
              data-testid="calendar-delete-cancel"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setDeleteId(null);
                setDeleteStep(1);
              }}
            >
              {t("calendar.cancel")}
            </Button>
            <Button
              data-testid="calendar-delete-confirm"
              variant="danger"
              disabled={saving}
              onClick={async () => {
                if (!deleteId || saving || deleting.current) return;
                if (deleteStep === 1) {
                  setDeleteStep(2);
                  return;
                }
                deleting.current = true;
                setSaving(true);
                try {
                  if (await resources.remove(deleteId)) {
                    setDeleteId(null);
                    setDeleteStep(1);
                    setSelectedResourceId(null);
                  }
                } catch {
                  setError(true);
                } finally {
                  deleting.current = false;
                  setSaving(false);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {selectedResourceId ? (
        phone ? (
          <EventSheet
            resourceId={selectedResourceId}
            onClose={() => setSelectedResourceId(null)}
            onDelete={(resourceId) => {
              setDeleteStep(1);
              setDeleteId(resourceId);
            }}
          />
        ) : (
          <ResourcePreview resourceId={selectedResourceId} onClose={() => setSelectedResourceId(null)} />
        )
      ) : null}
      <Modal
        open={selectedMeetingReference !== null}
        title={t("navigation.meetings")}
        testId="calendar-meeting-preview"
        size="wide"
        onClose={() => setSelectedMeetingReference(null)}
      >
        {selectedMeetingReference ? <CouncilMeetingPage meetingReference={selectedMeetingReference} /> : null}
      </Modal>
      <EventCreateSheet initial={creation} onClose={() => setCreation(null)} onFailed={() => setError(true)} />
    </div>
  );
}
