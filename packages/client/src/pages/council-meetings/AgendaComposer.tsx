// biome-ignore-all lint/a11y/noStaticElementInteractions: This drop target has a separate keyboard-accessible subject scheduler.
import type { PreparedCouncilSubject, SchedulePreparedCouncilSubject } from "@hall/api-contract";
import { type DragEvent, type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailTooltip } from "../../components/DetailTooltip";
import { HelpHint } from "../../components/HelpHint";
import {
  AddIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CouncilBusinessIcon,
  DeleteIcon,
  DragHandleIcon,
  TextDocumentIcon,
  VisibleIcon,
} from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, Modal, matchesQuery, RequestErrorBanner } from "../../components/Ui";
import { liveBusinessTitle } from "../../features/council-business/presentation";
import { AgendaMinutesApproval } from "../../features/council-meetings/AgendaMinutesApproval";
import { AgendaSubjectEditor } from "../../features/council-meetings/AgendaSubjectEditor";
import {
  AgendaSubjectGlyph,
  agendaSubjectPresentation,
  agendaSubjectTextResource,
  preparedSubjectPresentation,
} from "../../features/council-meetings/AgendaSubjectGlyph";
import { MinutesReadiness } from "../../features/council-meetings/MinutesReadiness";
import { DocumentaryResourceGlyph } from "../../features/documents/DocumentaryResourceGlyph";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import {
  type LiveMeetingAgendaItem as AgendaItem,
  liveAgendaBusinessRank as agendaBusinessRank,
} from "../../models/liveMeeting";
import type { ApiErrorCode } from "../../services/apiClient";

export interface QuickCouncilBusinessInput {
  kind: "matter" | "openQuestion";
  title: string;
  report: string;
  folderPath: string;
}

