import type { MinutesFacts as Facts } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SaveStatusIndicator } from "@/components/ui/save-status-indicator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { UndoIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { useI18n } from "../../i18n/I18nProvider";
import { MinutesAgendaFacts } from "./MinutesFacts";
import type { MinutesSaveStatus } from "./useMinutesDraft";

type MinutesPointProps = {
  item: Facts["agenda"][number];
  ballots: Facts["ballots"];
  editorialText: string;
  saveStatus: MinutesSaveStatus;
  canEdit: boolean;
  generating: boolean;
  onEdit(value: string): void;
  onBlur(): void;
};

// @implements-requirement HALL-FR-MIN-250
export function MinutesPoint({
  item,
  ballots,
  editorialText,
  saveStatus,
  canEdit,
  generating,
  onEdit,
  onBlur,
}: MinutesPointProps) {
  const { t, formatNumber } = useI18n();
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const saveStatusLabels: Record<MinutesSaveStatus, string> = {
    idle: t("workspace.saved"),
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };
  const title = matchLiteral(item.kind, {
    minutesApproval: () => t("agendaSubject.minutesApproval"),
    councilDecisionProposal: () => item.title,
    openQuestion: () => item.title,
  });
  const hasEditorialChanges = editorialText !== item.discussionSummary;

  return (
    <section className="admin-record minutes-point" aria-labelledby={`minutes-section-title-${item.id}`}>
      <h3 className="minutes-point-title" id={`minutes-section-title-${item.id}`}>
        <span>{formatNumber(item.agendaNumber)}</span>
        <strong>{title}</strong>
      </h3>
      <MinutesAgendaFacts item={item} ballots={ballots} />
      <Tabs className="minutes-point-editor" defaultValue={canEdit ? "editorial" : "source"}>
        <div className="minutes-point-tabbar">
          <TabsList aria-label={t("minutes.textVersions")}>
            <TabsTrigger value="source" data-testid={`minutes-source-tab-${item.id}`}>
              {t("minutes.sourceNotes")}
            </TabsTrigger>
            <TabsTrigger value="editorial" data-testid={`minutes-editorial-tab-${item.id}`}>
              {t("minutes.editorialDraft")}
            </TabsTrigger>
          </TabsList>
          {canEdit ? (
            <div className="minutes-editorial-controls">
              <SaveStatusIndicator
                status={saveStatus}
                label={saveStatusLabels[saveStatus]}
                testId={`minutes-section-save-status-${item.id}`}
              />
              {hasEditorialChanges ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="minutes-restore-trigger">
                      <Button
                        variant="plain"
                        size="icon"
                        data-testid={`minutes-restore-source-${item.id}`}
                        aria-label={t("minutes.restoreSourceTooltip")}
                        disabled={generating}
                        onClick={() => setConfirmingRestore(true)}
                      >
                        <UndoIcon aria-hidden="true" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("minutes.restoreSourceTooltip")}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
        </div>
        <TabsContent value="source" data-testid={`minutes-source-panel-${item.id}`}>
          {item.discussionSummary ? (
            <MarkdownView className="minutes-source-notes" markdown={item.discussionSummary} />
          ) : (
            <p className="minutes-empty-text">{t("minutes.noSourceNotes")}</p>
          )}
        </TabsContent>
        <TabsContent value="editorial" data-testid={`minutes-editorial-panel-${item.id}`}>
          {canEdit ? (
            <>
              <MarkdownEditor
                testId={`minutes-section-${item.id}`}
                markdown={editorialText}
                onChange={onEdit}
                onBlur={onBlur}
                readOnly={generating}
              />
              <Dialog
                open={confirmingRestore}
                onOpenChange={(open) => {
                  if (!generating) setConfirmingRestore(open);
                }}
              >
                <DialogContent closeLabel={t("common.close")} data-testid={`minutes-restore-source-dialog-${item.id}`}>
                  <DialogTitle>{t("minutes.restoreSourceTitle")}</DialogTitle>
                  <DialogDescription>{t("minutes.restoreSourceConfirmation")}</DialogDescription>
                  <div className="minutes-restore-dialog-actions">
                    <Button variant="secondary" onClick={() => setConfirmingRestore(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      data-testid={`minutes-restore-source-confirm-${item.id}`}
                      onClick={() => {
                        onEdit(item.discussionSummary);
                        setConfirmingRestore(false);
                      }}
                    >
                      {t("minutes.restoreSourceNotes")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <MarkdownView markdown={editorialText} />
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
