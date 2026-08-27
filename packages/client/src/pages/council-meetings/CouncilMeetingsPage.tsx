import { Button, Field } from "@fluentui/react-components";
import { AddRegular, CalendarLtrRegular, ChevronRightRegular, LocationRegular } from "@fluentui/react-icons";
import type { CouncilMeeting } from "@mairie/domain";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import {
  CollectionToolbar,
  EmptyState,
  Input,
  MeetingStatusBadge,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";

export function CouncilMeetingsPage() {
  const { t, formatDateTime } = useI18n();
  const { submitting, run } = useSubmitting();
  const { meetings, create, error } = useCouncilMeetingsStore();
  const { members } = useCouncilMembersStore();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const defaultChair = members.find((member) => member.role === "mayor" && member.active) ?? null;

  const upcomingMeetings = [...meetings]
    .filter((meeting) => ["draft", "scheduled", "inProgress"].includes(meeting.status))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const nextMeeting = upcomingMeetings[0] ?? null;
  const matches = (meeting: CouncilMeeting) => matchesQuery(query, meeting.title, meeting.location);
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
        title: form.get("title"),
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        location: form.get("location"),
        chairMemberId: form.get("chairMemberId") || null,
        secretaryMemberId: form.get("secretaryMemberId") || null,
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
          <Link className="next-meeting-hero" to={`/meetings/${nextMeeting.id}`}>
            <div className="next-meeting-copy">
              <span className="entity-card-eyebrow">{t("dashboard.nextMeeting")}</span>
              <strong>{nextMeeting.title}</strong>
              <span className="next-meeting-facts">
                <span>
                  <CalendarLtrRegular aria-hidden="true" /> {formatDateTime(nextMeeting.startsAt)}
                </span>
                <span>
                  <LocationRegular aria-hidden="true" /> {nextMeeting.location}
                </span>
              </span>
            </div>
            <span className="next-meeting-side">
              <MeetingStatusBadge status={nextMeeting.status} />
              <ChevronRightRegular aria-hidden="true" />
            </span>
          </Link>
        ) : null}

        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setScheduleOpen(true)}>
            {t("meetings.schedule")}
          </Button>
        </CollectionToolbar>

        <Modal open={scheduleOpen} title={t("meetings.schedule")} onClose={() => setScheduleOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <Field label={t("meetings.name")} required>
              <Input name="title" placeholder={t("meetings.namePlaceholder")} required />
            </Field>
            <div className="form-grid">
              <Field label={t("meetings.dateTime")} required>
                <Input name="startsAt" type="datetime-local" required />
              </Field>
              <Field label={t("meetings.location")} required>
                <Input name="location" defaultValue={t("meetings.locationDefault")} required />
              </Field>
            </div>
            <div className="form-grid">
              <Field label={t("meetings.chair")} required>
                <select name="chairMemberId" defaultValue={defaultChair?.id ?? ""} required>
                  <option value="">{t("meetings.chairUndesignated")}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("meetings.secretary")} required>
                <select name="secretaryMemberId" required>
                  <option value="">{t("meetings.secretaryUndesignated")}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button appearance="primary" type="submit" disabled={submitting}>
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
              />
            ) : null}
            {pastMeetings.length > 0 ? (
              <MeetingGroup
                title={t("meetings.past")}
                meetings={pastMeetings}
                layout={layout}
                formatDateTime={formatDateTime}
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
}: {
  title: string;
  meetings: CouncilMeeting[];
  layout: "list" | "cards";
  formatDateTime(value: string): string;
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
            <Link className="entity-card" key={meeting.id} to={`/meetings/${meeting.id}`}>
              <span className="entity-card-eyebrow">{formatDateTime(meeting.startsAt)}</span>
              <strong>{meeting.title}</strong>
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
            <Link className="data-row linked" key={meeting.id} to={`/meetings/${meeting.id}`}>
              <div>
                <strong>{meeting.title}</strong>
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
