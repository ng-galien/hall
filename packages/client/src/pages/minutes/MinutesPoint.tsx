import type { MinutesFacts as Facts } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { type Ref, useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveStatusIndicator } from "@/components/ui/save-status-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { ArrowDownIcon, ArrowUpIcon, EditIcon, HiddenIcon, UndoIcon, VisibleIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { Modal } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { MinutesAgendaFacts } from "./MinutesFacts";
import type { MinutesSaveStatus } from "./useMinutesDraft";

type AgendaFacts = Facts["agenda"][number];

type MinutesPointProps = {
  item: AgendaFacts;
  ballots: Facts["ballots"];
  editorialText: string;
  saveStatus: MinutesSaveStatus;
  canEdit: boolean;
  generating: boolean;
  /** The meeting notes of the point are shown beside or above its text. */
  showSourceNotes: boolean;
  onEdit(value: string): void;
  onBlur(): void;
};

function usePointTitle(item: AgendaFacts) {
  const { t } = useI18n();
  return matchLiteral(item.kind, {
    minutesApproval: () => t("agendaSubject.minutesApproval"),
    councilDecisionProposal: () => item.title,
    openQuestion: () => item.title,
  });
}

function PointTitle({ item, level }: { item: AgendaFacts; level: "h2" | "h3" }) {
  const { formatNumber } = useI18n();
  const title = usePointTitle(item);
  const Heading = level;
  return (
    <Heading className="minutes-point-title" id={`minutes-section-title-${item.id}`}>
      <span>{formatNumber(item.agendaNumber)}</span>
      <strong>{title}</strong>
    </Heading>
  );
}

/** The state mark of a point added to the agenda during the meeting, with the date of its addition. */
function AddedDuringMeeting({ item }: { item: AgendaFacts }) {
  const { t, formatDate } = useI18n();
  if (!item.introducedAt) return null;
  return (
    <p className="minutes-point-marks">
      <span className="list-row-status" data-tone="neutral" data-testid={`minutes-point-added-${item.id}`}>
        {t("minutes.addedDuringMeeting", { date: formatDate(item.introducedAt) })}
      </span>
    </p>
  );
}

function SaveStatus({ item, status }: { item: AgendaFacts; status: MinutesSaveStatus }) {
  const { t } = useI18n();
  const labels: Record<MinutesSaveStatus, string> = {
    idle: t("workspace.saved"),
    dirty: t("workspace.saveDirty"),
    saving: t("common.saving"),
    saved: t("workspace.saved"),
    error: t("common.saveFailed"),
  };
  return (
    <SaveStatusIndicator status={status} label={labels[status]} testId={`minutes-section-save-status-${item.id}`} />
  );
}

/**
 * « Remplacer la rédaction par la note de séance originale », offered while the text differs from the note, and its
 * confirmation.
 */
