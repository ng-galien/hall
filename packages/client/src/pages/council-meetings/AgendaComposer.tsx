import { type DragEvent, type FormEvent, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import {
  AddIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DeleteIcon,
  DragHandleIcon,
  TextDocumentIcon,
  VisibleIcon,
  GavelIcon,
} from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, Modal } from "../../components/Ui";
import { councilBusinessKindKeys, liveBusinessTitle } from "../../features/council-business/presentation";
import { AgendaSubjectGlyph, agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { AgendaMinutesApproval } from "../../features/council-meetings/AgendaMinutesApproval";
import { DocumentaryResourceGlyph } from "../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { useResourceImageUpload } from "../../features/documents/useResourceImageUpload";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import {
  type LiveMeetingAgendaItem as AgendaItem,
  liveAgendaBusinessRank as agendaBusinessRank,
  type LiveMeetingBusiness as CouncilBusiness,
  type LiveMeetingCouncilDecision as CouncilDecision,
  liveBusinessHasDecision as councilBusinessHasDecision,
  liveBusinessIsMatter as councilBusinessIsMatter,
} from "../../models/liveMeeting";

export interface QuickCouncilBusinessInput {
  kind: "matter" | "openQuestion";
  title: string;
  report: string;
  folderPath: string;
}

export function councilBusinessUpdatePayload(business: CouncilBusiness, changes: { title?: string; report?: string }) {
  return {
    title: changes.title ?? business.title,
    report: changes.report ?? business.report,
    folderPath: business.folderPath,
    resourceIds: business.resources.map((resource) => resource.id),
  };
}

