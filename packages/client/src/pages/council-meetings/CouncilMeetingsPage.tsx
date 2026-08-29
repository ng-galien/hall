import type { CouncilMeeting } from "@hall/domain";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddIcon, CalendarIcon, ChevronRightIcon, LocationIcon } from "../../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../../components/Ui";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../../features/status/DomainStatusBadge";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";

/** Sentinel for an unassigned officer; SelectItem forbids an empty value. */
const UNDESIGNATED = "none";

function officerId(value: FormDataEntryValue | null): string | null {
  const id = typeof value === "string" ? value : "";
  return id && id !== UNDESIGNATED ? id : null;
}

export function CouncilMeetingsPage() {
  const { t, formatDate, formatDateTime } = useI18n();
  const { submitting, run } = useSubmitting();
  const { meetings, create, error, canCreate } = useCouncilMeetingsStore();
  const { members } = useCouncilMembersStore();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const startsAtFieldId = useId();
  const locationFieldId = useId();
  const chairFieldId = useId();
  const secretaryFieldId = useId();
  const defaultChair = members.find((member) => member.role === "mayor" && member.active) ?? null;
  const meetingLabel = (meeting: CouncilMeeting) =>
    formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate);

  const upcomingMeetings = [...meetings]
    .filter((meeting) => ["draft", "scheduled", "inProgress"].includes(meeting.status))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const nextMeeting = upcomingMeetings[0] ?? null;
  const matches = (meeting: CouncilMeeting) => matchesQuery(query, meetingLabel(meeting), meeting.location);
  const visibleUpcoming = upcomingMeetings.filter((meeting) => meeting.id !== nextMeeting?.id && matches(meeting));
  const pastMeetings = [...meetings]
    .filter((meeting) => ["closed", "cancelled"].includes(meeting.status))
    .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
    .filter(matches);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const created = await create({
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        location: form.get("location"),
        chairMemberId: officerId(form.get("chairMemberId")),
        secretaryMemberId: officerId(form.get("secretaryMemberId")),
      });
      if (created) {
        formElement.reset();
        setScheduleOpen(false);
      }
      return created;
    });
  };

  return (
    <div className="page">
      <PageHeader title={t("meetings.title")} description={t("meetings.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />

        {nextMeeting ? (
          <Link className="next-meeting-hero" to={`/meetings/${nextMeeting.slug}`}>
            <div className="next-meeting-copy">
              <span className="entity-card-eyebrow">{t("dashboard.nextMeeting")}</span>
              <strong>{meetingLabel(nextMeeting)}</strong>
              <span className="next-meeting-facts">
                <span>
                  <CalendarIcon aria-hidden="true" /> {formatDateTime(nextMeeting.startsAt)}
                </span>
                <span>
                  <LocationIcon aria-hidden="true" /> {nextMeeting.location}
                </span>
              </span>
            </div>
            <span className="next-meeting-side">
              <MeetingStatusBadge status={nextMeeting.status} />
              <ChevronRightIcon aria-hidden="true" />
            </span>
          </Link>
        ) : null}

        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          {canCreate ? (
            <Button variant="default" onClick={() => setScheduleOpen(true)}>
              <AddIcon />
              {t("meetings.schedule")}
            </Button>
          ) : null}
        </CollectionToolbar>

        <Modal open={canCreate && scheduleOpen} title={t("meetings.schedule")} onClose={() => setScheduleOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={startsAtFieldId}>{t("meetings.dateTime")}</Label>
                <Input id={startsAtFieldId} name="startsAt" type="datetime-local" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={locationFieldId}>{t("meetings.location")}</Label>
                <Input id={locationFieldId} name="location" defaultValue={t("meetings.locationDefault")} required />
              </div>
            </div>
            <div className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={chairFieldId}>{t("meetings.chair")}</Label>
                <Select name="chairMemberId" defaultValue={defaultChair?.id ?? UNDESIGNATED} required>
                  <SelectTrigger id={chairFieldId} className="w-full">
                    <SelectValue placeholder={t("meetings.chairUndesignated")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNDESIGNATED}>{t("meetings.chairUndesignated")}</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={secretaryFieldId}>{t("meetings.secretary")}</Label>
                <Select name="secretaryMemberId" defaultValue={UNDESIGNATED} required>
                  <SelectTrigger id={secretaryFieldId} className="w-full">
                    <SelectValue placeholder={t("meetings.secretaryUndesignated")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNDESIGNATED}>{t("meetings.secretaryUndesignated")}</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="default" type="submit" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.create")}
            </Button>
          </form>
        </Modal>

        {meetings.length === 0 ? (
          <EmptyState>{t("meetings.empty")}</EmptyState>
        ) : (
          <>
            {visibleUpcoming.length > 0 ? (
              <MeetingGroup
                title={t("meetings.upcoming")}
                meetings={visibleUpcoming}
                layout={layout}
                formatDateTime={formatDateTime}
                meetingLabel={meetingLabel}
              />
            ) : null}
            {pastMeetings.length > 0 ? (
              <MeetingGroup
                title={t("meetings.past")}
                meetings={pastMeetings}
                layout={layout}
                formatDateTime={formatDateTime}
                meetingLabel={meetingLabel}
              />
            ) : null}
            {visibleUpcoming.length === 0 && pastMeetings.length === 0 && !nextMeeting ? (
              <EmptyState>{t("common.noSearchResults")}</EmptyState>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MeetingGroup({
  title,
  meetings,
  layout,
  formatDateTime,
  meetingLabel,
}: {
  title: string;
  meetings: CouncilMeeting[];
  layout: "list" | "cards";
  formatDateTime(value: string): string;
  meetingLabel(meeting: CouncilMeeting): string;
}) {
  return (
    <section className="decision-group">
      <header className="decision-group-heading">
        <span className="decision-group-title">
          <span>
            <strong>{title}</strong>
          </span>
        </span>
      </header>
      {layout === "cards" ? (
        <div className="card-grid">
          {meetings.map((meeting) => (
            <Link className="entity-card" key={meeting.id} to={`/meetings/${meeting.slug}`}>
              <span className="entity-card-eyebrow">{formatDateTime(meeting.startsAt)}</span>
              <strong>{meetingLabel(meeting)}</strong>
              <p>{meeting.location}</p>
              <span className="entity-card-footer">
                <MeetingStatusBadge status={meeting.status} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="data-list">
          {meetings.map((meeting) => (
            <Link className="data-row linked" key={meeting.id} to={`/meetings/${meeting.slug}`}>
              <div>
                <strong>{meetingLabel(meeting)}</strong>
                <span>
                  {formatDateTime(meeting.startsAt)} · {meeting.location}
                </span>
              </div>
              <MeetingStatusBadge status={meeting.status} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