export function AgendaComposer({
  agendaItems,
  preparedSubjects,
  preparedSubjectsLoading,
  preparedSubjectsError,
  onSchedulePrepared,
  editable,
  onQuickCreate,
  quickCreateError,
  onSubjectSaved,
  onRemove,
  onReorder,
  status,
  actions,
  caption,
}: {
  agendaItems: AgendaItem[];
  status?: ReactNode;
  actions?: ReactNode;
  caption?: ReactNode;
  preparedSubjects: PreparedCouncilSubject[];
  preparedSubjectsLoading: boolean;
  preparedSubjectsError: ApiErrorCode | null;
  onSchedulePrepared?(input: SchedulePreparedCouncilSubject): Promise<boolean>;
  editable: boolean;
  onQuickCreate?(input: QuickCouncilBusinessInput, position: number): Promise<boolean>;
  quickCreateError: ApiErrorCode | null;
  onSubjectSaved(): Promise<void>;
  onRemove(itemId: string): Promise<boolean>;
  onReorder(itemIds: string[]): Promise<boolean>;
}) {
  const { t, plural, formatNumber, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const fieldId = useId();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [viewedResourceId, setViewedResourceId] = useState<string | null>(null);
  const [expandedCandidateKey, setExpandedCandidateKey] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedSubject, setDraggedSubject] = useState<PreparedCouncilSubject | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const orderedItems = useMemo(
    () => [...agendaItems].sort((left, right) => left.position - right.position),
    [agendaItems],
  );
  const nextPosition = Math.max(0, ...agendaItems.map((item) => item.position)) + 1;
  const candidateSubjects = preparedSubjects.filter((subject) =>
    matchesQuery(subjectSearch, subject.title, subject.folderPath, t(agendaSubjectPresentation[subject.kind].label)),
  );
  const scheduleSubject = (subject: PreparedCouncilSubject, position: number) => {
    setDraggedSubject(null);
    setDropTargetItemId(null);
    if (!onSchedulePrepared || submitting) return;
    void run(() => onSchedulePrepared(preparedSubjectPresentation(subject, position).command));
  };

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
  };

  return (
    <section className="agenda-composer" aria-labelledby="agenda-heading">
      <header className="agenda-composer-heading">
        <div className="agenda-composer-title">
          <h2 id="agenda-heading">
            {t("meeting.agenda")}
            <span className="agenda-composer-count" data-testid="agenda-composer-count">
              {" · "}
              {formatNumber(orderedItems.length)}{" "}
              {plural(orderedItems.length, "meeting.agendaCount.one", "meeting.agendaCount.other")}
            </span>
          </h2>
          <HelpHint
            text={t(editable ? "meeting.composerDescription" : "meeting.composerLocked")}
            testId="agenda-composer-help"
          />
          {status}
        </div>
        <div className="agenda-composer-actions">
          {actions}
          {editable && onQuickCreate ? (
            <Button
              data-testid="agenda-question-create"
              variant="outline"
              size="sm"
              onClick={() => setQuickAddOpen(true)}
            >
              <AddIcon />
              {t("agendaSubject.openQuestion")}
            </Button>
          ) : null}
        </div>
      </header>
      {caption ? <div className="agenda-composer-caption">{caption}</div> : null}

      {orderedItems.length === 0 ? (
        <EmptyState>{t("meeting.emptyAgenda")}</EmptyState>
      ) : (
        <ol className="composer-list">
          {orderedItems.map((item, index) => {
            const expanded = expandedItemId === item.id;
            const business = item.business;
            const presentation = agendaSubjectPresentation[item.subjectKind];
            const textResourceId = agendaSubjectTextResource(item.subject);
            return (
              <li
                className={`composer-item${dropTargetItemId === item.id ? " composer-item-drop" : ""}${draggedItemId === item.id ? " composer-item-dragging" : ""}`}
                key={item.id}
                data-testid={`agenda-item-${item.id}`}
                draggable={editable && !expanded && !submitting}
                onDragStart={(event: DragEvent) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedItemId(item.id);
                }}
                onDragEnd={() => {
                  setDraggedItemId(null);
                  setDraggedSubject(null);
                  setDropTargetItemId(null);
                }}
                onDragOver={(event: DragEvent) => {
                  if (draggedSubject && onSchedulePrepared && !submitting && item.subjectKind !== "minutesApproval") {
                    event.preventDefault();
                    setDropTargetItemId(item.id);
                    return;
                  }
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
                  if (draggedSubject) {
                    if (item.subjectKind !== "minutesApproval") scheduleSubject(draggedSubject, item.position);
                    return;
                  }
                  dropOn(item.id);
                }}
              >
                <div className="composer-item-row">
                  {editable ? (
                    <span className="composer-grip" aria-hidden="true">
                      <DragHandleIcon />
                    </span>
                  ) : null}
                  <span className="composer-position" data-testid={`agenda-item-position-${item.id}`}>
                    {item.agendaNumber}
                  </span>
                  {business.kind === "minutesApproval" && business.minutesId ? (
                    <span className="composer-subject-glyph" data-kind="minutesApproval" aria-hidden="false">
                      <MinutesReadiness minutesId={business.minutesId} testId={`agenda-minutes-readiness-${item.id}`} />
                    </span>
                  ) : (
                    <AgendaSubjectGlyph kind={item.subjectKind} />
                  )}
                  <button
                    className="composer-item-main"
                    data-testid={`agenda-item-expand-${item.id}`}
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => expandItem(expanded ? null : item)}
                  >
                    <DetailTooltip
                      rows={
                        business.kind === "minutesApproval"
                          ? []
                          : [
                              { label: t("meeting.hint.kind"), value: t(presentation.label) },
                              { label: t("meeting.hint.folder"), value: business.folderPath },
                              {
                                label: t("meeting.hint.report"),
                                value: business.reportResourceId ? t("common.yes") : t("common.no"),
                              },
                              {
                                label: t("meeting.hint.pieces"),
                                value: business.resources.length
                                  ? formatNumber(business.resources.length)
                                  : t("common.none"),
                              },
                            ]
                      }
                    >
                      <span className="composer-item-copy">
                        <strong>{liveBusinessTitle(business, t("agendaSubject.minutesApproval"))}</strong>
                      </span>
                    </DetailTooltip>
                  </button>
                  {business.kind !== "minutesApproval" ? (
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link
                        data-testid={`agenda-item-open-business-${item.id}`}
                        to={`/workspace?${new URLSearchParams({ councilBusiness: business.id, path: business.folderPath })}`}
                        aria-label={t("meeting.openBusiness")}
                        title={
                          business.folderPath
                            ? `${t("meeting.openBusiness")} · ${business.folderPath}`
                            : t("meeting.openBusiness")
                        }
                      >
                        <CouncilBusinessIcon aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                  {editable ? (
                    <span className="composer-item-tools">
                      <Button
                        variant="ghost"
                        size="icon-sm"
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
                        size="icon-sm"
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
                      {business.kind !== "minutesApproval" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          data-testid={`agenda-item-remove-${item.id}`}
                          aria-label={t("meeting.removeItem")}
                          disabled={submitting}
                          onClick={() => void run(() => onRemove(item.id))}
                        >
                          <DeleteIcon />
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {expanded ? (
                  business.kind === "minutesApproval" ? (
                    business.minutesId ? (
                      <AgendaMinutesApproval minutesId={business.minutesId} itemId={item.id} />
                    ) : null
                  ) : textResourceId ? (
                    <AgendaSubjectEditor
                      key={textResourceId}
                      resourceId={textResourceId}
                      onSaved={onSubjectSaved}
                      onCancel={() => setExpandedItemId(null)}
                    />
                  ) : (
                    <div className="composer-item-editor">
                      {business.report ? (
                        <MarkdownView className="meeting-material-copy" markdown={business.report} />
                      ) : (
                        <p className="meeting-material-empty">{t("meeting.itemReportEmpty")}</p>
                      )}
                    </div>
                  )
                ) : null}
                {expanded && business.kind !== "minutesApproval" ? (
                  <div className="composer-item-documents">
                    {business.reportResourceId ? (
                      <Button
                        variant="ghost"
                        className="composer-document-link"
                        data-testid={`agenda-report-preview-${item.id}`}
                        onClick={() => setViewedResourceId(business.reportResourceId!)}
                      >
                        <TextDocumentIcon />
                        {t("meeting.report")}
                        <VisibleIcon />
                      </Button>
                    ) : null}
                    {business.resources.map((resource) => (
                      <Button
                        key={resource.id}
                        variant="ghost"
                        className="composer-document-link"
                        data-testid={`agenda-resource-preview-${resource.id}`}
                        onClick={() => setViewedResourceId(resource.id)}
                      >
                        <DocumentaryResourceGlyph resource={resource} />
                        {resource.name}
                        <VisibleIcon />
                      </Button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {onSchedulePrepared ? (
        <div className="composer-add-zone">
          <div
            className={`composer-prepared-drop${draggedSubject ? " composer-prepared-drop-active" : ""}`}
            data-testid="agenda-prepared-drop-end"
            onDragOver={(event) => {
              if (draggedSubject && !submitting) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedSubject) scheduleSubject(draggedSubject, nextPosition);
            }}
          >
            {t("meeting.dropPreparedSubject")}
          </div>
          <section className="composer-add-decisions" aria-labelledby="composer-businesses-heading">
            <h3 id="composer-businesses-heading">{t("meeting.addCouncilBusinessHeading")}</h3>
            {preparedSubjects.length > 8 || subjectSearch ? (
              <Input
                id={`${fieldId}-subject-search`}
                data-testid="agenda-prepared-search"
                type="search"
                aria-label={t("common.search")}
                placeholder={t("common.search")}
                value={subjectSearch}
                onChange={(event) => setSubjectSearch(event.target.value)}
              />
            ) : null}
            <RequestErrorBanner error={preparedSubjectsError} />
            {preparedSubjectsLoading ? (
              <p role="status">{t("common.loading")}</p>
            ) : candidateSubjects.length === 0 && !preparedSubjectsError ? (
              <p className="composer-add-hint">{t("meeting.addCouncilBusinessEmpty")}</p>
            ) : (
              <ul className="composer-decision-list">
                {candidateSubjects.map((subject) => {
                  const candidate = preparedSubjectPresentation(subject, nextPosition);
                  return (
                    <li
                      key={candidate.key}
                      className="composer-item-row"
                      data-testid={`agenda-candidate-${candidate.key}`}
                      draggable={!submitting}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", candidate.key);
                        setDraggedItemId(null);
                        setDraggedSubject(subject);
                      }}
                      onDragEnd={() => {
                        setDraggedSubject(null);
                        setDropTargetItemId(null);
                      }}
                    >
                      <span className="composer-grip" aria-hidden="true">
                        <DragHandleIcon />
                      </span>
                      <AgendaSubjectGlyph kind={subject.kind} />
                      <button
                        type="button"
                        className="composer-item-main"
                        data-testid={`agenda-candidate-preview-${candidate.key}`}
                        aria-expanded={expandedCandidateKey === candidate.key}
                        onClick={() =>
                          setExpandedCandidateKey(expandedCandidateKey === candidate.key ? null : candidate.key)
                        }
                      >
                        <DetailTooltip
                          rows={[
                            { label: t("meeting.hint.kind"), value: t(agendaSubjectPresentation[subject.kind].label) },
                            { label: t("meeting.hint.folder"), value: subject.folderPath },
                            { label: t("meeting.hint.created"), value: formatDate(subject.createdAt) },
                          ]}
                        >
                          <span className="composer-item-copy">
                            <strong>{subject.title}</strong>
                          </span>
                        </DetailTooltip>
                      </button>
                      <Button asChild variant="ghost" size="icon-sm">
                        <Link
                          data-testid={`agenda-candidate-open-business-${candidate.key}`}
                          to={`/workspace?${new URLSearchParams({ councilBusiness: subject.councilBusinessId, path: subject.folderPath })}`}
                          aria-label={t("meeting.openBusiness")}
                          title={
                            subject.folderPath
                              ? `${t("meeting.openBusiness")} · ${subject.folderPath}`
                              : t("meeting.openBusiness")
                          }
                        >
                          <CouncilBusinessIcon aria-hidden="true" />
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`agenda-candidate-add-${candidate.key}`}
                        disabled={submitting}
                        onClick={() => scheduleSubject(subject, nextPosition)}
                      >
                        <AddIcon />
                        {t("common.add")}
                      </Button>
                      {expandedCandidateKey === candidate.key ? (
                        <div className="composer-candidate-detail">
                          <AgendaSubjectEditor
                            key={candidate.previewResourceId}
                            resourceId={candidate.previewResourceId}
                            onSaved={onSubjectSaved}
                            onCancel={() => setExpandedCandidateKey(null)}
                          />
                          <div className="composer-item-documents">
                            <Button
                              variant="ghost"
                              className="composer-document-link"
                              data-testid={`agenda-candidate-report-preview-${candidate.key}`}
                              onClick={() => setViewedResourceId(subject.reportResourceId)}
                            >
                              <TextDocumentIcon />
                              {t("meeting.report")}
                              <VisibleIcon />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}
      <Modal open={quickAddOpen} title={t("agendaSubject.openQuestion")} onClose={() => setQuickAddOpen(false)}>
        <form className="modal-form" onSubmit={quickAdd}>
          <RequestErrorBanner error={quickCreateError} />
          <Label htmlFor={`${fieldId}-question`}>{t("meeting.subject")}</Label>
          <Input id={`${fieldId}-question`} data-testid="agenda-question-title" name="title" required />
          <Button
            className="justify-self-end"
            data-testid="agenda-question-submit"
            type="submit"
            disabled={submitting || !onQuickCreate}
          >
            {t(submitting ? "common.saving" : "common.add")}
          </Button>
        </form>
      </Modal>
      {viewedResourceId ? (
        <ResourcePreview resourceId={viewedResourceId} onClose={() => setViewedResourceId(null)} />
      ) : null}
    </section>
  );
}
