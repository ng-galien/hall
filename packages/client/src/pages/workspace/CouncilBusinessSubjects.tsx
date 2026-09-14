import { findSirenAction, type PreparedCouncilSubject, type SirenEntity } from "@hall/api-contract";
import { useMemo, useState } from "react";
import { RequestErrorBanner } from "../../components/Ui";
import { CalendarAddIcon, CloseIcon, EditIcon } from "../../components/icons";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { InlineRenameField } from "../../components/ui/inline-rename-field";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import {
  AgendaSubjectGlyph,
  agendaSubjectPresentation,
} from "../../features/council-meetings/AgendaSubjectGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { useResourceRename } from "../../features/resources/useResourceRename";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, submitSirenAction, type ApiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";

function SubjectTableRow({
  subject, representation, expanded, onExpand,
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
      ? t("workspace.meetingCompact")
          .replace("{number}", String(meeting.number))
          .replace("{date}", formatDate(meeting.scheduledAt))
      : t("workspace.meetingNumberCompact").replace("{number}", String(meeting.number))
    : null;
  const run = (name: "agenda-item.schedule-prepared" | "agenda-item.deprogram") => {
    if (!representation) return;
    setPending(true); setActionError(null);
    void submitSirenAction(representation, name)
      .then(() => useCouncilBusinessStore.getState().refreshPreparedSubject(subject))
      .catch((failure) => setActionError(apiErrorCode(failure)))
      .finally(() => setPending(false));
  };
  return <>
    <tr data-testid={`business-subject-${subject.id}`} className={expanded ? "business-subject-table-row-open" : undefined}>
      <td><Tooltip><TooltipTrigger asChild><span className="business-subject-type"><AgendaSubjectGlyph kind={subject.kind} tree /></span></TooltipTrigger><TooltipContent>{t(agendaSubjectPresentation[subject.kind].label)}</TooltipContent></Tooltip></td>
      <td>
        <div className="business-subject-title-stack">
          <div className="business-subject-title-cell"><InlineRenameField value={subject.title} editing={editingTitle} onEditingChange={(next) => { setEditingTitle(next); if (!next) rename.dismissError(); }} onCommit={rename.commit} label={t("common.rename")} className="workbench-title-inline-input" testId={`business-subject-rename-${subject.id}-name`} invalid={Boolean(rename.error)} onDraftChange={rename.dismissError}><Tooltip><TooltipTrigger asChild><button className="business-subject-title" data-testid={`business-subject-${subject.id}-open`} type="button" aria-expanded={expanded} onClick={onExpand}><span>{subject.title}</span></button></TooltipTrigger><TooltipContent>{subject.title}</TooltipContent></Tooltip></InlineRenameField>{rename.canRename && !editingTitle ? <button type="button" className="workbench-title-edit" data-testid={`business-subject-rename-${subject.id}`} aria-label={`${t("common.edit")} · ${subject.title}`} onClick={() => { rename.dismissError(); setEditingTitle(true); }}><EditIcon aria-hidden="true" /></button> : null}</div>
          {editingTitle && rename.error ? <RequestErrorBanner compact error={rename.error} /> : null}
        </div>
      </td>
      <td><div className="business-subject-table-actions"><span ref={setAutosaveActionsHost} />
        {meeting && meeting.reference && meetingLabel ? <Badge variant="outline" className="business-subject-schedule-badge"><Link data-testid={`business-subject-meeting-${subject.agenda.agendaItemId}`} to={`/meetings/${meeting.reference}`}>{meetingLabel}</Link>{deprogram ? <Button variant="ghost" size="icon-xs" data-testid={`business-subject-unschedule-${subject.id}`} disabled={pending} aria-label={`${t("workspace.unschedule")} · ${meetingLabel}`} onClick={() => run("agenda-item.deprogram")}><CloseIcon /></Button> : null}</Badge> : schedule ? <Button variant="outline" size="xs" data-testid={`business-subject-schedule-${subject.id}`} disabled={pending} onClick={() => run("agenda-item.schedule-prepared")}><CalendarAddIcon />{t("workspace.scheduleInMeeting")}</Button> : null}
        <RequestErrorBanner compact error={actionError} onDismiss={() => setActionError(null)} testId={`business-subject-action-${subject.id}-error-dismiss`} />
      </div></td>
    </tr>
    {expanded ? <tr className="business-subject-table-detail"><td colSpan={3}><InlineResourceContent resourceId={subject.textResourceId} compact actionsHost={autosaveActionsHost} /></td></tr> : null}
  </>;
}

export function CouncilBusinessSubjects({ businessId }: { businessId: string }) {
  const { t } = useI18n();
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
      Boolean(
        await useCouncilBusinessStore.getState().createPreparedSubject(businessId, { kind, name, content: "" }),
      ),
  }));

  return (
    <WorkspaceCreateMenu
      compact
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
        </section>
      )}
    />
  );
}
