import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CouncilBusinessIcon, DecisionsIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, RequestErrorBanner } from "../../components/Ui";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { liveBusinessTitle } from "../../features/council-business/presentation";
import { AgendaMinutesApproval } from "../../features/council-meetings/AgendaMinutesApproval";
import {
  agendaSubjectPresentation,
  agendaSubjectTextResource,
} from "../../features/council-meetings/AgendaSubjectGlyph";
import { DocumentaryResourceGlyph } from "../../features/documents/DocumentaryResourceGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { AgendaItemStatusBadge } from "../../features/status/DomainStatusBadge";
import { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import { ScreenTitle } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { PhoneDocumentActions } from "../workspace/PhoneDocumentActions";
import { BallotOutcome, itemBallot } from "./MeetingProceedings";

/** Address of an agenda item read on a phone. */
export function meetingPointHref(meetingReference: string, itemId: string) {
  return `/meetings/${meetingReference}/points/${itemId}`;
}

// @implements-requirement HALL-FR-LAY-010
/** Phone page of an agenda item: its texts, its result and its documents. */
export function MeetingPointPage() {
  const { meetingId = "", pointId = "" } = useParams();
  const phone = usePhoneLayout();
  if (!phone) return <Navigate to={`/meetings/${meetingId}`} replace />;
  return <MeetingPoint meetingId={meetingId} pointId={pointId} />;
}

function MeetingPoint({ meetingId, pointId }: { meetingId: string; pointId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { meeting: aggregate, error } = useCouncilMeeting(meetingId);
  const { members } = useCouncilMembersStore();
  const decisions = useCouncilDecisionsStore((state) => state.councilDecisions);
  useEffect(() => {
    void useCouncilDecisionsStore.getState().load();
  }, []);
  if (error) return <RequestErrorBanner error={error} />;
  if (!aggregate) return <EmptyState>{t("meeting.loading")}</EmptyState>;
  const item = aggregate.agendaItems.find((candidate) => candidate.id === pointId);
  if (!item) return <Navigate to={`/meetings/${meetingId}`} replace />;
  const business = item.business;
  const title = liveBusinessTitle(business, t("agendaSubject.minutesApproval"));
  const ballot = itemBallot(aggregate, item);
  const textResourceId = agendaSubjectTextResource(item.subject);
  const decision = decisions.find((candidate) => candidate.proposalId === business.councilDecisionId);
  const submittedText = item.councilDecisionSnapshot?.draftText;
  const subjectLabel = t(agendaSubjectPresentation[item.subjectKind].label);
  const closed = aggregate.meeting.status === "closed" || aggregate.meeting.status === "cancelled";
  return (
    <article className="phone-point" data-testid={`meeting-point-${item.id}`}>
      <ScreenTitle>
        {item.agendaNumber === null ? title : t("meeting.pointNumber", { number: String(item.agendaNumber) })}
      </ScreenTitle>
      {business.kind !== "minutesApproval" ? (
        <PhoneDocumentActions
          actions={[
            {
              id: "open-business",
              label: t("meeting.openBusiness"),
              icon: <CouncilBusinessIcon />,
              onSelect: () =>
                navigate(
                  `/workspace?${new URLSearchParams({ councilBusiness: business.id, path: business.folderPath })}`,
                ),
            },
          ]}
        />
      ) : null}
      <header className="phone-point-heading">
        {item.agendaNumber === null ? null : <h2>{title}</h2>}
        <p>
          {subjectLabel !== title ? <span>{subjectLabel}</span> : null}
          {closed ? <AgendaItemStatusBadge status={item.status} /> : null}
        </p>
      </header>
      {ballot ? (
        <BallotOutcome
          ballot={ballot}
          members={members.filter((member) => aggregate.rosterMemberIds.includes(member.id))}
          isMinutes={item.subjectKind === "minutesApproval"}
          defaultCollapsed
        />
      ) : null}
      {business.kind === "minutesApproval" && business.minutesId ? (
        <AgendaMinutesApproval minutesId={business.minutesId} itemId={item.id} />
      ) : null}
      {business.report ? (
        <section className="phone-point-text">
          <h3>{t("meeting.itemReport")}</h3>
          <MarkdownView markdown={business.report} />
        </section>
      ) : null}
      {submittedText ? (
        <section className="phone-point-text">
          <h3>{t("report.submittedText")}</h3>
          <MarkdownView markdown={submittedText} />
        </section>
      ) : textResourceId ? (
        <section className="phone-point-text">
          <h3>{subjectLabel}</h3>
          <InlineResourceContent resourceId={textResourceId} compact readOnly />
        </section>
      ) : null}
      {item.discussionSummary ? (
        <section className="phone-point-text">
          <h3>{t("report.sessionNotes")}</h3>
          <MarkdownView markdown={item.discussionSummary} />
        </section>
      ) : null}
      {decision || business.resources.length ? (
        <ListRows data-testid="meeting-point-documents">
          {decision ? (
            <ListRow
              to={`/council-decisions/${decision.id}`}
              openTestId={`meeting-point-decision-${decision.id}`}
              head={
                <ListRowIcon nature="council">
                  <DecisionsIcon />
                </ListRowIcon>
              }
              title={t("meeting.point.decision")}
            />
          ) : null}
          {business.resources.map((resource) => (
            <ListRow
              key={resource.id}
              to={`/workspace?${new URLSearchParams({ path: resource.path, resource: resource.id })}`}
              openTestId={`meeting-point-document-${resource.id}`}
              head={<DocumentaryResourceGlyph resource={resource} />}
              title={resource.name}
            />
          ))}
        </ListRows>
      ) : null}
    </article>
  );
}
