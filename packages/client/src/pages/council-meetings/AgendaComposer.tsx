import { type AgendaItem, agendaBusinessRank, type CouncilBusiness, type CouncilDecision } from "@hall/domain";
import { type DragEvent, type FormEvent, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import {
  AddIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DeleteIcon,
  DragHandleIcon,
  FileIcon,
  GavelIcon,
} from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState } from "../../components/Ui";
import { councilBusinessKindKeys } from "../../features/council-business/presentation";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";

const quickAddKinds: CouncilBusiness["kind"][] = ["matter", "openQuestion"];

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
  onSchedule,
  onQuickCreate,
  onUpdateBusiness,
  onAttachDecision,
  onDetachDecision,
  onSaveDecisionText,
  onRemove,
  onReorder,
}: {
  agendaItems: AgendaItem[];
  businesses: CouncilBusiness[];
  decisions: CouncilDecision[];
  editable: boolean;
  onSchedule(businessId: string, position: number): Promise<boolean>;
  onQuickCreate(input: Record<string, unknown>, position: number): Promise<boolean>;
  onUpdateBusiness(businessId: string, input: Record<string, unknown>): Promise<boolean>;
  onAttachDecision(businessId: string, draftText: string): Promise<boolean>;
  onDetachDecision(businessId: string): Promise<boolean>;
  onSaveDecisionText(decisionId: string, input: { title: string; draftText: string }): Promise<boolean>;
  onRemove(itemId: string): Promise<boolean>;
  onReorder(itemIds: string[]): Promise<boolean>;
}) {
  const { t, formatNumber } = useI18n();
  const { meetings } = useCouncilMeetingsStore();
  const { submitting, run } = useSubmitting();
  const fieldId = useId();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [quickAddKind, setQuickAddKind] = useState<CouncilBusiness["kind"]>(quickAddKinds[0]);
  const [draftReport, setDraftReport] = useState("");
  const mentionables = useReferenceMentionables();
  const [draftDecisionText, setDraftDecisionText] = useState("");
  const decisionFor = (business: CouncilBusiness) =>
    business.kind === "matter" && business.councilDecisionId
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
    .sort((left, right) => agendaBusinessRank(left) - agendaBusinessRank(right));

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
    const formElement = event.currentTarget;
    await run(async () => {
      const form = new FormData(formElement);
      const added = await onQuickCreate(
        {
          kind: quickAddKind,
          title: form.get("title"),
          report: "",
          folderPath: "",
          resourceIds: [],
        },
        nextPosition,
      );
      if (added) {
        formElement.reset();
        setQuickAddKind(quickAddKinds[0]);
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
      </header>

      {orderedItems.length === 0 ? (
        <EmptyState>{t("meeting.emptyAgenda")}</EmptyState>
      ) : (
        <ol className="composer-list">
          {orderedItems.map((item, index) => {
            const expanded = expandedItemId === item.id;
            const business = item.business;
            const minutesMeeting =
              business.kind === "minutesApproval"
                ? meetings.find((meeting) => meeting.id === business.minutesOfMeetingId)
                : null;
            const hasDecision = business.kind === "matter" && Boolean(business.councilDecisionId);
            const documentCount = business.resources.length;
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
                  <button
                    className="composer-item-main"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => expandItem(expanded ? null : item)}
                  >
                    <span className="composer-item-copy">
                      <strong>{business.title}</strong>
                      <span>
                        {t(councilBusinessKindKeys[business.kind])}
                        {hasDecision ? ` · ${t("meeting.itemHasDecision")}` : ""}
                        {business.folderPath ? ` · ${business.folderPath}` : ""}
                      </span>
                    </span>
                    {expanded ? <ChevronDownIcon aria-hidden="true" /> : <ChevronRightIcon aria-hidden="true" />}
                  </button>
                  {hasDecision ? (
                    <span className="decision-meeting-chip" title={t("meeting.itemHasDecision")}>
                      <GavelIcon aria-hidden="true" />
                    </span>
                  ) : null}
                  {business.kind === "minutesApproval" ? (
                    <Link
                      className="decision-meeting-chip"
                      to={`/meetings/${minutesMeeting?.slug ?? business.minutesOfMeetingId}`}
                      title={t("meeting.viewPreviousMeeting")}
                    >
                      {t("meeting.previousMeetingChip")}
                    </Link>
                  ) : null}
                  {documentCount > 0 ? (
                    <span
                      className="decision-meeting-chip"
                      title={t("meeting.itemResourceCount").replace("{count}", formatNumber(documentCount))}
                    >
                      <FileIcon aria-hidden="true" />
                      {formatNumber(documentCount)}
                    </span>
                  ) : null}
                  {editable ? (
                    <span className="composer-item-tools">
                      <Button
                        variant="ghost"
                        size="sm"
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
                  editable ? (
                    <form className="composer-item-editor" onSubmit={(event) => void saveItem(event, item)}>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`${fieldId}-title`}>{t("meeting.subject")}</Label>
                        <Input id={`${fieldId}-title`} name="title" defaultValue={business.title} required />
                      </div>
                      {/* L'éditeur Markdown n'expose pas de champ natif : l'étiquette reste sans `htmlFor`. */}
                      <div className="grid gap-1.5">
                        <Label>{t("meeting.report")}</Label>
                        <MarkdownEditor
                          markdown={business.report}
                          onChange={setDraftReport}
                          mentionables={mentionables}
                        />
                        <p className="text-xs text-muted">{t("meeting.reportHint")}</p>
                      </div>
                      {business.kind === "matter" ? (
                        decisionFor(business) ? (
                          <div className="grid gap-1.5">
                            <Label>{t("meeting.draftDecision")}</Label>
                            <MarkdownEditor
                              markdown={decisionFor(business)?.draftText ?? ""}
                              onChange={setDraftDecisionText}
                              mentionables={mentionables}
                            />
                            <p className="text-xs text-muted">{t("meeting.decisionDraftTextHint")}</p>
                          </div>
                        ) : null
                      ) : null}
                      <div className="composer-editor-actions">
                        {business.kind === "matter" ? (
                          decisionFor(business) ? (
                            <Button
                              className="composer-vote-toggle"
                              variant="ghost"
                              type="button"
                              disabled={submitting}
                              onClick={() => void run(() => onDetachDecision(business.id))}
                            >
                              {t("meeting.withdrawVote")}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              type="button"
                              disabled={submitting}
                              onClick={() => void run(() => onAttachDecision(business.id, ""))}
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
                        <Button variant="default" type="submit" disabled={submitting}>
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
                    <span className="composer-item-copy">
                      <strong>{business.title}</strong>
                      <span>
                        {t(councilBusinessKindKeys[business.kind])}
                        {business.kind === "matter" && business.councilDecisionId
                          ? ` · ${t("meeting.itemHasDecision")}`
                          : ""}
                        {business.folderPath ? ` · ${business.folderPath}` : ""}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={submitting}
                      onClick={() => void run(() => onSchedule(business.id, nextPosition))}
                    >
                      <AddIcon />
                      {t("meeting.addToAgenda")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form className="composer-quick-add" onSubmit={quickAdd} aria-labelledby="composer-quick-add-heading">
            <h3 id="composer-quick-add-heading">{t("meeting.addOtherHeading")}</h3>
            <div className="composer-quick-add-fields">
              {/* Contrôlé : `formElement.reset()` ne remet pas l'état interne de Radix à zéro,
                  il faut donc le repositionner nous-mêmes après un ajout réussi. */}
              <Select
                name="kind"
                value={quickAddKind}
                onValueChange={(kind) => setQuickAddKind(kind as CouncilBusiness["kind"])}
              >
                <SelectTrigger aria-label={t("meeting.type")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quickAddKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(councilBusinessKindKeys[kind])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                name="title"
                placeholder={t("meeting.subjectPlaceholder")}
                aria-label={t("meeting.subject")}
                required
              />
              <Button variant="default" type="submit" disabled={submitting}>
                <AddIcon />
                {t(submitting ? "common.saving" : "common.add")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