function RestoreSource({
  item,
  editorialText,
  generating,
  onEdit,
}: {
  item: AgendaFacts;
  editorialText: string;
  generating: boolean;
  onEdit(value: string): void;
}) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  if (editorialText === item.discussionSummary && !confirming) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="minutes-restore-trigger">
            <Button
              variant="plain"
              size="icon"
              data-testid={`minutes-restore-source-${item.id}`}
              aria-label={t("minutes.restoreSourceTooltip")}
              disabled={generating}
              onClick={() => setConfirming(true)}
            >
              <UndoIcon aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("minutes.restoreSourceTooltip")}</TooltipContent>
      </Tooltip>
      <Modal
        open={confirming}
        title={t("minutes.restoreSourceTitle")}
        testId={`minutes-restore-source-dialog-${item.id}`}
        onClose={() => {
          if (!generating) setConfirming(false);
        }}
      >
        <p>{t("minutes.restoreSourceConfirmation")}</p>
        <div className="minutes-restore-dialog-actions">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            data-testid={`minutes-restore-source-confirm-${item.id}`}
            disabled={generating}
            onClick={() => {
              onEdit(item.discussionSummary);
              setConfirming(false);
            }}
          >
            {t("minutes.restoreSourceNotes")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** The notes taken during the meeting for this point, for reading only. */
function SourceNotes({ item }: { item: AgendaFacts }) {
  const { t } = useI18n();
  const titleId = `minutes-source-title-${item.id}`;
  return (
    <section className="minutes-source" data-testid={`minutes-source-notes-${item.id}`} aria-labelledby={titleId}>
      <h4 id={titleId}>{t("minutes.sourceNotes")}</h4>
      {item.discussionSummary ? (
        <MarkdownView className="minutes-source-notes" markdown={item.discussionSummary} />
      ) : (
        <p className="minutes-empty-text">{t("minutes.noSourceNotes")}</p>
      )}
    </section>
  );
}

function EditorialReading({ item, editorialText }: { item: AgendaFacts; editorialText: string }) {
  const { t } = useI18n();
  return (
    <div className="minutes-editorial-reading" data-testid={`minutes-editorial-text-${item.id}`}>
      {editorialText.trim() ? (
        <MarkdownView markdown={editorialText} />
      ) : (
        <p className="minutes-empty-text">{t("minutes.noEditorialText")}</p>
      )}
    </div>
  );
}

/**
 * The command that shows or hides the meeting notes of every point at once (tablet and computer) or of the point
 * being written (phone).
 */
export function SourceNotesToggle({
  shown,
  testId,
  onChange,
}: {
  shown: boolean;
  testId: string;
  onChange(shown: boolean): void;
}) {
  const { t } = useI18n();
  return (
    <Button variant="plain" data-testid={testId} aria-pressed={shown} onClick={() => onChange(!shown)}>
      {shown ? <VisibleIcon aria-hidden="true" /> : <HiddenIcon aria-hidden="true" />}
      {t("minutes.sourceNotes")}
    </Button>
  );
}

/**
 * A point of the minutes on tablet and computer: its number, its title, its facts, then its text, written directly by
 * whoever may write it, and the meeting notes beside or above it when they are shown.
 */
// @implements-requirement HALL-FR-MIN-250
export function MinutesPoint({
  item,
  ballots,
  editorialText,
  saveStatus,
  canEdit,
  generating,
  showSourceNotes,
  onEdit,
  onBlur,
}: MinutesPointProps) {
  return (
    <section
      className="admin-record minutes-point"
      data-testid={`minutes-point-${item.id}`}
      aria-labelledby={`minutes-section-title-${item.id}`}
    >
      <div className="minutes-point-heading">
        <div className="minutes-point-heading-text">
          <PointTitle item={item} level="h3" />
          <AddedDuringMeeting item={item} />
        </div>
        {canEdit ? (
          <div className="minutes-editorial-controls">
            <SaveStatus item={item} status={saveStatus} />
            <RestoreSource item={item} editorialText={editorialText} generating={generating} onEdit={onEdit} />
          </div>
        ) : null}
      </div>
      <MinutesAgendaFacts item={item} ballots={ballots} />
      <div className="minutes-point-body" data-notes={showSourceNotes ? "shown" : undefined}>
        {showSourceNotes ? <SourceNotes item={item} /> : null}
        <div className="minutes-point-draft">
          {canEdit ? (
            <MarkdownEditor
              testId={`minutes-section-${item.id}`}
              markdown={editorialText}
              onChange={onEdit}
              onBlur={onBlur}
              readOnly={generating}
            />
          ) : (
            <EditorialReading item={item} editorialText={editorialText} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A point of the minutes read on a phone: its number, its title, its facts and its text, without editor; whoever may
 * write it opens its own writing screen with « Modifier ».
 */
// @implements-requirement HALL-FR-MIN-250
export function MinutesPhonePoint({
  item,
  ballots,
  editorialText,
  canEdit,
  editRef,
  onStartWriting,
}: {
  item: AgendaFacts;
  ballots: Facts["ballots"];
  editorialText: string;
  canEdit: boolean;
  editRef?: Ref<HTMLButtonElement>;
  onStartWriting(): void;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <section
      className="admin-record minutes-point minutes-phone-point"
      data-testid={`minutes-point-${item.id}`}
      aria-labelledby={`minutes-section-title-${item.id}`}
    >
      <div className="minutes-point-heading">
        <div className="minutes-point-heading-text">
          <PointTitle item={item} level="h3" />
          <AddedDuringMeeting item={item} />
        </div>
        {canEdit ? (
          <Button
            ref={editRef}
            variant="plain"
            size="icon"
            data-testid={`minutes-point-edit-${item.id}`}
            aria-label={t("minutes.editPoint", { number: formatNumber(item.agendaNumber) })}
            onClick={onStartWriting}
          >
            <EditIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <MinutesAgendaFacts item={item} ballots={ballots} />
      <EditorialReading item={item} editorialText={editorialText} />
    </section>
  );
}

/**
 * The writing screen of one point on a phone: its number and its title, the commands of the point, the meeting notes
 * when they are shown, then its text over the whole height with the common writing bar of the phone.
 */
// @implements-requirement HALL-FR-MIN-250
export function MinutesPointWriting({
  item,
  editorialText,
  saveStatus,
  generating,
  previous,
  next,
  onEdit,
  onBlur,
  onMove,
}: {
  item: AgendaFacts;
  editorialText: string;
  saveStatus: MinutesSaveStatus;
  generating: boolean;
  previous: AgendaFacts | null;
  next: AgendaFacts | null;
  onEdit(value: string): void;
  onBlur(): void;
  onMove(point: AgendaFacts): void;
}) {
  const { t } = useI18n();
  const [showSourceNotes, setShowSourceNotes] = useState(false);
  const title = usePointTitle(item);
  return (
    <section
      className="phone-minutes-writing"
      data-editing="true"
      data-testid="minutes-point-writing"
      aria-labelledby={`minutes-section-title-${item.id}`}
    >
      <div className="phone-minutes-writing-heading">
        <PointTitle item={item} level="h2" />
        <div className="phone-minutes-writing-commands">
          <SaveStatus item={item} status={saveStatus} />
          <span className="phone-minutes-writing-tools">
            <SourceNotesToggle
              shown={showSourceNotes}
              testId="minutes-point-writing-notes"
              onChange={setShowSourceNotes}
            />
            <RestoreSource item={item} editorialText={editorialText} generating={generating} onEdit={onEdit} />
            <Button
              variant="plain"
              size="icon"
              data-testid="minutes-point-writing-previous"
              aria-label={t("minutes.previousPoint")}
              disabled={!previous}
              onClick={() => {
                if (previous) onMove(previous);
              }}
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
            <Button
              variant="plain"
              size="icon"
              data-testid="minutes-point-writing-next"
              aria-label={t("minutes.nextPoint")}
              disabled={!next}
              onClick={() => {
                if (next) onMove(next);
              }}
            >
              <ArrowDownIcon aria-hidden="true" />
            </Button>
          </span>
        </div>
      </div>
      {showSourceNotes ? <SourceNotes item={item} /> : null}
      <div className="phone-minutes-writing-text">
        <MarkdownEditor
          key={item.id}
          testId={`minutes-section-${item.id}`}
          title={title}
          markdown={editorialText}
          onChange={onEdit}
          onBlur={onBlur}
          readOnly={generating}
          phoneWriting
        />
      </div>
    </section>
  );
}
