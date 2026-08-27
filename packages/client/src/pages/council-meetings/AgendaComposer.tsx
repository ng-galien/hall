import { Button, Field } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  ReOrderDotsVerticalRegular,
} from "@fluentui/react-icons";
import type { AgendaItem, CaseFile, CouncilDecision } from "@mairie/domain";
import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { EmptyState, Input } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

export const agendaKindKeys: Record<AgendaItem["kind"], TranslationKey> = {
  councilDecision: "agendaKind.councilDecision",
  information: "agendaKind.information",
  election: "agendaKind.election",
  question: "agendaKind.question",
  other: "agendaKind.other",
};

const quickAddKinds: AgendaItem["kind"][] = ["information", "question", "election", "other"];

export function AgendaComposer({
  agendaItems,
  councilDecisions,
  caseFiles,
  editable,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: {
  agendaItems: AgendaItem[];
  councilDecisions: CouncilDecision[];
  caseFiles: CaseFile[];
  editable: boolean;
  onAdd(input: Record<string, unknown>): Promise<boolean>;
  onUpdate(itemId: string, input: Record<string, unknown>): Promise<boolean>;
  onRemove(itemId: string): Promise<boolean>;
  onReorder(itemIds: string[]): Promise<boolean>;
}) {
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [draftReport, setDraftReport] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const orderedItems = useMemo(
    () => [...agendaItems].sort((left, right) => left.position - right.position),
    [agendaItems],
  );
  const nextPosition = Math.max(0, ...agendaItems.map((item) => item.position)) + 1;
  const scheduledDecisionIds = new Set(
    agendaItems.flatMap((item) => (item.councilDecisionId ? [item.councilDecisionId] : [])),
  );
  const candidateDecisions = councilDecisions.filter(
    (decision) => !scheduledDecisionIds.has(decision.id) && ["draft", "ready"].includes(decision.status),
  );
  const caseFileReference = (caseFileId: string | null) =>
    caseFiles.find((caseFile) => caseFile.id === caseFileId)?.reference ?? null;
  const attachedCaseFileIds = new Set(agendaItems.flatMap((item) => (item.caseFileId ? [item.caseFileId] : [])));
  const candidateCaseFiles = caseFiles.filter(
    (caseFile) => !attachedCaseFileIds.has(caseFile.id) && caseFile.status !== "archived",
  );

  const addCaseFileItem = (caseFileId: string) => {
    const caseFile = caseFiles.find((candidate) => candidate.id === caseFileId);
    if (!caseFile) return;
    void run(() =>
      onAdd({
        position: nextPosition,
        kind: "information",
        title: caseFile.title,
        report: caseFile.summary,
        councilDecisionId: null,
        caseFileId: caseFile.id,
      }),
    );
  };

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

  const addDecision = (decision: CouncilDecision) =>
    run(() =>
      onAdd({
        position: nextPosition,
        kind: "councilDecision",
        title: decision.title,
        report: "",
        councilDecisionId: decision.id,
        caseFileId: decision.caseFileId,
      }),
    );

  const quickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    await run(async () => {
      const form = new FormData(formElement);
      const added = await onAdd({
        position: nextPosition,
        kind: form.get("kind"),
        title: form.get("title"),
        report: "",
        councilDecisionId: null,
        caseFileId: null,
      });
      if (added) formElement.reset();
    });
  };

  const expandItem = (item: AgendaItem | null) => {
    setExpandedItemId(item?.id ?? null);
    setDraftReport(item?.report ?? "");
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>, item: AgendaItem) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const saved = await onUpdate(item.id, {
        title: form.get("title"),
        report: draftReport,
        ...(item.kind !== "councilDecision" ? { caseFileId: form.get("caseFileId") || null } : {}),
      });
      if (saved) setExpandedItemId(null);
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
            const reference = caseFileReference(item.caseFileId);
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
                      <strong>{item.title}</strong>
                      <span>
                        {t(agendaKindKeys[item.kind])}
                        {reference ? ` · ${reference}` : ""}
                      </span>
                    </span>
                    {expanded ? <ChevronDownRegular aria-hidden="true" /> : <ChevronRightRegular aria-hidden="true" />}
                  </button>
                  {item.caseFileId ? (
                    <Link
                      className="decision-meeting-chip composer-case-file-chip"
                      to={`/case-files/${item.caseFileId}`}
                      title={t("meeting.viewCaseFile")}
                    >
                      {reference ?? t("meeting.caseFileChip")}
                    </Link>
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
                        <Input name="title" defaultValue={item.title} required />
                      </Field>
                      {item.kind !== "councilDecision" ? (
                        <Field label={t("meeting.linkedCaseFile")} hint={t("meeting.linkedCaseFileHint")}>
                          <select name="caseFileId" defaultValue={item.caseFileId ?? ""}>
                            <option value="">{t("common.none")}</option>
                            {caseFiles
                              .filter((caseFile) => caseFile.status !== "archived" || caseFile.id === item.caseFileId)
                              .map((caseFile) => (
                                <option key={caseFile.id} value={caseFile.id}>
                                  {caseFile.reference} · {caseFile.title}
                                </option>
                              ))}
                          </select>
                        </Field>
                      ) : null}
                      <Field label={t("meeting.report")} hint={t("meeting.reportHint")}>
                        <MarkdownEditor markdown={item.report} onChange={setDraftReport} />
                      </Field>
                      <div className="composer-editor-actions">
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
                      {item.report ? (
                        <MarkdownView className="meeting-material-copy" markdown={item.report} />
                      ) : (
                        <p className="meeting-material-empty">{t("meeting.itemReportEmpty")}</p>
                      )}
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
          <section className="composer-add-decisions" aria-labelledby="composer-decisions-heading">
            <h3 id="composer-decisions-heading">{t("meeting.addDecisionHeading")}</h3>
            {candidateDecisions.length === 0 ? (
              <p className="composer-add-hint">{t("meeting.addDecisionEmpty")}</p>
            ) : (
              <ul className="composer-decision-list">
                {candidateDecisions.map((decision) => (
                  <li key={decision.id}>
                    <span className="composer-item-copy">
                      <strong>{decision.title}</strong>
                      <span>{caseFileReference(decision.caseFileId) ?? t("decisions.draft")}</span>
                    </span>
                    <Button
                      appearance="secondary"
                      size="small"
                      icon={<AddRegular />}
                      disabled={submitting}
                      onClick={() => void addDecision(decision)}
                    >
                      {t("meeting.addToAgenda")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="composer-add-decisions" aria-labelledby="composer-case-files-heading">
            <h3 id="composer-case-files-heading">{t("meeting.addCaseFileHeading")}</h3>
            {candidateCaseFiles.length === 0 ? (
              <p className="composer-add-hint">{t("meeting.addCaseFileEmpty")}</p>
            ) : (
              <ul className="composer-decision-list">
                {candidateCaseFiles.map((caseFile) => (
                  <li key={caseFile.id}>
                    <span className="composer-item-copy">
                      <strong>{caseFile.title}</strong>
                      <span>{caseFile.reference}</span>
                    </span>
                    <Button
                      appearance="secondary"
                      size="small"
                      icon={<AddRegular />}
                      disabled={submitting}
                      onClick={() => addCaseFileItem(caseFile.id)}
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
              <select name="kind" aria-label={t("meeting.type")} defaultValue="information">
                {quickAddKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(agendaKindKeys[kind])}
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
