import type { PreparedCouncilSubject } from "@hall/api-contract";
import { useState } from "react";
import { ExplorerTreeBranch } from "../../components/ui/explorer-tree";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { CalendarAddIcon } from "../../components/icons";
import { BusinessSubjectHistory } from "./BusinessSubjectHistory";
import { CouncilBusinessSchedule } from "./CouncilBusinessSchedule";
import { useBusinessScheduling } from "./useBusinessScheduling";
import { WorkspaceCreateMenu } from "./WorkspaceCreateMenu";
import { AgendaSubjectGlyph, agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { useResourceRename } from "../../features/resources/useResourceRename";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";

function SubjectBranch({
  subject,
  businessId,
  revision,
  scheduling,
  onSchedule,
}: {
  subject: PreparedCouncilSubject;
  businessId: string;
  revision: number;
  scheduling: ReturnType<typeof useBusinessScheduling>;
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
    <>
      <ExplorerTreeBranch
        testId={`business-subject-${subject.id}`}
        title={subject.title}
        contextMenu={
          <>
            {rename.menuItem}
            <ContextMenuItem
              disabled={scheduling.loading || !!scheduling.error || !meetingIds.length}
              data-testid={`business-subject-schedule-${subject.id}`}
              onSelect={() => onSchedule(meetingIds)}
            >
              <CalendarAddIcon />
              {t("workspace.scheduleInMeeting")}
            </ContextMenuItem>
            {scheduling.loading ? (
              <p className="business-menu-hint">{t("common.loading")}</p>
            ) : scheduling.error ? (
              <RequestErrorBanner error={scheduling.error} />
            ) : !meetingIds.length ? (
              <p className="business-menu-hint" data-testid={`business-subject-schedule-unavailable-${subject.id}`}>
                {t("workspace.noAvailableScheduling")}
              </p>
            ) : null}
          </>
        }
      >
        <li>
          <InlineResourceContent
            resourceId={subject.textResourceId}
            heading={t(
              subject.kind === "councilDecisionProposal" ? "workspace.proposalText" : "workspace.questionText",
            )}
          />
        </li>
        <BusinessSubjectHistory businessId={businessId} subjectId={subject.id} revision={revision} />
      </ExplorerTreeBranch>
      {rename.dialog}
    </>
  );
}

export function CouncilBusinessSubjects({ businessId }: { businessId: string }) {
  const { t } = useI18n();
  const [scheduledSubject, setScheduledSubject] = useState<{ id: string; title: string; meetingIds: string[] } | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const scheduling = useBusinessScheduling(businessId, revision);
  const subjects = useCouncilBusinessStore((state) => state.preparedSubjects);
  const capabilities = useCouncilBusinessStore((state) => state.capabilitiesById[businessId]);
  return (
    <>
      {(["councilDecisionProposal", "openQuestion"] as const).map((kind) => (
        <WorkspaceCreateMenu
          key={kind}
          compact
          testId={`business-create-${kind}`}
          canCreate={() => false}
          onCreate={async () => false}
          extraOptions={
            capabilities?.createPreparedSubject
              ? [
                  {
                    id: kind,
                    label: t(agendaSubjectPresentation[kind].label),
                    icon: agendaSubjectPresentation[kind].icon,
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
          render={(trigger, contextItems) => (
            <ExplorerTreeBranch
              testId={`business-category-${kind}`}
              defaultOpen
              title={t(
                kind === "councilDecisionProposal" ? "workspace.proposalCategory" : "workspace.questionCategory",
              )}
              icon={<AgendaSubjectGlyph kind={kind} tree />}
              actions={trigger}
              contextMenu={contextItems}
            >
              {subjects
                .filter((subject) => subject.councilBusinessId === businessId && subject.kind === kind)
                .map((subject) => (
                  <SubjectBranch
                    key={subject.id}
                    subject={subject}
                    businessId={businessId}
                    revision={revision}
                    scheduling={scheduling}
                    onSchedule={(meetingIds) => setScheduledSubject({ ...subject, meetingIds })}
                  />
                ))}
            </ExplorerTreeBranch>
          )}
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
    </>
  );
}
