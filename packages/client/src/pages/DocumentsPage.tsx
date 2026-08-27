import { Button, Field } from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import type { DocumentMetadata } from "@mairie/domain";
import { type FormEvent, useState } from "react";
import {
  CollectionToolbar,
  EmptyState,
  Modal,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../components/Ui";
import { useSubmitting } from "../hooks/useSubmitting";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import { useCaseFilesStore } from "../stores/caseFilesStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useDocumentsStore } from "../stores/documentsStore";

export function DocumentsPage() {
  const { t, formatDate, formatFileSize } = useI18n();
  const { documents, upload, download, remove, error } = useDocumentsStore();
  const { caseFiles } = useCaseFilesStore();
  const { meetings } = useCouncilMeetingsStore();
  const { submitting, run } = useSubmitting();
  const [addOpen, setAddOpen] = useState(false);
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const categoryKeys: Record<DocumentMetadata["category"], TranslationKey> = {
    supporting: "documentCategory.supporting",
    report: "documentCategory.report",
    draftCouncilDecision: "documentCategory.draftCouncilDecision",
    meetingNotice: "documentCategory.meetingNotice",
    minutes: "documentCategory.minutes",
    proxy: "documentCategory.proxy",
  };
  const attachmentLabel = (document: DocumentMetadata) => {
    const caseFile = caseFiles.find((item) => item.id === document.caseFileId);
    if (caseFile) return `${caseFile.reference} · ${caseFile.title}`;
    const meeting = meetings.find((item) => item.id === document.meetingId);
    if (meeting) return meeting.title;
    return t("documents.unattached");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    await run(async () => {
      const form = new FormData(formElement);
      const uploaded = await upload(form);
      if (uploaded) {
        formElement.reset();
        setAddOpen(false);
      }
      return uploaded;
    });
  };
  return (
    <div className="page">
      <PageHeader title={t("documents.title")} description={t("documents.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout}>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddOpen(true)}>
            {t("documents.add")}
          </Button>
        </CollectionToolbar>
        <Modal open={addOpen} title={t("documents.add")} onClose={() => setAddOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <p className="text-sm text-muted">{t("documents.targetDescription")}</p>
            <div className="form-grid">
              <Field label={t("documents.caseFile")}>
                <select name="caseFileId">
                  <option value="">{t("common.select")}</option>
                  {caseFiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.reference} · {item.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("documents.meeting")}>
                <select name="meetingId">
                  <option value="">{t("common.select")}</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("documents.category")} required>
                <select name="category" defaultValue="supporting">
                  {Object.entries(categoryKeys).map(([category, key]) => (
                    <option key={category} value={category}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t("documents.file")} required>
              <input name="file" type="file" required />
            </Field>
            <Button type="submit" appearance="primary" disabled={submitting}>
              {t(submitting ? "common.saving" : "common.add")}
            </Button>
          </form>
        </Modal>
        {(() => {
          const visibleDocuments = documents.filter((item) =>
            matchesQuery(query, item.fileName, attachmentLabel(item), t(categoryKeys[item.category])),
          );
          if (visibleDocuments.length === 0) {
            return <EmptyState>{t(documents.length === 0 ? "documents.empty" : "common.noSearchResults")}</EmptyState>;
          }
          if (layout === "cards") {
            return (
              <div className="card-grid">
                {visibleDocuments.map((item) => (
                  <div className="entity-card" key={item.id}>
                    <span className="entity-card-eyebrow">
                      {t(categoryKeys[item.category])} · {formatFileSize(item.byteSize)}
                    </span>
                    <strong>{item.fileName}</strong>
                    <p>{attachmentLabel(item)}</p>
                    <span className="entity-card-footer entity-card-footer-actions">
                      <span>{formatDate(item.createdAt)}</span>
                      <span>
                        <Button appearance="secondary" size="small" onClick={() => void download(item)}>
                          {t("common.download")}
                        </Button>
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<DeleteRegular />}
                          aria-label={t("documents.delete").replace("{name}", item.fileName)}
                          disabled={submitting}
                          onClick={() => void run(() => remove(item.id))}
                        />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div className="data-list">
              {visibleDocuments.map((item) => (
                <div className="data-row" key={item.id}>
                  <button type="button" className="data-row-open" onClick={() => void download(item)}>
                    <strong>{item.fileName}</strong>
                    <span>
                      {t(categoryKeys[item.category])} · {formatFileSize(item.byteSize)} · {attachmentLabel(item)}
                    </span>
                  </button>
                  <span className="data-row-side">
                    <span>{formatDate(item.createdAt)}</span>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DeleteRegular />}
                      aria-label={t("documents.delete").replace("{name}", item.fileName)}
                      disabled={submitting}
                      onClick={() => void run(() => remove(item.id))}
                    />
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
