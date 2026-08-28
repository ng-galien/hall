import { Button, Field } from "@fluentui/react-components";
import {
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  DocumentRegular,
  OpenRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { CouncilMember, DocumentResource, MeetingAggregate } from "@hall/domain";
import { type FormEvent, useRef, useState } from "react";
import { StatusBadge } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourcesStore } from "../../stores/resourcesStore";
import { MeetingDocumentViewer } from "./MeetingDocumentViewer";

export const documentCategoryKeys: Record<DocumentResource["category"], TranslationKey> = {
  supporting: "documentCategory.supporting",
  report: "documentCategory.report",
  draftCouncilDecision: "documentCategory.draftCouncilDecision",
  meetingNotice: "documentCategory.meetingNotice",
  minutes: "documentCategory.minutes",
  proxy: "documentCategory.proxy",
};

const meetingDocumentCategories: DocumentResource["category"][] = ["meetingNotice", "proxy", "supporting", "minutes"];

export function MeetingDetailsCard({
  aggregate,
  members,
  documents,
  officersEditable,
  documentsEditable,
  onSaveOfficers,
}: {
  aggregate: MeetingAggregate;
  members: CouncilMember[];
  documents: DocumentResource[];
  officersEditable: boolean;
  documentsEditable: boolean;
  onSaveOfficers(input: Record<string, unknown>): Promise<boolean>;
}) {
  const { t, formatFileSize } = useI18n();
  const { submitting, run } = useSubmitting();
  const { upload, download } = useResourcesStore();
  const { meeting } = aggregate;
  const [officersSaved, setOfficersSaved] = useState(false);
  const [viewedDocument, setViewedDocument] = useState<DocumentResource | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const categorySelect = useRef<HTMLSelectElement | null>(null);

  const saveOfficers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const saved = await onSaveOfficers({
        chairMemberId: form.get("chairMemberId"),
        secretaryMemberId: form.get("secretaryMemberId"),
      });
      setOfficersSaved(saved);
    });
  };

  const uploadMeetingDocument = () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("meetingId", meeting.id);
    form.set("category", categorySelect.current?.value ?? "supporting");
    form.set("file", file);
    void run(async () => {
      const uploaded = await upload(form);
      if (uploaded && fileInput.current) fileInput.current.value = "";
      return uploaded;
    });
  };

  return (
    <aside className="meeting-side-column">
      <section className="meeting-side-section" aria-labelledby="officers-heading">
        <h2 id="officers-heading">{t("meeting.officers")}</h2>
        <p className="meeting-side-hint">{t("meeting.officersDescription")}</p>
        <form className="officers-form" onSubmit={saveOfficers} onChange={() => setOfficersSaved(false)}>
          <Field label={t("meetings.chair")}>
            <select
              name="chairMemberId"
              defaultValue={meeting.chairMemberId ?? ""}
              disabled={!officersEditable}
              required
            >
              <option value="">{t("meetings.chairUndesignated")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("meetings.secretary")}>
            <select
              name="secretaryMemberId"
              defaultValue={meeting.secretaryMemberId ?? ""}
              disabled={!officersEditable}
              required
            >
              <option value="">{t("meetings.secretaryUndesignated")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName}
                </option>
              ))}
            </select>
          </Field>
          {officersEditable ? (
            <div className="officers-form-actions">
              {officersSaved ? <span role="status">{t("meeting.officersSaved")}</span> : null}
              <Button appearance="secondary" type="submit" disabled={submitting}>
                {t(submitting ? "common.saving" : "meeting.saveOfficers")}
              </Button>
            </div>
          ) : (
            <p className="meeting-side-hint">{t("meeting.officersLockedHint")}</p>
          )}
        </form>
      </section>

      <section className="meeting-side-section" aria-labelledby="meeting-documents-heading">
        <h2 id="meeting-documents-heading">{t("meeting.meetingDocuments")}</h2>
        <p className="meeting-side-hint">{t("meeting.meetingDocumentsDescription")}</p>
        {(() => {
          const noticeAttached = documents.some((document) => document.category === "meetingNotice");
          if (noticeAttached) {
            return (
              <p className="meeting-notice-status meeting-notice-status-ok" role="status">
                <CheckmarkCircleRegular aria-hidden="true" />
                {t("meeting.noticeAttached")}
              </p>
            );
          }
          if (["draft", "scheduled"].includes(meeting.status)) {
            return (
              <p className="meeting-notice-status meeting-notice-status-missing" role="status">
                <WarningRegular aria-hidden="true" />
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
                <DocumentRegular aria-hidden="true" />
                <span className="composer-item-copy">
                  <strong>{document.fileName}</strong>
                  <span>
                    {t(documentCategoryKeys[document.category])} · {formatFileSize(document.byteSize)}
                  </span>
                </span>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<OpenRegular />}
                  aria-label={t("meeting.viewDocument").replace("{name}", document.fileName)}
                  onClick={() => setViewedDocument(document)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="meeting-side-hint">{t("meeting.meetingDocumentsEmpty")}</p>
        )}
        {documentsEditable ? (
          <div className="meeting-side-upload">
            <select ref={categorySelect} aria-label={t("documents.category")} defaultValue="meetingNotice">
              {meetingDocumentCategories.map((category) => (
                <option key={category} value={category}>
                  {t(documentCategoryKeys[category])}
                </option>
              ))}
            </select>
            <input
              ref={fileInput}
              type="file"
              aria-label={t("documents.file")}
              onChange={uploadMeetingDocument}
              className="visually-hidden-input"
              id="meeting-document-file"
            />
            <Button
              appearance="secondary"
              icon={<ArrowUploadRegular />}
              disabled={submitting}
              onClick={() => fileInput.current?.click()}
            >
              {t(submitting ? "common.saving" : "meeting.attachDocument")}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="meeting-side-section" aria-labelledby="minutes-heading">
        <h2 id="minutes-heading">{t("meeting.minutes")}</h2>
        <div className="meeting-minutes-status">
          <StatusBadge value={meeting.minutesStatus} />
        </div>
      </section>

      <MeetingDocumentViewer
        document={viewedDocument}
        onClose={() => setViewedDocument(null)}
        onDownload={(document) => void download(document)}
      />
    </aside>
  );
}
