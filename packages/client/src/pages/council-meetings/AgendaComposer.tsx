// biome-ignore-all lint/a11y/noStaticElementInteractions: This drop target has a separate keyboard-accessible subject scheduler.
import type { PreparedCouncilSubject, SchedulePreparedCouncilSubject } from "@hall/api-contract";
import { type DragEvent, type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HelpHint } from "../../components/HelpHint";
import {
  AddIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CouncilBusinessIcon,
  DeleteIcon,
  TextDocumentIcon,
  VisibleIcon,
} from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, Modal, matchesQuery, RequestErrorBanner } from "../../components/Ui";
import { ListRow, type ListRowProps, ListRows } from "../../components/ui/list-row";
import { SectionHeader } from "../../components/ui/section-header";
import { liveBusinessTitle } from "../../features/council-business/presentation";
import { AgendaMinutesApproval } from "../../features/council-meetings/AgendaMinutesApproval";
import { AgendaSubjectEditor } from "../../features/council-meetings/AgendaSubjectEditor";
import {
  AgendaSubjectGlyph,
  agendaSubjectPresentation,
  agendaSubjectTextResource,
  preparedSubjectPresentation,
} from "../../features/council-meetings/AgendaSubjectGlyph";
import { useMinutesReadiness } from "../../features/council-meetings/MinutesReadiness";
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
  pointHref,
}: {
  agendaItems: AgendaItem[];
  /** Opens each item on its own page instead of unfolding it in the list. */
  pointHref?(itemId: string): string;
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
  const { t, plural, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
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
      <SectionHeader
        className="agenda-composer-heading"
        titleId="agenda-heading"
        title={
          <>
            {t("meeting.agenda")}
            <span className="agenda-composer-count" data-testid="agenda-composer-count">
              {" · "}
              {formatNumber(orderedItems.length)}{" "}
              {plural(orderedItems.length, "meeting.agendaCount.one", "meeting.agendaCount.other")}
            </span>
          </>
        }
        commands={
          <>
            <HelpHint
              text={t(editable ? "meeting.composerDescription" : "meeting.composerLocked")}
              testId="agenda-composer-help"
            />
            {status}
            {actions}
            {editable && onQuickCreate ? (
              <Button data-testid="agenda-question-create" variant="secondary" onClick={() => setQuickAddOpen(true)}>
                <AddIcon />
                {t("agendaSubject.openQuestion")}
              </Button>
            ) : null}
          </>
        }
      />
      {caption ? <div className="agenda-composer-caption">{caption}</div> : null}

      {orderedItems.length === 0 ? (
        <EmptyState>{t("meeting.emptyAgenda")}</EmptyState>
      ) : (
        <ListRows className="composer-list">
          {orderedItems.map((item, index) => {
            const expanded = expandedItemId === item.id;
            const business = item.business;
            const textResourceId = agendaSubjectTextResource(item.subject);
            const businessHref = `/workspace?${new URLSearchParams({ councilBusiness: business.id, path: business.folderPath })}`;
            return (
              <AgendaItemRow
                key={item.id}
                item={item}
                className={`${dropTargetItemId === item.id ? "composer-item-drop" : ""}${draggedItemId === item.id ? " composer-item-dragging" : ""}`}
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
                {...(pointHref
                  ? { to: pointHref(item.id), openTestId: `agenda-item-open-${item.id}` }
                  : {
                      onOpen: () => expandItem(expanded ? null : item),
                      openTestId: `agenda-item-expand-${item.id}`,
                      openProps: { "aria-expanded": expanded },
                      expanded,
                    })}
                action={
                  <>
                    {business.kind !== "minutesApproval" && !pointHref ? (
                      <Button asChild variant="plain" size="icon">
                        <Link
                          data-testid={`agenda-item-open-business-${item.id}`}
                          to={businessHref}
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
                    ) : !pointHref ? (
                      <span className="agenda-command-slot" aria-hidden="true" />
                    ) : null}
                    {editable ? (
                      <>
                        <Button
                          variant="plain"
                          size="icon"
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
                          variant="plain"
                          size="icon"
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
                            variant="plain"
                            size="icon"
                            data-testid={`agenda-item-remove-${item.id}`}
                            aria-label={t("meeting.removeItem")}
                            disabled={submitting}
                            onClick={() => void run(() => onRemove(item.id))}
                          >
                            <DeleteIcon />
                          </Button>
                        ) : (
                          <span className="agenda-command-slot" aria-hidden="true" />
                        )}
                      </>
                    ) : null}
                  </>
                }
              >
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
                        variant="plain"
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
                        variant="plain"
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
              </AgendaItemRow>
            );
          })}
        </ListRows>
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
              <Field label={t("common.search")}>
                <Input
                  data-testid="agenda-prepared-search"
                  type="search"
                  value={subjectSearch}
                  onChange={(event) => setSubjectSearch(event.target.value)}
                />
              </Field>
            ) : null}
            <RequestErrorBanner error={preparedSubjectsError} />
            {preparedSubjectsLoading ? (
              <p role="status">{t("common.loading")}</p>
            ) : candidateSubjects.length === 0 && !preparedSubjectsError ? (
              <p className="composer-add-hint">{t("meeting.addCouncilBusinessEmpty")}</p>
            ) : (
              <ListRows className="composer-decision-list">
                {candidateSubjects.map((subject) => {
                  const candidate = preparedSubjectPresentation(subject, nextPosition);
                  const expanded = expandedCandidateKey === candidate.key;
                  return (
                    <ListRow
                      key={candidate.key}
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
                      head={<AgendaSubjectGlyph kind={subject.kind} tree />}
                      title={subject.title}
                      detail={[t(agendaSubjectPresentation[subject.kind].label), subject.folderPath]
                        .filter(Boolean)
                        .join(" · ")}
                      {...(pointHref
                        ? {
                            to: `/workspace?${new URLSearchParams({ path: subject.folderPath, resource: candidate.previewResourceId, fromBusiness: subject.councilBusinessId })}`,
                            openTestId: `agenda-candidate-open-${candidate.key}`,
                          }
                        : {
                            onOpen: () => setExpandedCandidateKey(expanded ? null : candidate.key),
                            openTestId: `agenda-candidate-preview-${candidate.key}`,
                            openProps: { "aria-expanded": expanded },
                            expanded,
                          })}
                      action={
                        <>
                          <Button asChild variant="plain" size="icon">
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
                            variant="secondary"
                            data-testid={`agenda-candidate-add-${candidate.key}`}
                            disabled={submitting}
                            onClick={() => scheduleSubject(subject, nextPosition)}
                          >
                            <AddIcon />
                            {t("common.add")}
                          </Button>
                        </>
                      }
                    >
                      {expanded ? (
                        <div className="composer-candidate-detail">
                          <AgendaSubjectEditor
                            key={candidate.previewResourceId}
                            resourceId={candidate.previewResourceId}
                            onSaved={onSubjectSaved}
                            onCancel={() => setExpandedCandidateKey(null)}
                          />
                          <div className="composer-item-documents">
                            <Button
                              variant="plain"
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
                    </ListRow>
                  );
                })}
              </ListRows>
            )}
          </section>
        </div>
      ) : null}
      <Modal open={quickAddOpen} title={t("agendaSubject.openQuestion")} onClose={() => setQuickAddOpen(false)}>
        <form className="modal-form" onSubmit={quickAdd}>
          <RequestErrorBanner error={quickCreateError} />
          <Field label={t("meeting.subject")}>
            <Input data-testid="agenda-question-title" name="title" required />
          </Field>
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

/** One agenda item: its number, its subject and, for minutes to approve, whether their document exists. */
function AgendaItemRow({
  item,
  ...row
}: { item: AgendaItem } & Omit<ListRowProps, "head" | "title" | "detail" | "status">) {
  const { t } = useI18n();
  const business = item.business;
  const minutesStatus = useMinutesReadiness(
    business.kind === "minutesApproval" ? (business.minutesId ?? null) : null,
    `agenda-minutes-readiness-${item.id}`,
  );
  const kind = t(agendaSubjectPresentation[item.subjectKind].label);
  return (
    <ListRow
      {...(row as ListRowProps)}
      head={
        <span className="list-row-number" data-testid={`agenda-item-position-${item.id}`}>
          {item.agendaNumber === null ? (
            <AgendaSubjectGlyph kind={item.subjectKind} tree />
          ) : (
            <strong>{item.agendaNumber}</strong>
          )}
        </span>
      }
      title={liveBusinessTitle(business, t("agendaSubject.minutesApproval"))}
      detail={business.kind === "minutesApproval" ? undefined : [kind, business.folderPath].filter(Boolean).join(" · ")}
      status={minutesStatus}
    />
  );
}
