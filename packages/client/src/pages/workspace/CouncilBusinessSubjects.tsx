import { findSirenAction, type PreparedCouncilSubject, type SirenEntity } from "@hall/api-contract";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarAddIcon, CloseIcon, EditIcon, GavelIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { InlineRenameField } from "../../components/ui/inline-rename-field";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { AgendaSubjectGlyph, agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { useResourceRename } from "../../features/resources/useResourceRename";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, submitSirenAction } from "../../services/apiClient";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import type { PhoneDocumentAction } from "./PhoneDocumentActions";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";

function useSubjectMeetingLabel(subject: PreparedCouncilSubject | undefined) {
  const { t, formatDate } = useI18n();
  const meeting = subject?.agenda.meeting;
  if (!meeting?.number) return null;
  return meeting.scheduledAt
    ? t("workspace.meetingCompact", { number: String(meeting.number), date: formatDate(meeting.scheduledAt) })
    : t("workspace.meetingNumberCompact", { number: String(meeting.number) });
}

function PhoneSubjectRow({ subject, business }: { subject: PreparedCouncilSubject; business: string }) {
  const folderPath = useCouncilBusinessStore(
    (state) => state.businesses.find((candidate) => candidate.id === business)?.folderPath ?? "",
  );
  const meetingLabel = useSubjectMeetingLabel(subject);
  return (
    <ListRow
      to={`/workspace?${new URLSearchParams({ path: folderPath, resource: subject.textResourceId, fromBusiness: business })}`}
      openTestId={`business-subject-${subject.id}-open`}
      head={<AgendaSubjectGlyph kind={subject.kind} tree />}
      title={subject.title}
      detail={meetingLabel ?? undefined}
    />
  );
}

/** Actions the server grants on a prepared subject, for the page of its text. */
export function usePreparedSubjectPhoneActions(
  textResourceId: string | null,
  businessId: string | null,
  onError: (error: ApiErrorCode | null) => void,
): PhoneDocumentAction[] {
  const { t } = useI18n();
  const navigate = useNavigate();
  const subject = useCouncilBusinessStore((state) =>
    state.preparedSubjects.find((candidate) => candidate.textResourceId === textResourceId),
  );
  const representation = useCouncilBusinessStore((state) =>
    subject ? state.preparedSubjectRepresentations[`${subject.kind}:${subject.id}`] : undefined,
  );
  const meetingLabel = useSubjectMeetingLabel(subject);
  useEffect(() => {
    if (businessId) void useCouncilBusinessStore.getState().loadPreparedSubjects(businessId);
  }, [businessId]);
  if (!subject) return [];
  const run = (name: "agenda-item.schedule-prepared" | "agenda-item.deprogram") => {
    if (!representation) return;
    onError(null);
    void submitSirenAction(representation, name)
      .then(() => useCouncilBusinessStore.getState().refreshPreparedSubject(subject))
      .catch((failure) => onError(apiErrorCode(failure)));
  };
  const reference = subject.agenda.meeting?.reference;
  return [
    ...(reference && meetingLabel
      ? [
          {
            id: "subject-meeting",
            label: meetingLabel,
            icon: <GavelIcon />,
            onSelect: () => navigate(`/meetings/${reference}`),
          },
        ]
      : []),
    ...(representation && findSirenAction(representation, "agenda-item.schedule-prepared")
      ? [
          {
            id: "subject-schedule",
            label: t("workspace.scheduleInMeeting"),
            icon: <CalendarAddIcon />,
            onSelect: () => run("agenda-item.schedule-prepared"),
          },
        ]
      : []),
    ...(representation && findSirenAction(representation, "agenda-item.deprogram")
      ? [
          {
            id: "subject-unschedule",
            label: t("workspace.unschedule"),
            icon: <CloseIcon />,
            onSelect: () => run("agenda-item.deprogram"),
          },
        ]
      : []),
  ];
}

