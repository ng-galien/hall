import { Button, Field } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowUploadRegular,
  DeleteRegular,
  DocumentRegular,
  EditRegular,
  GavelRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import type { DocumentMetadata } from "@mairie/domain";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MarkdownView } from "../components/MarkdownView";
import { EmptyState, Input, PageHeader, RequestErrorBanner, StatusBadge } from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useCaseFilesStore } from "../stores/caseFilesStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useDocumentsStore } from "../stores/documentsStore";
import { MeetingDocumentViewer } from "./council-meetings/MeetingDocumentViewer";

const documentCategoryKeys: Record<DocumentMetadata["category"], TranslationKey> = {
  supporting: "documentCategory.supporting",
  report: "documentCategory.report",
  draftCouncilDecision: "documentCategory.draftCouncilDecision",
  meetingNotice: "documentCategory.meetingNotice",
  minutes: "documentCategory.minutes",
  proxy: "documentCategory.proxy",
};

const caseFileDocumentCategories: DocumentMetadata["category"][] = ["report", "supporting", "draftCouncilDecision"];

export function CaseFilePage() {
  const { caseFileId = "" } = useParams();
  const { t, formatFileSize, formatDate } = useI18n();
  const { submitting, run } = useSubmitting();
  const { caseFiles, error } = useCaseFilesStore();
  const {
    councilDecisions,
    create: createDecision,
    update: updateDecision,
    error: decisionsError,
  } = useCouncilDecisionsStore();
  const { meetings } = useCouncilMeetingsStore();
  const { documents, upload, download, remove, error: documentsError } = useDocumentsStore();
  const [decisionFormOpen, setDecisionFormOpen] = useState(false);
  const [decisionDraftText, setDecisionDraftText] = useState("");
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [viewedDocument, setViewedDocument] = useState<DocumentMetadata | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const categorySelect = useRef<HTMLSelectElement | null>(null);

  const caseFile = caseFiles.find((item) => item.id === caseFileId) ?? null;
  if (!caseFile) {
    return (
      <div className="page">
        <PageHeader title={t("caseFiles.title")} description={t("caseFiles.description")} />
        <div className="page-content">
          <RequestErrorBanner error={error} />
          <EmptyState>{t("caseFiles.notFound")}</EmptyState>
        </div>
      </div>
    );
  }

  const caseDecisions = councilDecisions.filter((decision) => decision.caseFileId === caseFile.id);
  const caseDocuments = documents.filter((document) => document.caseFileId === caseFile.id);
  const meetingTitle = (meetingId: string | null) =>
    meetings.find((meeting) => meeting.id === meetingId)?.title ?? null;

  const uploadFiles = (files: FileList | File[]) => {
    void run(async () => {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("caseFileId", caseFile.id);
        form.set("category", categorySelect.current?.value ?? "supporting");
        form.set("file", file);
        if (!(await upload(form))) return false;
      }
      if (fileInput.current) fileInput.current.value = "";
      return true;
    });
  };

  const submitDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const created = await createDecision({
        caseFileId: caseFile.id,
        title: form.get("title"),
        draftText: decisionDraftText,
        legalityReviewRequired: true,
      });
      if (created) {
        setDecisionFormOpen(false);
        setDecisionDraftText("");
      }
      return created;
    });
  };

  const submitDecisionUpdate = async (event: FormEvent<HTMLFormElement>, decisionId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const saved = await updateDecision(decisionId, { title: form.get("title"), draftText: decisionDraftText });
      if (saved) {
        setEditingDecisionId(null);
        setDecisionDraftText("");
      }
      return saved;
    });
  };

  return (
    <div className="page">
      <PageHeader
        title={`${caseFile.reference} · ${caseFile.title}`}
        description={caseFile.summary || t("caseFiles.noSummary")}
        breadcrumbs={[
          { label: t("app.name"), to: "/" },
          { label: t("navigation.caseFiles"), to: "/case-files" },
          { label: caseFile.reference },
        ]}
      />
      <div className="page-content">
        <RequestErrorBanner error={decisionsError ?? documentsError} />
        <div className="case-file-status-row">
          <StatusBadge value={caseFile.status} />
          <span className="case-file-meta">
            {t("caseFiles.createdOn").replace("{date}", formatDate(caseFile.createdAt))}
          </span>
        </div>

        <div className="case-file-layout">
          <section className="case-file-section" aria-labelledby="case-decisions-heading">
            <header className="agenda-composer-heading">
              <div>
                <h2 id="case-decisions-heading">{t("decisions.title")}</h2>
                <p>{t("caseFiles.decisionsDescription")}</p>
              </div>
              <Button appearance="secondary" icon={<AddRegular />} onClick={() => setDecisionFormOpen((open) => !open)}>
                {t("decisions.create")}
              </Button>
            </header>
            {decisionFormOpen ? (
              <form className="case-file-decision-form" onSubmit={submitDecision}>
                <Field label={t("decisions.subject")} required>
                  <Input name="title" required />
                </Field>
                <Field label={t("decisions.draftText")}>
                  <MarkdownEditor markdown="" onChange={setDecisionDraftText} />
                </Field>
                <div className="composer-editor-actions">
                  <Button appearance="secondary" type="button" onClick={() => setDecisionFormOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button appearance="primary" type="submit" disabled={submitting}>
                    {t(submitting ? "common.saving" : "common.create")}
                  </Button>
                </div>
              </form>
            ) : null}
            {caseDecisions.length === 0 && !decisionFormOpen ? (
              <EmptyState>{t("caseFiles.noDecisions")}</EmptyState>
            ) : (
              <ul className="case-file-decision-list">
                {caseDecisions.map((decision) => {
                  const editable = ["draft", "ready", "scheduled"].includes(decision.status);
                  const editing = editingDecisionId === decision.id;
                  return (
                    <li key={decision.id}>
                      <div className="case-file-decision-heading">
                        <strong>{decision.title}</strong>
                        <span className="case-file-decision-tools">
                          <StatusBadge value={decision.status} />
                          {editable && !editing ? (
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<EditRegular />}
                              aria-label={t("decisions.edit")}
                              onClick={() => {
                                setEditingDecisionId(decision.id);
                                setDecisionFormOpen(false);
                                setDecisionDraftText(decision.draftText);
                              }}
                            />
                          ) : null}
                        </span>
                      </div>
                      {editing ? (
                        <form
                          className="case-file-decision-form"
                          onSubmit={(event) => void submitDecisionUpdate(event, decision.id)}
                        >
                          <Field label={t("decisions.subject")} required>
                            <Input name="title" defaultValue={decision.title} required />
                          </Field>
                          <Field label={t("decisions.draftText")}>
                            <MarkdownEditor markdown={decision.draftText} onChange={setDecisionDraftText} />
                          </Field>
                          <div className="composer-editor-actions">
                            <Button appearance="secondary" type="button" onClick={() => setEditingDecisionId(null)}>
                              {t("common.cancel")}
                            </Button>
                            <Button appearance="primary" type="submit" disabled={submitting}>
                              {t(submitting ? "common.saving" : "common.save")}
                            </Button>
                          </div>
                        </form>
                      ) : decision.draftText ? (
                        <MarkdownView markdown={decision.draftText} />
                      ) : null}
                      {decision.meetingId ? (
                        <Link className="decision-meeting-chip" to={`/meetings/${decision.meetingId}`}>
                          <GavelRegular aria-hidden="true" />
                          {meetingTitle(decision.meetingId) ?? t("navigation.meetings")}
                        </Link>
                      ) : (
                        <span className="decision-meeting-chip decision-meeting-chip-none">
                          {t("decisions.notScheduled")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            className={`case-file-section case-file-documents${dropActive ? " case-file-documents-drop" : ""}`}
            aria-labelledby="case-documents-heading"
            onDragOver={(event: DragEvent) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event: DragEvent) => {
              event.preventDefault();
              setDropActive(false);
              if (event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files);
            }}
          >
            <header className="agenda-composer-heading">
              <div>
                <h2 id="case-documents-heading">{t("caseFiles.documents")}</h2>
                <p>{t("caseFiles.documentsDescription")}</p>
              </div>
            </header>
            <div className="case-file-upload">
              <select ref={categorySelect} aria-label={t("documents.category")} defaultValue="supporting">
                {caseFileDocumentCategories.map((category) => (
                  <option key={category} value={category}>
                    {t(documentCategoryKeys[category])}
                  </option>
                ))}
              </select>
              <input
                ref={fileInput}
                type="file"
                multiple
                aria-label={t("documents.file")}
                className="visually-hidden-input"
                onChange={(event) => {
                  if (event.currentTarget.files?.length) uploadFiles(event.currentTarget.files);
                }}
              />
              <Button
                appearance="secondary"
                icon={<ArrowUploadRegular />}
                disabled={submitting}
                onClick={() => fileInput.current?.click()}
              >
                {t(submitting ? "common.saving" : "caseFiles.addDocument")}
              </Button>
              <span className="case-file-drop-hint">{t("caseFiles.dropHint")}</span>
            </div>
            {caseDocuments.length === 0 ? (
              <EmptyState>{t("meeting.supportingDocumentsEmpty")}</EmptyState>
            ) : (
              <ul className="case-file-document-list">
                {caseDocuments.map((document) => (
                  <li key={document.id}>
                    <DocumentRegular aria-hidden="true" />
                    <span className="composer-item-copy">
                      <strong>{document.fileName}</strong>
                      <span>
                        {t(documentCategoryKeys[document.category])} · {formatFileSize(document.byteSize)}
                      </span>
                    </span>
                    <span className="case-file-document-tools">
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<OpenRegular />}
                        aria-label={t("meeting.viewDocument").replace("{name}", document.fileName)}
                        onClick={() => setViewedDocument(document)}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<DeleteRegular />}
                        aria-label={t("documents.delete").replace("{name}", document.fileName)}
                        disabled={submitting}
                        onClick={() => void run(() => remove(document.id))}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <MeetingDocumentViewer
        document={viewedDocument}
        onClose={() => setViewedDocument(null)}
        onDownload={(document) => void download(document)}
      />
    </div>
  );
}