export function AgendaComposer({
  agendaItems,
  businesses,
  decisions,
  editable,
  onQuickCreate,
  onUpdateBusiness,
  onAttachDecision,
  onDetachDecision,
  onSaveDecisionText,
  onRemove,
  onReorder,
}: {
  agendaItems: AgendaItem[];
  businesses: CouncilBusinessView[];
  decisions: CouncilDecision[];
  editable: boolean;
  onQuickCreate?(input: QuickCouncilBusinessInput, position: number): Promise<boolean>;
  onUpdateBusiness?(businessId: string, input: Record<string, unknown>): Promise<boolean>;
  onAttachDecision?(businessId: string, draftText: string): Promise<boolean>;
  onDetachDecision?(businessId: string): Promise<boolean>;
  onSaveDecisionText?(decisionId: string, input: { title: string; draftText: string }): Promise<boolean>;
  onRemove(itemId: string): Promise<boolean>;
  onReorder(itemIds: string[]): Promise<boolean>;
}) {
  const { t } = useI18n();
  const { canUpload: canUploadImage, uploadImage } = useResourceImageUpload();
  const { submitting, run } = useSubmitting();
  const fieldId = useId();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const [draftReport, setDraftReport] = useState("");
  const mentionables = useReferenceMentionables();
  const [draftDecisionText, setDraftDecisionText] = useState("");
  const decisionFor = (business: CouncilBusiness) =>
    councilBusinessHasDecision(business)
      ? (decisions.find((decision) => decision.id === business.councilDecisionId) ?? null)
      : null;
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const orderedItems = useMemo(
    () => [...agendaItems].sort((left, right) => left.position - right.position),
    [agendaItems],
  );
  const nextPosition = Math.max(0, ...agendaItems.map((item) => item.position)) + 1;
  const scheduledBusinessIds = new Set(agendaItems.map((item) => item.business.id));
  const candidateBusinesses = businesses
    .filter((business) => !scheduledBusinessIds.has(business.id))
    .sort((left, right) => left.title.localeCompare(right.title));

  const moveItem = (itemId: string, offset: number) => {
    const ids = orderedItems.map((item) => item.id);
    const index = ids.indexOf(itemId);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    if (agendaBusinessRank(orderedItems[index].business) !== agendaBusinessRank(orderedItems[target].business)) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => onReorder(ids));
  };

  const dropOn = (targetItemId: string) => {
    setDropTargetItemId(null);
    if (!draggedItemId || draggedItemId === targetItemId) return;
    const draggedItem = orderedItems.find((item) => item.id === draggedItemId);
    const targetItem = orderedItems.find((item) => item.id === targetItemId);
    if (
      !draggedItem ||
      !targetItem ||
      agendaBusinessRank(draggedItem.business) !== agendaBusinessRank(targetItem.business)
    ) {
      return;
    }
    const ids = orderedItems.map((item) => item.id).filter((id) => id !== draggedItemId);
    ids.splice(
      ids.indexOf(targetItemId) +
        (orderedItems.findIndex((item) => item.id === draggedItemId) <
        orderedItems.findIndex((item) => item.id === targetItemId)
          ? 1
          : 0),
      0,
      draggedItemId,
    );
    void run(() => onReorder(ids));
  };

  const quickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onQuickCreate) return;
    const formElement = event.currentTarget;
    await run(async () => {
      const form = new FormData(formElement);
      const added = await onQuickCreate(
        {
          kind: "openQuestion",
          title: String(form.get("title") ?? ""),
          report: "",
          folderPath: "",
        },
        nextPosition,
      );
      if (added) {
        formElement.reset();
        setQuickAddOpen(false);
      }
      return added;
    });
  };

  const expandItem = (item: AgendaItem | null) => {
    setExpandedItemId(item?.id ?? null);
    setDraftReport(item?.business.report ?? "");
    setDraftDecisionText(item ? (decisionFor(item.business)?.draftText ?? "") : "");
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>, item: AgendaItem) => {
    event.preventDefault();
    if (!onUpdateBusiness) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? item.business.title);
    const decision = decisionFor(item.business);
    await run(async () => {
      const saved = await onUpdateBusiness(
        item.business.id,
        councilBusinessUpdatePayload(item.business, { title, report: draftReport }),
      );
      if (!saved) return false;
      if (decision && draftDecisionText !== decision.draftText) {
        if (!onSaveDecisionText) return false;
        const decisionSaved = await onSaveDecisionText(decision.id, { title, draftText: draftDecisionText });
        if (!decisionSaved) return false;
      }
      setExpandedItemId(null);
      return true;
    });
  };

  return (
    <section className="agenda-composer" aria-labelledby="agenda-heading">
      <header className="agenda-composer-heading">
        <div>
          <h2 id="agenda-heading">{t("meeting.agenda")}</h2>
          <p>{t(editable ? "meeting.composerDescription" : "meeting.composerLocked")}</p>
        </div>
        {editable && onQuickCreate ? <Button data-testid="agenda-question-create" variant="outline" size="sm" onClick={() => setQuickAddOpen(true)}><AddIcon />{t("agendaSubject.openQuestion")}</Button> : null}
      </header>

      {orderedItems.length === 0 ? (
        <EmptyState>{t("meeting.emptyAgenda")}</EmptyState>
      ) : (
        <ol className="composer-list">
          {orderedItems.map((item, index) => {
            const expanded = expandedItemId === item.id;
            const business = item.business;
            const presentation = agendaSubjectPresentation[item.subjectKind];
            return (
              <li
                className={`composer-item${dropTargetItemId === item.id ? " composer-item-drop" : ""}${draggedItemId === item.id ? " composer-item-dragging" : ""}`}
                key={item.id}
                draggable={editable && !expanded}
                onDragStart={(event: DragEvent) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedItemId(item.id);
                }}
                onDragEnd={() => {
                  setDraggedItemId(null);
                  setDropTargetItemId(null);
                }}
                onDragOver={(event: DragEvent) => {
                  if (!draggedItemId) return;
                  const draggedItem = orderedItems.find((candidate) => candidate.id === draggedItemId);
                  if (!draggedItem || agendaBusinessRank(draggedItem.business) !== agendaBusinessRank(item.business)) {
                    return;
                  }
                  event.preventDefault();
                  setDropTargetItemId(item.id);
                }}
                onDragLeave={() => setDropTargetItemId((current) => (current === item.id ? null : current))}
                onDrop={(event: DragEvent) => {
                  event.preventDefault();
                  dropOn(item.id);
                }}
              >
                <div className="composer-item-row">
                  {editable ? (
                    <span className="composer-grip" aria-hidden="true">
                      <DragHandleIcon />
                    </span>
                  ) : null}
                  <span className="composer-position">{index + 1}</span>
                  <AgendaSubjectGlyph kind={item.subjectKind} />
                  <button
                    className="composer-item-main"
                    data-testid={`agenda-item-expand-${item.id}`}
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => expandItem(expanded ? null : item)}
                  >
                    <span className="composer-item-copy">
                      <strong>{liveBusinessTitle(business, t("agendaSubject.minutesApproval"))}</strong>
                      <span>
                        {business.kind !== "minutesApproval" ? t(presentation.label) : null}
                        {business.folderPath ? ` · ${business.folderPath}` : ""}
                      </span>
                    </span>
                    {presentation.voted ? <span className="composer-vote-indicator"><GavelIcon aria-hidden="true" />{t("live.voteRequired")}</span> : null}
                    {expanded ? <ChevronDownIcon aria-hidden="true" /> : <ChevronRightIcon aria-hidden="true" />}
                  </button>
                  {editable ? (
                    <span className="composer-item-tools">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`agenda-item-up-${item.id}`}
                        aria-label={t("meeting.moveUp")}
                        disabled={
                          submitting ||
                          index === 0 ||
                          agendaBusinessRank(orderedItems[index - 1].business) !== agendaBusinessRank(business)
                        }
                        onClick={() => moveItem(item.id, -1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`agenda-item-down-${item.id}`}
                        aria-label={t("meeting.moveDown")}
                        disabled={
                          submitting ||
                          index === orderedItems.length - 1 ||
                          agendaBusinessRank(orderedItems[index + 1].business) !== agendaBusinessRank(business)
                        }
                        onClick={() => moveItem(item.id, 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`agenda-item-remove-${item.id}`}
                        aria-label={t("meeting.removeItem")}
                        disabled={submitting}
                        onClick={() => void run(() => onRemove(item.id))}
                      >
                        <DeleteIcon />
                      </Button>
                    </span>
                  ) : null}
                </div>
                {expanded ? (
                  business.kind === "minutesApproval" ? (
                    business.minutesId ? <AgendaMinutesApproval minutesId={business.minutesId} itemId={item.id} /> : null
                  ) : editable ? (
                    <form className="composer-item-editor" onSubmit={(event) => void saveItem(event, item)}>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`${fieldId}-title`}>{t("meeting.subject")}</Label>
                        <Input id={`${fieldId}-title`} name="title" defaultValue={business.title} required />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>{t("meeting.report")}</Label>
                        <MarkdownEditor
                          testId="agenda-report-editor"
                          markdown={business.report}
                          onChange={setDraftReport}
                          mentionables={mentionables}
                          searchContext={business.folderPath}
                          onUploadImage={
                            canUploadImage
                              ? (file) => uploadImage(file, { kind: "councilBusinessReport", id: business.id })
                              : undefined
                          }
                        />
                        <p className="text-xs text-muted">{t("meeting.reportHint")}</p>
                      </div>
                      {councilBusinessIsMatter(business) ? (
                        decisionFor(business) ? (
                          <div className="grid gap-1.5">
                            <Label>{t("meeting.draftDecision")}</Label>
                            <MarkdownEditor
                              testId="agenda-proposal-editor"
                              markdown={decisionFor(business)?.draftText ?? ""}
                              onChange={setDraftDecisionText}
                              mentionables={mentionables}
                              searchContext={business.folderPath}
                              onUploadImage={
                                canUploadImage
                                  ? (file) =>
                                      uploadImage(file, {
                                        kind: "councilDecisionDraft",
                                        id: decisionFor(business)!.id,
                                      })
                                  : undefined
                              }
                            />
                            <p className="text-xs text-muted">{t("meeting.decisionDraftTextHint")}</p>
                          </div>
                        ) : null
                      ) : null}
                      <div className="composer-editor-actions">
                        {councilBusinessIsMatter(business) ? (
                          decisionFor(business) ? (
                            <Button
                              className="composer-vote-toggle"
                              variant="ghost"
                              type="button"
                              disabled={submitting || !onDetachDecision}
                              onClick={() => onDetachDecision && void run(() => onDetachDecision(business.id))}
                            >
                              {t("meeting.withdrawVote")}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              type="button"
                              disabled={submitting || !onAttachDecision}
                              onClick={() => onAttachDecision && void run(() => onAttachDecision(business.id, ""))}
                            >
                              <GavelIcon />
                              {t("meeting.submitToVote")}
                            </Button>
                          )
                        ) : null}
                        <span className="composer-editor-spacer" />
                        <Button variant="outline" type="button" onClick={() => setExpandedItemId(null)}>
                          {t("common.cancel")}
                        </Button>
                        <Button
                          data-testid="agenda-item-save"
                          variant="default"
                          type="submit"
                          disabled={submitting || !onUpdateBusiness}
                        >
                          {t(submitting ? "common.saving" : "common.save")}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="composer-item-editor">
                      {business.report ? (
                        <MarkdownView className="meeting-material-copy" markdown={business.report} />
                      ) : (
                        <p className="meeting-material-empty">{t("meeting.itemReportEmpty")}</p>
                      )}
                      {decisionFor(business)?.draftText ? (
                        <blockquote className="composer-decision-preview">
                          <MarkdownView markdown={decisionFor(business)?.draftText ?? ""} />
                        </blockquote>
                      ) : null}
                    </div>
                  )
                ) : null}
                {expanded && business.kind !== "minutesApproval" ? (
                  <div className="composer-item-documents">
                    {business.reportResourceId ? <Button variant="ghost" className="composer-document-link" data-testid={`agenda-report-preview-${item.id}`} onClick={() => setViewedResourceId(business.reportResourceId!)}><TextDocumentIcon />{t("meeting.report")}<VisibleIcon /></Button> : null}
                    {business.resources.map((resource) => <Button key={resource.id} variant="ghost" className="composer-document-link" data-testid={`agenda-resource-preview-${resource.id}`} onClick={() => setViewedResourceId(resource.id)}><DocumentaryResourceGlyph resource={resource} />{resource.name}<VisibleIcon /></Button>)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {editable ? (
        <div className="composer-add-zone">
          <section className="composer-add-decisions" aria-labelledby="composer-businesses-heading">
            <h3 id="composer-businesses-heading">{t("meeting.addCouncilBusinessHeading")}</h3>
            {candidateBusinesses.length === 0 ? (
              <p className="composer-add-hint">{t("meeting.addCouncilBusinessEmpty")}</p>
            ) : (
              <ul className="composer-decision-list">
                {candidateBusinesses.map((business) => (
                  <li key={business.id}>
                    <CouncilBusinessGlyph business={business} />
                    <button type="button" className="composer-item-main" data-testid={`agenda-candidate-preview-${business.id}`} onClick={() => setViewedResourceId(business.reportResourceId)}>
                      <span className="composer-item-copy"><strong>{business.title}</strong><span>{t(councilBusinessKindKeys.matter)}{business.folderPath ? ` · ${business.folderPath}` : ""}</span></span><VisibleIcon aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      ) : null}
      <Modal open={quickAddOpen} title={t("agendaSubject.openQuestion")} onClose={() => setQuickAddOpen(false)}>
        <form className="modal-form" onSubmit={quickAdd}>
          <Label htmlFor={`${fieldId}-question`}>{t("meeting.subject")}</Label>
          <Input id={`${fieldId}-question`} data-testid="agenda-question-title" name="title" required />
          <Button data-testid="agenda-question-submit" type="submit" disabled={submitting || !onQuickCreate}>{t(submitting ? "common.saving" : "common.add")}</Button>
        </form>
      </Modal>
      {viewedResourceId ? <ResourcePreview resourceId={viewedResourceId} readOnly onClose={() => setViewedResourceId(null)} /> : null}
    </section>
  );
}
