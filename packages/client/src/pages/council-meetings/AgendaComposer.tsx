import { Button, Field } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  DocumentRegular,
  GavelRegular,
  ReOrderDotsVerticalRegular,
} from "@fluentui/react-icons";
import type { AgendaItem, CouncilDecision, Topic } from "@mairie/domain";
import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, Input } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

export const topicKindKeys: Record<Topic["kind"], TranslationKey> = {
  subject: "topicKind.subject",
  minutesApproval: "topicKind.minutesApproval",
  openQuestion: "topicKind.openQuestion",
};

const quickAddKinds: Topic["kind"][] = ["subject", "openQuestion"];

export function topicUpdatePayload(topic: Topic, changes: { title?: string; report?: string }) {
  return {
    title: changes.title ?? topic.title,
    report: changes.report ?? topic.report,
    folderPath: topic.folderPath,
    resourceIds: topic.resources.map((resource) => resource.id),
  };
}

export function AgendaComposer({
  agendaItems,
  topics,
  decisions,
  editable,
  onSchedule,
  onQuickCreate,
  onUpdateTopic,
  onAttachDecision,
  onDetachDecision,
  onSaveDecisionText,
  onRemove,
  onReorder,
}: {
  agendaItems: AgendaItem[];
  topics: Topic[];
  decisions: CouncilDecision[];
  editable: boolean;
  onSchedule(topicId: string, position: number): Promise<boolean>;
  onQuickCreate(input: Record<string, unknown>, position: number): Promise<boolean>;
  onUpdateTopic(topicId: string, input: Record<string, unknown>): Promise<boolean>;
  onAttachDecision(topicId: string, draftText: string): Promise<boolean>;
  onDetachDecision(topicId: string): Promise<boolean>;
  onSaveDecisionText(decisionId: string, input: { title: string; draftText: string }): Promise<boolean>;
  onRemove(itemId: string): Promise<boolean>;
  onReorder(itemIds: string[]): Promise<boolean>;
}) {
  const { t, formatNumber } = useI18n();
  const { submitting, run } = useSubmitting();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [draftReport, setDraftReport] = useState("");
  const [draftDecisionText, setDraftDecisionText] = useState("");
  const decisionFor = (topic: Topic) =>
    topic.kind === "subject" && topic.councilDecisionId
      ? (decisions.find((decision) => decision.id === topic.councilDecisionId) ?? null)
      : null;
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const orderedItems = useMemo(
    () => [...agendaItems].sort((left, right) => left.position - right.position),
    [agendaItems],
  );
  const nextPosition = Math.max(0, ...agendaItems.map((item) => item.position)) + 1;
  const candidateTopics = topics.filter((topic) => topic.state === "toSchedule");

  const moveItem = (itemId: string, offset: number) => {
    const ids = orderedItems.map((item) => item.id);
    const index = ids.indexOf(itemId);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => onReorder(ids));
  };

  const dropOn = (targetItemId: string) => {
    setDropTargetItemId(null);
    if (!draggedItemId || draggedItemId === targetItemId) return;
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
          kind: form.get("kind"),
          title: form.get("title"),
          report: "",
          folderPath: "",
          resourceIds: [],
        },
        nextPosition,
      );
      if (added) formElement.reset();
      return added;
    });
  };

  const expandItem = (item: AgendaItem | null) => {
    setExpandedItemId(item?.id ?? null);
    setDraftReport(item?.topic.report ?? "");
    setDraftDecisionText(item ? (decisionFor(item.topic)?.draftText ?? "") : "");
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>, item: AgendaItem) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? item.topic.title);
    const decision = decisionFor(item.topic);
    await run(async () => {
      const saved = await onUpdateTopic(item.topic.id, topicUpdatePayload(item.topic, { title, report: draftReport }));
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
            const topic = item.topic;
            const hasDecision = topic.kind === "subject" && Boolean(topic.councilDecisionId);
            const documentCount = topic.resources.length;
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
                      <ReOrderDotsVerticalRegular />
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
                      <strong>{topic.title}</strong>
                      <span>
                        {t(topicKindKeys[topic.kind])}
                        {hasDecision ? ` · ${t("meeting.itemHasDecision")}` : ""}
                        {topic.folderPath ? ` · ${topic.folderPath}` : ""}
                      </span>
                    </span>
                    {expanded ? <ChevronDownRegular aria-hidden="true" /> : <ChevronRightRegular aria-hidden="true" />}
                  </button>
                  {hasDecision ? (
                    <span className="decision-meeting-chip" title={t("meeting.itemHasDecision")}>
                      <GavelRegular aria-hidden="true" />
                    </span>
                  ) : null}
                  {topic.kind === "minutesApproval" ? (
                    <Link
                      className="decision-meeting-chip"
                      to={`/meetings/${topic.minutesOfMeetingId}`}
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
                      <DocumentRegular aria-hidden="true" />
                      {formatNumber(documentCount)}
                    </span>
                  ) : null}
                  {editable ? (
                    <span className="composer-item-tools">
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ArrowUpRegular />}
                        aria-label={t("meeting.moveUp")}
                        disabled={submitting || index === 0}
                        onClick={() => moveItem(item.id, -1)}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ArrowDownRegular />}
                        aria-label={t("meeting.moveDown")}
                        disabled={submitting || index === orderedItems.length - 1}
                        onClick={() => moveItem(item.id, 1)}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<DeleteRegular />}
                        aria-label={t("meeting.removeItem")}
                        disabled={submitting}
                        onClick={() => void run(() => onRemove(item.id))}
                      />
                    </span>
                  ) : null}
                </div>
                {expanded ? (
                  editable ? (
                    <form className="composer-item-editor" onSubmit={(event) => void saveItem(event, item)}>
                      <Field label={t("meeting.subject")} required>
                        <Input name="title" defaultValue={topic.title} required />
                      </Field>
                      <Field label={t("meeting.report")} hint={t("meeting.reportHint")}>
                        <MarkdownEditor markdown={topic.report} onChange={setDraftReport} />
                      </Field>
                      {topic.kind === "subject" ? (
                        decisionFor(topic) ? (
                          <Field label={t("meeting.draftDecision")} hint={t("meeting.decisionDraftTextHint")}>
                            <MarkdownEditor
                              markdown={decisionFor(topic)?.draftText ?? ""}
                              onChange={setDraftDecisionText}
                            />
                          </Field>
                        ) : null
                      ) : null}
                      <div className="composer-editor-actions">
                        {topic.kind === "subject" ? (
                          decisionFor(topic) ? (
                            <Button
                              className="composer-vote-toggle"
                              appearance="subtle"
                              type="button"
                              disabled={submitting}
                              onClick={() => void run(() => onDetachDecision(topic.id))}
                            >
                              {t("meeting.withdrawVote")}
                            </Button>
                          ) : (
                            <Button
                              appearance="secondary"
                              type="button"
                              icon={<GavelRegular />}
                              disabled={submitting}
                              onClick={() => void run(() => onAttachDecision(topic.id, ""))}
                            >
                              {t("meeting.submitToVote")}
                            </Button>
                          )
                        ) : null}
                        <span className="composer-editor-spacer" />
                        <Button appearance="secondary" type="button" onClick={() => setExpandedItemId(null)}>
                          {t("common.cancel")}
                        </Button>
                        <Button appearance="primary" type="submit" disabled={submitting}>
                          {t(submitting ? "common.saving" : "common.save")}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="composer-item-editor">
                      {topic.report ? (
                        <MarkdownView className="meeting-material-copy" markdown={topic.report} />
                      ) : (
                        <p className="meeting-material-empty">{t("meeting.itemReportEmpty")}</p>
                      )}
                      {decisionFor(topic)?.draftText ? (
                        <blockquote className="composer-decision-preview">
                          <MarkdownView markdown={decisionFor(topic)?.draftText ?? ""} />
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
          <section className="composer-add-decisions" aria-labelledby="composer-topics-heading">
            <h3 id="composer-topics-heading">{t("meeting.addTopicHeading")}</h3>
            {candidateTopics.length === 0 ? (
              <p className="composer-add-hint">{t("meeting.addTopicEmpty")}</p>
            ) : (
              <ul className="composer-decision-list">
                {candidateTopics.map((topic) => (
                  <li key={topic.id}>
                    <span className="composer-item-copy">
                      <strong>{topic.title}</strong>
                      <span>
                        {t(topicKindKeys[topic.kind])}
                        {topic.kind === "subject" && topic.councilDecisionId
                          ? ` · ${t("meeting.itemHasDecision")}`
                          : ""}
                        {topic.folderPath ? ` · ${topic.folderPath}` : ""}
                      </span>
                    </span>
                    <Button
                      appearance="secondary"
                      size="small"
                      icon={<AddRegular />}
                      disabled={submitting}
                      onClick={() => void run(() => onSchedule(topic.id, nextPosition))}
                    >
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
              <select name="kind" aria-label={t("meeting.type")} defaultValue="subject">
                {quickAddKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(topicKindKeys[kind])}
                  </option>
                ))}
              </select>
              <Input
                name="title"
                placeholder={t("meeting.subjectPlaceholder")}
                aria-label={t("meeting.subject")}
                required
              />
              <Button appearance="primary" type="submit" icon={<AddRegular />} disabled={submitting}>
                {t(submitting ? "common.saving" : "common.add")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
