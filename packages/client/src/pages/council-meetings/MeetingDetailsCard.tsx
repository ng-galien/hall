import { Button, Field } from "@fluentui/react-components";
import { ArrowUploadRegular, DocumentRegular, OpenRegular } from "@fluentui/react-icons";
import type { CouncilMember, DocumentMetadata, MeetingAggregate } from "@mairie/domain";
import { type FormEvent, useRef, useState } from "react";
import { StatusBadge } from "../../components/Ui";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { useDocumentsStore } from "../../stores/documentsStore";
import { MeetingDocumentViewer } from "./MeetingDocumentViewer";

const documentCategoryKeys: Record<DocumentMetadata["category"], TranslationKey> = {
  supporting: "documentCategory.supporting",
  report: "documentCategory.report",
  draftCouncilDecision: "documentCategory.draftCouncilDecision",
  meetingNotice: "documentCategory.meetingNotice",
  minutes: "documentCategory.minutes",
  proxy: "documentCategory.proxy",
};

const meetingDocumentCategories: DocumentMetadata["category"][] = ["meetingNotice", "proxy", "supporting", "minutes"];

export function MeetingDetailsCard({
  aggregate,
  members,
  documents,
  onSaveOfficers,
}: {
  aggregate: MeetingAggregate;
  members: CouncilMember[];
  documents: DocumentMetadata[];
  onSaveOfficers(input: Record<string, unknown>): Promise<boolean>;
}) {
  const { t, formatFileSize } = useI18n();
  const { submitting, run } = useSubmitting();
  const { upload, download } = useDocumentsStore();
  const { meeting } = aggregate;
  const [officersSaved, setOfficersSaved] = useState(false);
  const [viewedDocument, setViewedDocument] = useState<DocumentMetadata | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const categorySelect = useRef<HTMLSelectElement | null>(null);
  const officersEditable = meeting.status === "scheduled" && !meeting.quorumFailure;

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
