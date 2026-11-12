import {
  findSirenAction,
  findSirenLink,
  type MailMessage,
  type MailPreview,
  type MailRecipientGroup,
  type SirenEntity,
} from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { MailIcon, UploadIcon } from "../../components/icons";
import { ResourceSearchField } from "../../components/search/ResourceSearchField";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { CreateButton } from "../../components/ui/create-button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ListRow, ListRowIcon, type ListRowStatus, ListRows } from "../../components/ui/list-row";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, apiSirenRequest, type SirenApiResult, submitSirenAction } from "../../services/apiClient";
import {
  listMail,
  listMailGroups,
  listMailRecipients,
  type MailRecipientSelections,
  openMail,
  previewMail,
} from "../../services/mailApi";
import { MailGroups } from "./MailGroups";
import { MailRecipients } from "./MailRecipients";

const emptySelections: MailRecipientSelections = { contacts: [], councilContactIds: [], committees: [] };
// @implements-requirement HALL-FR-EML-020
export function MailPage() {
  const { t } = useI18n();
  const { mailId } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<SirenApiResult<MailMessage[]> | null>(null);
  const [opened, setOpened] = useState<SirenApiResult<MailMessage> | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<MailMessage | null>(null);
  const [selections, setSelections] = useState(emptySelections);
  const [groups, setGroups] = useState<MailRecipientGroup[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selectionKind, setSelectionKind] = useState<"to" | "cc" | "bcc">("to");
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [review, setReview] = useState<SirenApiResult<MailPreview> | null>(null);
  const historicalReview = review?.representation?.class?.includes("mail-submission-preview") ?? false;
  const [requestKey, setRequestKey] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<SirenEntity | null>(null);
  const [verificationOutcome, setVerificationOutcome] = useState<"sent" | "not-sent">("sent");
  const [verificationNotes, setVerificationNotes] = useState("");
  const dirty = Boolean(
    draft &&
      opened &&
      (draft.subject !== opened.data.subject ||
        draft.bodyMarkdown !== opened.data.bodyMarkdown ||
        JSON.stringify(draft.recipients) !== JSON.stringify(opened.data.recipients)),
  );
  const blocker = useBlocker(dirty);
  const refresh = useCallback(async () => {
    setCollection(await listMail());
    setGroups((await listMailGroups()).data);
  }, []);
  useEffect(() => {
    void refresh().catch(setError);
    void listMailRecipients()
      .then((result) => setSelections(result.data))
      .catch(setError);
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setOpened(null);
    setDraft(null);
    setReview(null);
    setError(null);
    if (mailId)
      void openMail(mailId)
        .then((result) => {
          if (active) {
            setOpened(result);
            setDraft(result.data);
            setCopiesOpen(result.data.recipients.some((entry) => entry.kind !== "to"));
          }
        })
        .catch((cause) => {
          if (active) setError(cause);
        });
    return () => {
      active = false;
    };
  }, [mailId]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const operation = async <T,>(callback: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await callback();
    } catch (cause) {
      setError(cause);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const adopt = (result: SirenApiResult<MailMessage>) => {
    setOpened(result);
    setDraft(result.data);
  };
  const save = async () => {
    if (!draft || !opened?.representation) return null;
    if (!dirty) return opened;
    const result = await submitSirenAction<MailMessage>(opened.representation, "mail.update", {
      subject: draft.subject,
      bodyMarkdown: draft.bodyMarkdown,
      recipients: draft.recipients,
      expectedRevision: draft.revision,
    });
    adopt(result);
    await refresh();
    return result;
  };
  const create = () =>
    operation(async () => {
      if (!collection?.representation) return;
      const result = await submitSirenAction<MailMessage>(collection.representation, "mail.create", {});
      await refresh();
      navigate(`/mail/${result.data.id}`);
    });
  const editable = Boolean(opened?.representation && findSirenAction(opened.representation, "mail.update"));
  const status = (message: MailMessage): ListRowStatus => {
    const latest = message.submissions[0];
    if (!latest) return { tone: "neutral", label: t("mail.draft") };
    if (latest.verification?.outcome === "sent") return { tone: "success", label: t("mail.accepted") };
    if (latest.verification?.outcome === "not-sent") return { tone: "neutral", label: t("mail.verifiedNotSent") };
    return {
      tone: matchLiteral(latest.status, {
        submitting: () => "neutral" as const,
        accepted: () => "success" as const,
        failed: () => "danger" as const,
        unknown: () => "neutral" as const,
      }),
      label: t(`mail.${latest.status}`),
    };
  };
  const applySelection = (key: string) => {
    if (!draft) return;
    const ids =
      key === "council"
        ? selections.councilContactIds
        : selections.committees.find((entry) => `committee:${entry.id}` === key)?.contactIds;
    const selected = ids
      ? selections.contacts.filter((contact) => contact.contactId && ids.includes(contact.contactId))
      : (groups.find((group) => `group:${group.id}` === key)?.members ?? []);
    const recipients = [...draft.recipients];
    for (const member of selected) {
      if (
        !recipients.some(
          (entry) =>
            entry.kind === selectionKind &&
            (member.address
              ? entry.address.toLowerCase() === member.address.toLowerCase()
              : entry.contactId === member.contactId),
        )
      )
        recipients.push({ ...member, kind: selectionKind });
    }
    setDraft({ ...draft, recipients });
  };
  return (
    <div className="page">
      <PageHeader title={t("mail.title")} description={t("mail.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error ? apiErrorCode(error) : null} />
        <div className="mail-toolbar">
          <CreateButton
            testId="mail-new"
            options={
              collection?.representation && findSirenAction(collection.representation, "mail.create") && !busy
                ? [
                    {
                      id: "mail",
                      label: t("mail.new"),
                      Icon: MailIcon,
                      nature: "writing",
                      onSelect: () => void create(),
                    },
                  ]
                : []
            }
          />
          <Button variant="secondary" data-testid="mail-groups" onClick={() => setGroupsOpen(true)}>
            {t("mail.groups")}
          </Button>
        </div>
        <div className="grid min-h-96 gap-5 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
          <div className={`${mailId ? "hidden lg:block" : ""} min-w-0 border-r pr-4`} data-testid="mail-list">
            {collection?.data.length === 0 ? (
              <EmptyState>{t("mail.empty")}</EmptyState>
            ) : (
              <ListRows>
                {collection?.data.map((message) => (
                  <ListRow
                    key={message.id}
                    to={`/mail/${message.id}`}
                    openTestId={`mail-open-${message.id}`}
                    selected={message.id === mailId}
                    head={
                      <ListRowIcon nature="writing">
                        <MailIcon />
                      </ListRowIcon>
                    }
                    title={message.subject || t("mail.noSubject")}
                    detail={
                      message.recipients.map((entry) => entry.name || entry.address).join(", ") ||
                      t("mail.noRecipients")
                    }
                    status={status(message)}
                  />
                ))}
              </ListRows>
            )}
          </div>
          {draft && opened?.representation ? (
            <section className="min-w-0" data-testid="mail-composer">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <Button variant="plain" className="lg:hidden" data-testid="mail-back" onClick={() => navigate("/mail")}>
                  {t("common.back")}
                </Button>
                <span className="record-state mail-state" data-tone={status(draft).tone}>
                  {status(draft).label}
                </span>
                {findSirenAction(opened.representation, "mail.delete") ? (
                  <Button
                    variant="secondary"
                    data-testid="mail-delete"
                    disabled={busy}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}

                {editable ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy || !dirty}
                      data-testid="mail-save"
                      onClick={() => void operation(save)}
                    >
                      {t("common.save")}
                    </Button>
                    <Button
                      disabled={busy}
                      data-testid="mail-review"
                      onClick={() =>
                        void operation(async () => {
                          const saved = await save();
                          if (saved) {
                            setReview(await previewMail(saved.data.id));
                            setRequestKey(crypto.randomUUID());
                          }
                        })
                      }
                    >
                      {t("mail.review")}
                    </Button>
                  </>
                ) : null}
                {!editable && findSirenAction(opened.representation, "mail.copy") ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    data-testid="mail-copy"
                    onClick={() =>
                      void operation(async () => {
                        const result = await submitSirenAction<MailMessage>(opened.representation!, "mail.copy", {
                          expectedRevision: draft.revision,
                        });
                        await refresh();
                        navigate(`/mail/${result.data.id}`);
                      })
                    }
                  >
                    {t("mail.copy")}
                  </Button>
                ) : null}
              </div>
              <MailRecipients
                kind="to"
                recipients={draft.recipients}
                contacts={selections.contacts}
                disabled={!editable || busy}
                testId="mail-to"
                onChange={(recipients) => setDraft({ ...draft, recipients })}
              />
              {editable ? (
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  {copiesOpen ? (
                    <Select
                      value={selectionKind}
                      onValueChange={(value) => {
                        if (value === "to" || value === "cc" || value === "bcc") setSelectionKind(value);
                      }}
                    >
                      <SelectTrigger data-testid="mail-group-recipient-kind" className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["to", "cc", "bcc"] as const).map((kind) => (
                          <SelectItem key={kind} value={kind} data-testid={`mail-group-recipient-kind-${kind}`}>
                            {t(`mail.${kind}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Select value="" onValueChange={applySelection}>
                    <SelectTrigger className="w-auto min-w-44" data-testid="mail-recipient-selection">
                      <SelectValue placeholder={t("mail.selectGroup")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="council" data-testid="mail-select-council">
                        {t("mail.council")}
                      </SelectItem>
                      {selections.committees.map((group) => (
                        <SelectItem
                          key={group.id}
                          value={`committee:${group.id}`}
                          data-testid={`mail-select-committee-${group.id}`}
                        >
                          {group.name}
                        </SelectItem>
                      ))}
                      {groups.map((group) => (
                        <SelectItem
                          key={group.id}
                          value={`group:${group.id}`}
                          data-testid={`mail-select-group-${group.id}`}
                        >
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="plain"
                    data-testid="mail-toggle-copies"
                    onClick={() => {
                      setCopiesOpen(!copiesOpen);
                      setSelectionKind("to");
                    }}
                  >
                    Cc / Cci
                  </Button>
                </div>
              ) : null}
              {copiesOpen
                ? (["cc", "bcc"] as const).map((kind) => (
                    <MailRecipients
                      key={kind}
                      kind={kind}
                      recipients={draft.recipients}
                      contacts={selections.contacts}
                      disabled={!editable || busy}
                      testId={`mail-${kind}`}
                      onChange={(recipients) => setDraft({ ...draft, recipients })}
                    />
                  ))
                : null}
              <Field label={t("mail.subject")} className="mail-subject">
                <Input
                  data-testid="mail-subject"
                  value={draft.subject}
                  disabled={!editable || busy}
                  onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                />
              </Field>
              <div className="py-4">
                <MarkdownEditor
                  testId="mail-body"
                  markdown={draft.bodyMarkdown}
                  onChange={(bodyMarkdown) => setDraft({ ...draft, bodyMarkdown })}
                  readOnly={!editable || busy}
                />
              </div>
              <div className="grid gap-2 border-t pt-3">
                {draft.attachments.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 text-sm">
                    <a
                      className="truncate underline"
                      data-testid={`mail-attachment-${file.id}`}
                      href={`/api/mail/${draft.id}/attachments/${file.id}/content`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.fileName}
                    </a>
                    <span className="text-muted-foreground">{Math.ceil(file.byteSize / 1024)} Ko</span>
                    {editable ? (
                      <Button
                        variant="secondary"
                        data-testid={`mail-attachment-remove-${file.id}`}
                        disabled={busy}
                        onClick={() =>
                          void operation(async () => {
                            const saved = await save();
                            const entity = saved?.representation?.entities?.find(
                              (entry) => "properties" in entry && entry.properties?.id === file.id,
                            );
                            if (entity && "properties" in entity) {
                              adopt(
                                await submitSirenAction<MailMessage>(entity, "mail.remove-attachment", {
                                  expectedRevision: saved!.data.revision,
                                  attachmentId: file.id,
                                }),
                              );
                              await refresh();
                            }
                          })
                        }
                      >
                        {t("mail.remove")}
                      </Button>
                    ) : null}
                  </div>
                ))}
                {findSirenAction(opened.representation, "mail.upload-attachment") ? (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      data-testid="mail-upload-open"
                      onClick={() => uploadInput.current?.click()}
                    >
                      <UploadIcon />
                      {t("mail.upload")}
                    </Button>
                    <input
                      ref={uploadInput}
                      hidden
                      type="file"
                      data-testid="mail-upload"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        void operation(async () => {
                          const saved = await save();
                          if (!saved?.representation) return;
                          const form = new FormData();
                          form.set("file", file);
                          form.set("expectedRevision", String(saved.data.revision));
                          adopt(
                            await submitSirenAction<MailMessage>(saved.representation, "mail.upload-attachment", form),
                          );
                          await refresh();
                        });
                      }}
                    />
                  </div>
                ) : null}
                {editable ? (
                  <ResourceSearchField
                    testId="mail-attach"
                    label={t("mail.attach")}
                    disabled={busy}
                    scope={{ types: ["document"] }}
                    onPick={(item) =>
                      void operation(async () => {
                        const saved = await save();
                        if (saved?.representation) {
                          adopt(
                            await submitSirenAction<MailMessage>(saved.representation, "mail.attach", {
                              expectedRevision: saved.data.revision,
                              resourceId: item.id,
                            }),
                          );
                          await refresh();
                        }
                      })
                    }
                  />
                ) : null}
              </div>
              {draft.submissions.map((submission) => (
                <div
                  key={submission.id}
                  className="mt-4 border-t pt-3 text-sm"
                  data-testid={`mail-submission-${submission.id}`}
                >
                  <p>
                    {t(`mail.${submission.status}`)} · {new Date(submission.startedAt).toLocaleString()}
                  </p>
                  <Button
                    variant="plain"
                    data-testid={`mail-submission-preview-${submission.id}`}
                    onClick={() =>
                      void operation(async () =>
                        setReview(
                          await apiSirenRequest<MailPreview>(`/mail/${draft.id}/submissions/${submission.id}/preview`),
                        ),
                      )
                    }
                  >
                    {t("mail.preview")}
                  </Button>
                  {submission.errorCode ? (
                    <p className="text-muted-foreground">
                      {t(submission.status === "unknown" ? "mail.unknownHelp" : "mail.failedHelp")}
                    </p>
                  ) : null}
                  {submission.verification ? (
                    <p>
                      {t(submission.verification.outcome === "sent" ? "mail.verifiedSent" : "mail.verifiedNotSent")} ·{" "}
                      {submission.verification.notes}
                    </p>
                  ) : null}
                  {(() => {
                    const entity = opened.representation?.entities?.find(
                      (entry) => "properties" in entry && entry.properties?.id === submission.id,
                    );
                    return entity && "properties" in entity && findSirenAction(entity, "mail.verify-submission") ? (
                      <Button
                        variant="secondary"
                        className="mt-2"
                        data-testid="mail-verify"
                        onClick={() => {
                          setVerification(entity);
                          setVerificationNotes("");
                        }}
                      >
                        {t("mail.verify")}
                      </Button>
                    ) : null;
                  })()}
                </div>
              ))}
            </section>
          ) : (
            <div className="hidden items-center justify-center text-muted-foreground lg:flex">
              <MailIcon className="mr-2" />
              {t("mail.selectMessage")}
            </div>
          )}
        </div>
        {deleteOpen && opened?.representation ? (
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
                    await submitSirenAction(opened.representation!, "mail.delete", {
                      expectedRevision: opened.data.revision,
                    });
                    setDeleteOpen(false);
                    setDraft(null);
                    setOpened(null);
                    await refresh();
                    navigate("/mail");
                  })
                }
              >
                {t("common.delete")}
              </Button>
            </div>
          </Modal>
        ) : null}
        {groupsOpen ? (
          <MailGroups
            contacts={selections.contacts}
            onClose={() => setGroupsOpen(false)}
            onChanged={() => void refresh().catch(setError)}
          />
        ) : null}
        {review ? (
          <Modal
            open
            testId="mail-review-dialog"
            title={t(historicalReview ? "mail.preview" : "mail.review")}
            onClose={() => setReview(null)}
          >
            <div className="grid gap-3">
              <p>{review.data.subject || t("mail.noSubject")}</p>
              <p className="text-sm">{review.data.senderAddress}</p>
              {(["to", "cc", "bcc"] as const).map((kind) => (
                <p key={kind} className="break-words text-sm">
                  {t(`mail.${kind}`)} :{" "}
                  {review.data.recipients
                    .filter((entry) => entry.kind === kind)
                    .map((entry) => entry.address || entry.name)
                    .join(", ")}
                </p>
              ))}
              <iframe
                title={t("mail.preview")}
                data-testid="mail-preview-body"
                sandbox=""
                srcDoc={review.data.html}
                className="h-72 w-full rounded border bg-white"
              />
              <div className="grid gap-1">
                {review.data.attachments.map((file) => {
                  const entity = review.representation?.entities?.find(
                    (entry) => "properties" in entry && entry.properties?.id === file.id,
                  );
                  const href = entity && "properties" in entity ? findSirenLink(entity, "content")?.href : undefined;
                  return href ? (
                    <a
                      key={file.id}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                      data-testid={`mail-review-attachment-${file.id}`}
                    >
                      {file.fileName}
                    </a>
                  ) : (
                    <span key={file.id}>{file.fileName}</span>
                  );
                })}
              </div>
              {review.data.issues.map((issue) => (
                <p key={`${issue.code}-${issue.recipientIndex ?? "message"}`} className="text-destructive">
                  {t(`mail.issue.${issue.code}`)}
                </p>
              ))}
              {review.representation && findSirenAction(review.representation, "mail.send") ? (
                <Button
                  data-testid="mail-send-confirm"
                  disabled={busy}
                  onClick={() =>
                    void operation(async () => {
                      adopt(
                        await submitSirenAction<MailMessage>(review.representation!, "mail.send", {
                          expectedRevision: review.data.revision,
                          fingerprint: review.data.fingerprint,
                          requestKey,
                        }),
                      );
                      setReview(null);
                      await refresh();
                    })
                  }
                >
                  {t("mail.send")}
                </Button>
              ) : historicalReview ? null : (
                <p className="text-sm text-muted-foreground">{t("mail.sendUnavailable")}</p>
              )}
            </div>
          </Modal>
        ) : null}
        {verification ? (
          <Modal open testId="mail-verify-dialog" title={t("mail.verify")} onClose={() => setVerification(null)}>
            <div className="modal-form">
              <p>{t("mail.verificationHelp")}</p>
              <Field label={t("mail.verificationOutcome")}>
                <Select
                  value={verificationOutcome}
                  onValueChange={(value) => setVerificationOutcome(value === "sent" ? "sent" : "not-sent")}
                >
                  <SelectTrigger data-testid="mail-verification-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sent" data-testid="mail-verification-sent">
                      {t("mail.verifiedSent")}
                    </SelectItem>
                    <SelectItem value="not-sent" data-testid="mail-verification-not-sent">
                      {t("mail.verifiedNotSent")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("mail.verificationNotes")}>
                <Input
                  data-testid="mail-verification-notes"
                  value={verificationNotes}
                  onChange={(event) => setVerificationNotes(event.target.value)}
                />
              </Field>
              <div className="dialog-actions">
                <Button variant="secondary" onClick={() => setVerification(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  data-testid="mail-verification-confirm"
                  disabled={busy || !verificationNotes.trim()}
                  onClick={() =>
                    void operation(async () => {
                      adopt(
                        await submitSirenAction<MailMessage>(verification, "mail.verify-submission", {
                          outcome: verificationOutcome,
                          notes: verificationNotes,
                        }),
                      );
                      setVerification(null);
                      await refresh();
                    })
                  }
                >
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </Modal>
        ) : null}
        {blocker.state === "blocked" ? (
          <Modal open title={t("mail.unsaved")} onClose={() => blocker.reset()}>
            <p>{t("mail.unsavedHelp")}</p>
            <div className="dialog-actions">
              <Button variant="secondary" data-testid="mail-discard" onClick={() => blocker.proceed()}>
                {t("mail.discard")}
              </Button>
              <Button
                data-testid="mail-save-leave"
                disabled={busy}
                onClick={() =>
                  void operation(async () => {
                    await save();
                    blocker.proceed();
                  })
                }
              >
                {t("common.save")}
              </Button>
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}