function SubjectTableRow({
  subject,
  representation,
  expanded,
  onExpand,
}: {
  subject: PreparedCouncilSubject;
  representation: SirenEntity | undefined;
  expanded: boolean;
  onExpand(): void;
}) {
  const { t, formatDate } = useI18n();
  const [autosaveActionsHost, setAutosaveActionsHost] = useState<HTMLSpanElement | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const rename = useResourceRename({
    resourceId: subject.textResourceId,
    testId: `business-subject-rename-${subject.id}`,
    onRenamed: () => useCouncilBusinessStore.getState().refreshPreparedSubject(subject),
  });
  const schedule = representation && findSirenAction(representation, "agenda-item.schedule-prepared");
  const deprogram = representation && findSirenAction(representation, "agenda-item.deprogram");
  const meeting = subject.agenda.meeting;
  const meetingLabel = meeting?.number
    ? meeting.scheduledAt
      ? t("workspace.meetingCompact", { number: String(meeting.number), date: formatDate(meeting.scheduledAt) })
      : t("workspace.meetingNumberCompact", { number: String(meeting.number) })
    : null;
  const run = (name: "agenda-item.schedule-prepared" | "agenda-item.deprogram") => {
    if (!representation) return;
    setPending(true);
    setActionError(null);
    void submitSirenAction(representation, name)
      .then(() => useCouncilBusinessStore.getState().refreshPreparedSubject(subject))
      .catch((failure) => setActionError(apiErrorCode(failure)))
      .finally(() => setPending(false));
  };
  return (
    <>
      <tr
        data-testid={`business-subject-${subject.id}`}
        className={expanded ? "business-subject-table-row-open" : undefined}
      >
        <td>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="business-subject-type">
                <AgendaSubjectGlyph kind={subject.kind} tree />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t(agendaSubjectPresentation[subject.kind].label)}</TooltipContent>
          </Tooltip>
        </td>
        <td>
          <div className="business-subject-title-stack">
            <div className="business-subject-title-cell">
              <InlineRenameField
                value={subject.title}
                editing={editingTitle}
                onEditingChange={(next) => {
                  setEditingTitle(next);
                  if (!next) rename.dismissError();
                }}
                onCommit={rename.commit}
                label={t("common.rename")}
                className="hall-input workbench-title-inline-input"
                testId={`business-subject-rename-${subject.id}-name`}
                invalid={Boolean(rename.error)}
                onDraftChange={rename.dismissError}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="plain"
                      className="business-subject-title"
                      data-testid={`business-subject-${subject.id}-open`}
                      aria-expanded={expanded}
                      onClick={onExpand}
                    >
                      <span>{subject.title}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{subject.title}</TooltipContent>
                </Tooltip>
              </InlineRenameField>
              {rename.canRename && !editingTitle ? (
                <Button
                  variant="plain"
                  size="icon"
                  data-testid={`business-subject-rename-${subject.id}`}
                  aria-label={`${t("common.edit")} · ${subject.title}`}
                  onClick={() => {
                    rename.dismissError();
                    setEditingTitle(true);
                  }}
                >
                  <EditIcon aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            {editingTitle && rename.error ? <RequestErrorBanner compact error={rename.error} /> : null}
          </div>
        </td>
        <td>
          <div className="business-subject-table-actions">
            <span ref={setAutosaveActionsHost} />
            {meeting?.reference && meetingLabel ? (
              <span className="business-subject-schedule">
                <Link
                  data-testid={`business-subject-meeting-${subject.agenda.agendaItemId}`}
                  to={`/meetings/${meeting.reference}`}
                >
                  {meetingLabel}
                </Link>
                {deprogram ? (
                  <Button
                    variant="plain"
                    size="icon"
                    data-testid={`business-subject-unschedule-${subject.id}`}
                    disabled={pending}
                    aria-label={`${t("workspace.unschedule")} · ${meetingLabel}`}
                    onClick={() => run("agenda-item.deprogram")}
                  >
                    <CloseIcon />
                  </Button>
                ) : null}
              </span>
            ) : schedule ? (
              <Button
                variant="secondary"
                data-testid={`business-subject-schedule-${subject.id}`}
                disabled={pending}
                onClick={() => run("agenda-item.schedule-prepared")}
              >
                <CalendarAddIcon />
                {t("workspace.scheduleInMeeting")}
              </Button>
            ) : null}
            <RequestErrorBanner
              compact
              error={actionError}
              onDismiss={() => setActionError(null)}
              testId={`business-subject-action-${subject.id}-error-dismiss`}
            />
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="business-subject-table-detail">
          <td colSpan={3}>
            <InlineResourceContent resourceId={subject.textResourceId} compact actionsHost={autosaveActionsHost} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function CouncilBusinessSubjects({ businessId }: { businessId: string }) {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(() => new Set());
  const subjects = useCouncilBusinessStore((state) => state.preparedSubjects);
  const subjectRepresentations = useCouncilBusinessStore((state) => state.preparedSubjectRepresentations);
  const capabilities = useCouncilBusinessStore((state) => state.capabilitiesById[businessId]);
  const sortedSubjects = useMemo(
    () =>
      subjects
        .filter((subject) => subject.councilBusinessId === businessId)
        .slice()
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)),
    [businessId, subjects],
  );

  const options = (["councilDecisionProposal", "openQuestion"] as const).map((kind) => ({
    id: kind,
    label: t(agendaSubjectPresentation[kind].label),
    icon: agendaSubjectPresentation[kind].icon,
    create: async (name: string) =>
      Boolean(await useCouncilBusinessStore.getState().createPreparedSubject(businessId, { kind, name, content: "" })),
  }));

  return (
    <WorkspaceCreateMenu
      placement="inline"
      testId="business-create-subject"
      canCreate={() => false}
      onCreate={async () => false}
      extraOptions={capabilities?.createPreparedSubject ? options : []}
      getError={() => useCouncilBusinessStore.getState().error}
      clearError={() => useCouncilBusinessStore.setState({ error: null })}
      render={(trigger) => (
        <section className="business-subject-table-section" data-testid="business-subject-table">
          <header className="business-content-section-header">
            <h2>{t("workspace.preparedItems")}</h2>
            <span className="business-content-section-actions">{trigger}</span>
          </header>
          {phone ? (
            <ListRows className="business-phone-list" data-testid="business-phone-subjects">
              {sortedSubjects.map((subject) => (
                <PhoneSubjectRow key={subject.id} subject={subject} business={businessId} />
              ))}
            </ListRows>
          ) : (
            <table className="business-subject-table">
              <colgroup>
                <col className="business-subject-table-type-column" />
                <col />
                <col className="business-subject-table-actions-column" />
              </colgroup>
              <tbody>
                {sortedSubjects.map((subject) => (
                  <SubjectTableRow
                    key={subject.id}
                    subject={subject}
                    expanded={expandedSubjectIds.has(subject.id)}
                    representation={subjectRepresentations[`${subject.kind}:${subject.id}`]}
                    onExpand={() =>
                      setExpandedSubjectIds((current) => {
                        const next = new Set(current);
                        if (next.has(subject.id)) next.delete(subject.id);
                        else next.add(subject.id);
                        return next;
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    />
  );
}
