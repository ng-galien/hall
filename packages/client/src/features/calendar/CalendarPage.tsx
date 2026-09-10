import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import frLocale from "@fullcalendar/react/locales/fr";
import themePlugin from "@fullcalendar/react/themes/monarch";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { type EventDocument, eventDocumentSchema, findSirenAction } from "@hall/api-contract";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";
import { ResourcePreview } from "../documents/ResourcePreview";
import { EventFields } from "./EventFields";
import { emptyEventDocument, localDate, nextDate } from "./eventDates";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "./calendar.css";

export function CalendarPage() {
  const { t, locale, formatDate } = useI18n();
  const navigate = useNavigate();
  const calendar = useRef<CalendarRef>(null);
  const resources = useWorkspaceResourcesStore();
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [draft, setDraft] = useState<EventDocument | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [view, setView] = useState("dayGridMonth");
  useEffect(() => {
    let active = true;
    void (async () => {
      const store = useWorkspaceResourcesStore.getState();
      await Promise.all([store.loadCatalog(), useCouncilMeetingsStore.getState().load()]);
      const catalog = useWorkspaceResourcesStore.getState().catalog;
      const result = await Promise.all(
        catalog.filter((entry) => entry.kind === "event").map((entry) => store.open(entry.id)),
      );
      if (active) {
        setError(
          result.some((entry) => !entry) ||
            Boolean(useWorkspaceResourcesStore.getState().error || useCouncilMeetingsStore.getState().error),
        );
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const eventResources = Object.values(resources.details).filter((entry) => entry.kind === "event");
  const events = [
    ...eventResources.map((entry) => ({
      id: entry.id,
      title: entry.name,
      start: entry.document.schedule.start,
      end: entry.document.schedule.end,
      allDay: entry.document.schedule.kind === "allDay",
      className: "hall-calendar-appointment",
      editable: Boolean(findSirenAction(resources.representations[entry.id] ?? null, "resource.update-content")),
      extendedProps: { resourceId: entry.id },
    })),
    ...meetings
      .filter((entry) => entry.scheduledAt)
      .map((entry) => ({
        id: `meeting-${entry.id}`,
        title: formatMeetingLabel(entry, t("meetings.occurrenceLabel"), formatDate),
        start: entry.scheduledAt!,
        editable: false,
        className: "hall-calendar-council",
        extendedProps: { meetingReference: entry.reference },
      })),
  ];
  return (
    <div className="hall-calendar" data-testid="calendar-page">
      <div className="calendar-toolbar">
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="calendar-today" onClick={() => calendar.current?.getApi().today()}>
            {t("calendar.today")}
          </Button>
          <Button
            variant="ghost"
            data-testid="calendar-previous"
            aria-label={t("calendar.previous")}
            onClick={() => calendar.current?.getApi().prev()}
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            data-testid="calendar-next"
            aria-label={t("calendar.next")}
            onClick={() => calendar.current?.getApi().next()}
          >
            ›
          </Button>
          <h1>{title}</h1>
        </div>
        <div className="flex gap-2">
          <div className="flex">
            {(
              [
                { id: "dayGridMonth", label: "calendar.month" },
                { id: "timeGridWeek", label: "calendar.week" },
                { id: "timeGridDay", label: "calendar.day" },
              ] as const
            ).map((item) => (
              <Button
                key={item.id}
                variant={view === item.id ? "secondary" : "ghost"}
                data-testid={`calendar-view-${item.id}`}
                onClick={() => calendar.current?.getApi().changeView(item.id)}
              >
                {t(item.label)}
              </Button>
            ))}
          </div>
          {resources.collectionCapabilities.create && (
            <Button
              data-testid="calendar-new"
              onClick={() => {
                setName("");
                setDraft(emptyEventDocument());
              }}
            >
              {t("workspace.createEvent")}
            </Button>
          )}
        </div>
      </div>
      <div className="calendar-legend">
        <span className="calendar-legend-event">{t("workspace.type.event")}</span>
        <span className="calendar-legend-council">{t("navigation.meetings")}</span>
      </div>
      {loading && <p role="status">{t("calendar.loading")}</p>}
      {error && <p role="alert">{t("calendar.error")}</p>}
      <FullCalendar
        ref={calendar}
        plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={locale === "fr" ? frLocale : "en"}
        initialView="dayGridMonth"
        headerToolbar={false}
        height="100%"
        events={events}
        firstDay={1}
        nowIndicator
        selectable={resources.collectionCapabilities.create}
        editable={!saving}
        eventDurationEditable={!saving}
        datesSet={(info) => {
          setTitle(info.view.title);
          setView(info.view.type);
        }}
        select={(info) => {
          setName("");
          setDraft({
            ...emptyEventDocument(),
            schedule: info.allDay
              ? { kind: "allDay", start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) }
              : { kind: "timed", start: info.startStr, end: info.endStr },
          });
          calendar.current?.getApi().unselect();
        }}
        eventClick={(info) => {
          const props = info.event.extendedProps;
          if (props.meetingReference) navigate(`/meetings/${props.meetingReference}`);
          else {
            const resource = resources.details[props.resourceId];
            if (resource) setSelectedResourceId(resource.id);
          }
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
        eventDidMount={(info) => {
          info.el.dataset.testid = `calendar-event-${info.event.id}`;
        }}
        dayCellDidMount={(info) => {
          info.el.dataset.testid = `calendar-day-${localDate(info.date)}`;
        }}
      />
      {meetings.some((meeting) => !meeting.scheduledAt) && (
        <div className="calendar-undated">
          <span>{t("calendar.undated")}</span>
          {meetings
            .filter((meeting) => !meeting.scheduledAt)
            .map((meeting) => (
              <Button
                variant="ghost"
                key={meeting.id}
                data-testid={`calendar-undated-${meeting.id}`}
                onClick={() => navigate(`/meetings/${meeting.reference}`)}
              >
                {formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
              </Button>
            ))}
        </div>
      )}
      {selectedResourceId && (
        <ResourcePreview resourceId={selectedResourceId} onClose={() => setSelectedResourceId(null)} />
      )}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[var(--hall-size-modal)]">
          <DialogHeader>
            <DialogTitle>{t("workspace.createEvent")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form
              className="grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (saving) return;
                setSaving(true);
                const created = await resources.create({ kind: "event", path, name, document: draft });
                setSaving(false);
                if (created) setDraft(null);
                else setError(true);
              }}
            >
              <div>
                <Label htmlFor="calendar-name">{t("calendar.title")}</Label>
                <Input
                  id="calendar-name"
                  data-testid="calendar-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="calendar-folder">{t("calendar.folder")}</Label>
                <Input
                  id="calendar-folder"
                  data-testid="calendar-folder"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
              </div>
              <EventFields value={draft} onChange={setDraft} readOnly={saving} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="calendar-cancel"
                  disabled={saving}
                  onClick={() => setDraft(null)}
                >
                  {t("calendar.cancel")}
                </Button>
                <Button
                  data-testid="calendar-create"
                  disabled={saving || !name.trim() || !eventDocumentSchema.safeParse(draft).success}
                >
                  {t("calendar.create")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
