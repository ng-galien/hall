import { findSirenAction, type MailMessage, type MailPreview } from "@hall/api-contract";
import { useRef, useState } from "react";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { AttachIcon, FileIcon, MoreIcon, UploadIcon } from "../../components/icons";
import { ResourceSearch } from "../../components/search/ResourceSearch";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, type SirenApiResult, submitSirenAction } from "../../services/apiClient";
import { type MailRecipientSelections, previewMail } from "../../services/mailApi";
import { ScreenActions } from "../../shell/headerTrail";
import { MailAttachments } from "./MailAttachments";
import { MailReview } from "./MailReview";
import type { RecipientGroup } from "./mailFolders";
import { RecipientLine } from "./RecipientLine";
import { useMailAutosave } from "./useMailAutosave";

/**
 * A draft being written, laid out as in a usual mailbox: the « À » line where one types, « Cc » and « Cci » as links,
 * the subject, the body over the remaining height and one « Joindre » command with two choices. The draft saves itself;
 * « Envoyer » opens the review before any sending, and « Supprimer » and « Gérer les groupes… » are in the « … » menu.
 * @implements-requirement HALL-FR-EML-020
 * @implements-requirement HALL-FR-EML-100
 */
export function MailEditor({
  initial,
  groups,
  contacts,
  onChanged,
  onDeleted,
  onSent,
  onManageGroups,
  onCreate,
}: {
  initial: SirenApiResult<MailMessage>;
  groups: RecipientGroup[];
  contacts: MailRecipientSelections["contacts"];
  onChanged(): void;
  onDeleted(): void;
  /** Called once the message is handed to the mailbox of the commune, with the stored message. */
  onSent(result: SirenApiResult<MailMessage>): void;
  onManageGroups(): void;
  onCreate?: () => void;
}) {
  const { t } = useI18n();
  const { stored, draft, setDraft, status, error: saveError, flush, adopt } = useMailAutosave(initial, onChanged);
  const representation = stored.representation;
  const uploadInput = useRef<HTMLInputElement>(null);
  const [copies, setCopies] = useState(() => ({
    cc: initial.data.recipients.some((entry) => entry.kind === "cc"),
    bcc: initial.data.recipients.some((entry) => entry.kind === "bcc"),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [documentPicker, setDocumentPicker] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [review, setReview] = useState<SirenApiResult<MailPreview> | null>(null);
  const operation = async (callback: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await callback();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  const afterSave = async (callback: (saved: SirenApiResult<MailMessage>) => Promise<void>) =>
    operation(async () => {
      const saved = await flush();
      if (saved?.representation) await callback(saved);
    });
  const canUpload = Boolean(representation && findSirenAction(representation, "mail.upload-attachment"));
  const canAttach = Boolean(representation && findSirenAction(representation, "mail.attach"));
  const canDelete = Boolean(representation && findSirenAction(representation, "mail.delete"));
  const saveLabel = t(
    status === "saved"
      ? "mail.saved"
      : status === "saving"
        ? "common.saving"
        : status === "dirty"
          ? "workspace.saveDirty"
          : "mail.saveFailed",
  );
  const copyLink = (kind: "cc" | "bcc") =>
    copies[kind] ? null : (
      <Button
        variant="plain"
        className="mail-copy-link"
        data-testid={`mail-add-${kind}`}
        onClick={() => setCopies({ ...copies, [kind]: true })}
      >
        {t(`mail.${kind}`)}
      </Button>
    );
  return (
    <section className="mail-composer" data-testid="mail-composer">
      <ScreenActions>
        <span className="record-state mail-save-state" data-save={status} data-testid="mail-save-state">
          {saveLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="plain" size="icon" data-testid="mail-more" aria-label={t("mail.more")}>
              <MoreIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onCreate ? (
              <DropdownMenuItem data-testid="mail-more-new" onSelect={onCreate}>
                {t("mail.new")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem data-testid="mail-more-groups" onSelect={onManageGroups}>
              {t("mail.manageGroups")}
            </DropdownMenuItem>
            {canDelete ? (
              <DropdownMenuItem data-testid="mail-delete" variant="destructive" onSelect={() => setDeleteOpen(true)}>
                {t("common.delete")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          data-testid="mail-send"
          disabled={busy}
          onClick={() =>
            void afterSave(async (saved) => {
              setReview(await previewMail(saved.data.id));
            })
          }
        >
          {t("mail.send")}
        </Button>
      </ScreenActions>
      <RequestErrorBanner error={(error ?? saveError) ? apiErrorCode(error ?? saveError) : null} />
      <div className="mail-composer-head">
        <RecipientLine
          kind="to"
          recipients={draft.recipients}
          groups={groups}
          contacts={contacts}
          disabled={busy}
          testId="mail-to"
          onChange={(recipients) => setDraft({ ...draft, recipients })}
          onManageGroups={onManageGroups}
          trailing={
            <>
              {copyLink("cc")}
              {copyLink("bcc")}
            </>
          }
        />
        {(["cc", "bcc"] as const).map((kind) =>
          copies[kind] ? (
            <RecipientLine
              key={kind}
              kind={kind}
              recipients={draft.recipients}
              groups={groups}
              contacts={contacts}
              disabled={busy}
              testId={`mail-${kind}`}
              onChange={(recipients) => setDraft({ ...draft, recipients })}
              onManageGroups={onManageGroups}
            />
          ) : null,
        )}
        <label className="mail-subject-line">
          <span className="mail-recipient-kind">{t("mail.subject")}</span>
          <input
            className="mail-subject-input"
            data-testid="mail-subject"
            value={draft.subject}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
          />
        </label>
      </div>
      <div className="mail-body">
        <MarkdownEditor
          testId="mail-body"
          markdown={draft.bodyMarkdown}
          onChange={(bodyMarkdown) => setDraft({ ...draft, bodyMarkdown })}
          readOnly={busy}
        />
      </div>
      <div className="mail-composer-foot">
        <MailAttachments
          message={draft}
          disabled={busy}
          onRemove={(file) =>
            void afterSave(async (saved) => {
              const entity = saved.representation?.entities?.find(
                (entry) => "properties" in entry && entry.properties?.id === file.id,
              );
              if (!entity || !("properties" in entity)) return;
              adopt(
                await submitSirenAction<MailMessage>(entity, "mail.remove-attachment", {
                  expectedRevision: saved.data.revision,
                  attachmentId: file.id,
                }),
              );
              onChanged();
            })
          }
        />
        {canUpload || canAttach ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="mail-attach" data-testid="mail-attach" disabled={busy}>
                <AttachIcon />
                {t("mail.attach")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canUpload ? (
                <DropdownMenuItem data-testid="mail-attach-file" onSelect={() => uploadInput.current?.click()}>
                  <UploadIcon />
                  {t("mail.attachFile")}
                </DropdownMenuItem>
              ) : null}
              {canAttach ? (
                <DropdownMenuItem data-testid="mail-attach-document" onSelect={() => setDocumentPicker(true)}>
                  <FileIcon />
                  {t("mail.attachDocument")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <input
          ref={uploadInput}
          hidden
          type="file"
          data-testid="mail-upload"
          disabled={busy || !canUpload}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void afterSave(async (saved) => {
              const form = new FormData();
              form.set("file", file);
              form.set("expectedRevision", String(saved.data.revision));
              adopt(await submitSirenAction<MailMessage>(saved.representation!, "mail.upload-attachment", form));
              onChanged();
            });
          }}
        />
      </div>
      {documentPicker ? (
        <Modal
          open
          testId="mail-attach-document-dialog"
          title={t("mail.attachDocument")}
          onClose={() => setDocumentPicker(false)}
        >
          <ResourceSearch
            testId="mail-attach-search"
            scope={{ types: ["document"] }}
            onClose={() => setDocumentPicker(false)}
            onPick={(item) => {
              setDocumentPicker(false);
              void afterSave(async (saved) => {
                adopt(
                  await submitSirenAction<MailMessage>(saved.representation!, "mail.attach", {
                    expectedRevision: saved.data.revision,
                    resourceId: item.id,
                  }),
                );
                onChanged();
              });
            }}
          />
        </Modal>
      ) : null}
      {deleteOpen && representation ? (
        <Modal open testId="mail-delete-dialog" title={t("mail.deleteDraft")} onClose={() => setDeleteOpen(false)}>
          <p>{t("mail.deleteDraftHelp")}</p>
          <div className="dialog-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              data-testid="mail-delete-confirm"
              onClick={() =>
                void operation(async () => {
                  const saved = (await flush()) ?? stored;
                  await submitSirenAction(saved.representation ?? representation, "mail.delete", {
                    expectedRevision: saved.data.revision,
                  });
                  setDeleteOpen(false);
                  onDeleted();
                })
              }
            >
              {t("common.delete")}
            </Button>
          </div>
        </Modal>
      ) : null}
      {review ? (
        <MailReview
          review={review}
          onClose={() => setReview(null)}
          onSent={(result) => {
            setReview(null);
            onSent(result);
          }}
        />
      ) : null}
    </section>
  );
}
