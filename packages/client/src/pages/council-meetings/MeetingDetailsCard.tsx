import { type DocumentaryResource, type DocumentCategory, meetingAgendaCanChange } from "@hall/domain";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircleIcon, FileIcon, OpenIcon, UploadIcon, WarningIcon } from "../../components/icons";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { useResourcesStore } from "../../stores/resourcesStore";
import { MeetingDocumentViewer } from "./MeetingDocumentViewer";

export const documentCategoryKeys: Record<DocumentCategory, TranslationKey> = {
  supporting: "documentCategory.supporting",
  report: "documentCategory.report",
  draftCouncilDecision: "documentCategory.draftCouncilDecision",
  meetingNotice: "documentCategory.meetingNotice",
  minutes: "documentCategory.minutes",
  proxy: "documentCategory.proxy",
};

const meetingDocumentCategories: DocumentCategory[] = ["meetingNotice", "proxy", "supporting"];

export function MeetingDetailsCard({
  aggregate,
  documents,
  documentsEditable,
}: {
  aggregate: LiveMeetingPresentation;
  documents: DocumentaryResource[];
  documentsEditable: boolean;
}) {
  const { t, formatFileSize } = useI18n();
  const { submitting, run } = useSubmitting();
  const { upload, download } = useResourcesStore();
  const { meeting } = aggregate;
  const [viewedDocument, setViewedDocument] = useState<DocumentaryResource | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>("meetingNotice");
  const uploadMeetingDocument = () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("meetingId", meeting.id);
    form.set("category", uploadCategory);
    form.set("file", file);
    void run(async () => {
      const uploaded = await upload(form);
      if (uploaded && fileInput.current) fileInput.current.value = "";
      return uploaded;
    });
  };

  return (
    <aside className="meeting-side-column">
      <section className="meeting-side-section" aria-labelledby="meeting-documents-heading">
        <h2 id="meeting-documents-heading">{t("meeting.meetingDocuments")}</h2>
        <p className="meeting-side-hint">{t("meeting.meetingDocumentsDescription")}</p>
        {(() => {
          const noticeAttached = documents.some((document) => document.category === "meetingNotice");
          if (noticeAttached) {
            return (
              <p className="meeting-notice-status meeting-notice-status-ok" role="status">
                <CheckCircleIcon aria-hidden="true" />
                {t("meeting.noticeAttached")}
              </p>
            );
          }
          if (meetingAgendaCanChange(meeting.status)) {
            return (
              <p className="meeting-notice-status meeting-notice-status-missing" role="status">
                <WarningIcon aria-hidden="true" />
                {t("meeting.noticeMissing")}
              </p>
            );
          }
          return null;
        })()}
        {documents.length > 0 ? (
          <ul className="meeting-side-documents">
            {documents.map((document) => (
              <li key={document.id}>
                <FileIcon aria-hidden="true" />
                <span className="composer-item-copy">
                  <strong>{document.fileName}</strong>
                  <span>
                    {t(documentCategoryKeys[document.category])} · {formatFileSize(document.byteSize)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("meeting.viewDocument").replace("{name}", document.fileName)}
                  onClick={() => setViewedDocument(document)}
                >
                  <OpenIcon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meeting-side-hint">{t("meeting.meetingDocumentsEmpty")}</p>
        )}
        {documentsEditable ? (
          <div className="meeting-side-upload">
            <Select value={uploadCategory} onValueChange={(value) => setUploadCategory(value as DocumentCategory)}>
              <SelectTrigger aria-label={t("documents.category")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meetingDocumentCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {t(documentCategoryKeys[category])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInput}
              type="file"
              aria-label={t("documents.file")}
              onChange={uploadMeetingDocument}
              className="visually-hidden-input"
              id="meeting-document-file"
            />
            <Button variant="outline" disabled={submitting} onClick={() => fileInput.current?.click()}>
              <UploadIcon />
              {t(submitting ? "common.saving" : "meeting.attachDocument")}
            </Button>
          </div>
        ) : null}
      </section>

      <MeetingDocumentViewer
        document={viewedDocument}
        onClose={() => setViewedDocument(null)}
        onDownload={(document) => void download(document)}
      />
    </aside>
  );
}
