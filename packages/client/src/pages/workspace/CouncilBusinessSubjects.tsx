import type { PreparedCouncilSubject } from "@hall/api-contract";
import { useState } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../components/ui/context-menu";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { CalendarAddIcon, ChevronRightIcon } from "../../components/icons";
import { BusinessSubjectHistory } from "./BusinessSubjectHistory";
import { CouncilBusinessSchedule } from "./CouncilBusinessSchedule";
import { useBusinessScheduling } from "./useBusinessScheduling";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import { AgendaSubjectGlyph, agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { useResourceRename } from "../../features/resources/useResourceRename";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";

function SubjectRow({
  subject,
  businessId,
  revision,
  expanded,
  scheduling,
  onExpand,
  onSchedule,
}: {
  subject: PreparedCouncilSubject;
  businessId: string;
  revision: number;
  expanded: boolean;
  scheduling: ReturnType<typeof useBusinessScheduling>;
  onExpand(): void;
  onSchedule(meetingIds: string[]): void;
}) {
  const { t } = useI18n();
  const rename = useResourceRename({
    resourceId: subject.textResourceId,
    testId: `business-subject-rename-${subject.id}`,
    onRenamed: () => useCouncilBusinessStore.getState().loadPreparedSubjects(),
  });
  const meetingIds = scheduling.available[`${subject.kind}:${subject.id}`] ?? [];
  return (
    <li className="business-subject-item" data-testid={`business-subject-${subject.id}`}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            className={`business-subject-row${expanded ? " business-subject-row-open" : ""}`}
            data-testid={`business-subject-${subject.id}-open`}
            type="button"
            aria-expanded={expanded}
            onClick={onExpand}
          >
            <span className="business-subject-row-icon">
              <AgendaSubjectGlyph kind={subject.kind} tree />
            </span>
            <span className="business-subject-row-title">{subject.title}</span>
            <ChevronRightIcon className="business-subject-row-chevron" aria-hidden="true" />
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {rename.menuItem}
          {!scheduling.loading && !scheduling.error && meetingIds.length > 0 ? (
            <ContextMenuItem
              data-testid={`business-subject-schedule-${subject.id}`}
              onSelect={() => onSchedule(meetingIds)}
            >
              <CalendarAddIcon />
              {t("workspace.scheduleInMeeting")}
            </ContextMenuItem>
          ) : null}
          {scheduling.loading ? (
            <p className="business-menu-hint">{t("common.loading")}</p>
          ) : scheduling.error ? (
            <RequestErrorBanner error={scheduling.error} />
          ) : !meetingIds.length ? (
            <p className="business-menu-hint" data-testid={`business-subject-schedule-unavailable-${subject.id}`}>
              {t("workspace.noAvailableScheduling")}
            </p>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      {expanded ? (
        <div className="business-subject-detail">
          <InlineResourceContent resourceId={subject.textResourceId} compact />
          <BusinessSubjectHistory businessId={businessId} subjectId={subject.id} revision={revision} />
        </div>
      ) : null}
      {rename.dialog}
    </li>
  );
}

function SubjectSection({
  kind,
  businessId,
  subjects,
  capabilities,
  revision,
  scheduling,
  expandedSubjectId,
  onExpand,
  onSchedule,
}: {
  kind: "councilDecisionProposal" | "openQuestion";
  businessId: string;
  subjects: PreparedCouncilSubject[];
  capabilities: ReturnType<typeof useCouncilBusinessStore.getState>["capabilitiesById"][string] | undefined;
  revision: number;
  scheduling: ReturnType<typeof useBusinessScheduling>;
  expandedSubjectId: string | null;
  onExpand(id: string): void;
  onSchedule(subject: PreparedCouncilSubject, meetingIds: string[]): void;
}) {
  const { t } = useI18n();
  const presentation = agendaSubjectPresentation[kind];
  return (
    <WorkspaceCreateMenu
      compact
      testId={`business-create-${kind}`}
      canCreate={() => false}
      onCreate={async () => false}
      extraOptions={
        capabilities?.createPreparedSubject
          ? [
              {
                id: kind,
                label: t(presentation.label),
                icon: presentation.icon,
                create: async (name) =>
                  Boolean(
                    await useCouncilBusinessStore
                      .getState()
                      .createPreparedSubject(businessId, { kind, name, content: "" }),
                  ),
              },
            ]
          : []
      }
      render={(trigger) => (
        <section className="business-content-section" data-testid={`business-category-${kind}`}>
          <header className="business-content-section-header">
            <span className="business-content-section-icon">
              <AgendaSubjectGlyph kind={kind} tree />
            </span>
            <h2>{t(kind === "councilDecisionProposal" ? "workspace.proposalCategory" : "workspace.questionCategory")}</h2>
            {subjects.length ? <span className="business-content-section-count">{subjects.length}</span> : null}
            <span className="business-content-section-actions">{trigger}</span>
          </header>
          {subjects.length ? (
            <ul className="business-subject-list">
              {subjects.map((subject) => (
                <SubjectRow
                  key={subject.id}
                  subject={subject}
                  businessId={businessId}
                  revision={revision}
                  expanded={expandedSubjectId === subject.id}
                  scheduling={scheduling}
                  onExpand={() => onExpand(subject.id)}
                  onSchedule={(meetingIds) => onSchedule(subject, meetingIds)}
                />
              ))}
            </ul>
          ) : null}
        </section>
      )}
    />
  );
}

export function CouncilBusinessSubjects({ businessId }: { businessId: string }) {
  const { t } = useI18n();
  const [scheduledSubject, setScheduledSubject] = useState<{ id: string; title: string; meetingIds: string[] } | null>(
    null,
  );
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const scheduling = useBusinessScheduling(businessId, revision);
  const subjects = useCouncilBusinessStore((state) => state.preparedSubjects);
  const capabilities = useCouncilBusinessStore((state) => state.capabilitiesById[businessId]);
  return (
    <div className="business-content-sections">
      {(["councilDecisionProposal", "openQuestion"] as const).map((kind) => (
        <SubjectSection
          key={kind}
          kind={kind}
          businessId={businessId}
          subjects={subjects.filter((subject) => subject.councilBusinessId === businessId && subject.kind === kind)}
          capabilities={capabilities}
          revision={revision}
          scheduling={scheduling}
          expandedSubjectId={expandedSubjectId}
          onExpand={(id) => setExpandedSubjectId((current) => (current === id ? null : id))}
          onSchedule={(subject, meetingIds) => setScheduledSubject({ ...subject, meetingIds })}
        />
      ))}
      <Modal
        open={scheduledSubject !== null}
        title={scheduledSubject?.title ?? t("meeting.addToAgenda")}
        testId="business-schedule-dialog"
        onClose={() => setScheduledSubject(null)}
      >
        {scheduledSubject ? (
          <CouncilBusinessSchedule
            businessId={businessId}
            subjectId={scheduledSubject.id}
            meetingIds={scheduledSubject.meetingIds}
            onScheduled={() => {
              setScheduledSubject(null);
              setRevision((value) => value + 1);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
