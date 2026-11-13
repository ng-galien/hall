import type { ContentTemplate } from "@hall/domain";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, RequestErrorBanner } from "../components/Ui";
import { Disclosure } from "../components/ui/disclosure";
import { DocumentViewerDialog } from "../features/documents/DocumentViewerDialog";
import { NativeDocumentFrame } from "../features/documents/NativeDocumentFrame";
import { TemplateDecorationField } from "../features/templates/TemplateDecorationField";
import { templateTypeLabel } from "../features/templates/templateTypes";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  openTemplate,
  previewTemplate,
  type TemplateInput,
  type TemplatePreviewResult,
  updateTemplate,
} from "../services/templatesApi";

const draftOf = (template: ContentTemplate): TemplateInput => ({
  kind: template.kind,
  documentType: template.documentType,
  name: template.name,
  bodyMarkdown: template.bodyMarkdown,
  subject: template.subject,
  stylesheet: template.stylesheet,
  headerHtml: template.headerHtml,
  footerHtml: template.footerHtml,
});

/**
 * One document template: its exact Jinja source, and for a PDF its header and footer with an embedded
 * logo, previewed as the server renders it. Saving requires template.update; otherwise the page reads only.
 */
// @implements-requirement HALL-FR-DOC-580
export function TemplatePage() {
  const { templateId = "" } = useParams();
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const [saved, setSaved] = useState<TemplateInput | null>(null);
  const [draft, setDraft] = useState<TemplateInput | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [preview, setPreview] = useState<TemplatePreviewResult | null>(null);

  useEffect(() => {
    let current = true;
    void openTemplate(templateId)
      .then(({ template, canUpdate: updatable }) => {
        if (!current) return;
        setSaved(draftOf(template));
        setDraft(draftOf(template));
        setCanUpdate(updatable);
      })
      .catch((failure) => {
        if (!current) return;
        setMissing(true);
        setError(apiErrorCode(failure));
      });
    return () => {
      current = false;
    };
  }, [templateId]);

  if (!draft || !saved) {
    return (
      <div className="page">
        <PageHeader title={t("templates.title")} hint={t("templates.detailDescription")} />
        <div className="page-content">
          <RequestErrorBanner error={error} />
          {missing ? <EmptyState>{t("templates.notFound")}</EmptyState> : null}
        </div>
      </div>
    );
  }

  const readOnly = !canUpdate;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const change = (patch: Partial<TemplateInput>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSavedOnce(false);
  };
  const save = () =>
    void run(async () => {
      setError(null);
      try {
        const updated = draftOf(await updateTemplate(templateId, draft));
        setSaved(updated);
        setDraft(updated);
        setSavedOnce(true);
        return true;
      } catch (failure) {
        setError(apiErrorCode(failure));
        return false;
      }
    });
  const showPreview = () =>
    void run(async () => {
      setError(null);
      try {
        setPreview(await previewTemplate(draft));
        return true;
      } catch (failure) {
        setError(apiErrorCode(failure));
        return false;
      }
    });
  const typeLabel = templateTypeLabel(draft.documentType, draft.kind);

  return (
    <div className="page">
      <PageHeader title={draft.name || t("templates.title")} hint={t("templates.detailDescription")} describesItem>
        <Button variant="secondary" disabled={submitting} data-testid="template-preview" onClick={showPreview}>
          {t("templates.preview")}
        </Button>
        {readOnly ? null : (
          <Button disabled={submitting || !dirty || !draft.name.trim()} data-testid="template-save" onClick={save}>
            {t(submitting ? "common.saving" : "common.save")}
          </Button>
        )}
      </PageHeader>
      <div className="page-content template-editor" data-testid="template-editor">
        <Link className="hall-link template-back" to="/administration/documents">
          {t("templates.backToSettings")}
        </Link>
        <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
        <p className="template-editor-status">
          <span>
            {typeLabel ? t(typeLabel) : draft.documentType} · {t(`templates.kind.${draft.kind}`)}
          </span>
          {readOnly ? <span className="record-state">{t("templates.readOnly")}</span> : null}
          {dirty ? (
            <span role="status" className="record-state" data-save="dirty" data-testid="template-unsaved">
              {t("templates.unsaved")}
            </span>
          ) : savedOnce ? (
            <span role="status" className="record-state" data-save="saved" data-testid="template-saved">
              {t("workspace.saved")}
            </span>
          ) : null}
        </p>
        <section className="creation-form">
          <Field label={t("templates.name")}>
            <Input
              value={draft.name}
              readOnly={readOnly}
              required
              data-testid="template-name"
              onChange={(event) => change({ name: event.currentTarget.value })}
            />
          </Field>
          {draft.kind === "message" ? (
            <Field label={t("templates.subject")}>
              <Input
                value={draft.subject ?? ""}
                readOnly={readOnly}
                data-testid="template-subject"
                onChange={(event) => change({ subject: event.currentTarget.value })}
              />
            </Field>
          ) : (
            <TemplateDecorationField
              label={t("templates.header")}
              value={draft.headerHtml}
              readOnly={readOnly}
              testId="template-header"
              onChange={(headerHtml) => change({ headerHtml })}
            />
          )}
          <div className="template-body" data-testid="template-body">
            <Field label={t("templates.body")} hint={t("templates.jinjaHelp")} variant="code">
              <Textarea
                data-testid="template-body-editor"
                data-horizontal-scroll="true"
                className="template-source template-body-source"
                spellCheck={false}
                value={draft.bodyMarkdown}
                readOnly={readOnly}
                onChange={(event) => change({ bodyMarkdown: event.currentTarget.value })}
              />
            </Field>
            <div className="template-examples">
              <Disclosure
                title={t("templates.jinjaExamples")}
                testId="template-examples-disclosure"
                toggleTestId="template-examples-toggle"
                contentTestId="template-examples-content"
              >
                <p>{t("templates.jinjaData")}</p>
                <pre>{`{% for point in minutes.points %}\n## {{ point.number }}. {{ point.title | text }}\n\n{% if point.subjectText %}\n### Sujet présenté\n\n{{ point.subjectText | markdown }}\n{% endif %}\n\n### Discussion\n\n{{ point.narrative | markdown }}\n\n{% if point.ballot %}\nPour : {{ point.ballot.totals.approve }}\n{% endif %}\n{% endfor %}\n\n::page-break\n\nPage :page-number / :page-count`}</pre>
              </Disclosure>
            </div>
          </div>
          {draft.kind === "pdf" ? (
            <TemplateDecorationField
              label={t("templates.footer")}
              value={draft.footerHtml}
              readOnly={readOnly}
              testId="template-footer"
              onChange={(footerHtml) => change({ footerHtml })}
            />
          ) : null}
          {draft.kind === "pdf" ? (
            <Field label={t("templates.stylesheet")} hint={t("templates.stylesheetDescription")}>
              <Textarea
                className="template-source"
                value={draft.stylesheet}
                readOnly={readOnly}
                data-testid="template-stylesheet"
                onChange={(event) => change({ stylesheet: event.currentTarget.value })}
              />
            </Field>
          ) : null}
        </section>
        {preview ? (
          <DocumentViewerDialog
            title={`${t("templates.previewTitle")} · ${draft.name}`}
            caption={typeLabel ? t(typeLabel) : draft.documentType}
            testId="template-preview-dialog"
            titleId="template-preview-dialog-title"
            closeTestId="template-preview-close"
            contentClassName="template-preview-content"
            onClose={() => setPreview(null)}
          >
            <div className="template-preview-metadata">
              <p className="admin-hint" data-testid="template-preview-source">
                {preview?.sourceLabel
                  ? t(preview.sourceKind === "meeting" ? "templates.previewMeetingSource" : "templates.previewSource", {
                      source: preview.sourceLabel,
                    })
                  : t("templates.previewNoSource")}
              </p>
              {preview?.diagnostics.length ? (
                <div role="alert">
                  <p>{t("templates.previewIncomplete")}</p>
                  <ul className="template-preview-diagnostics">
                    {[...new Set(preview.diagnostics.map((diagnostic) => diagnostic.message))].map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview?.subject ? (
                <p>
                  <strong>{t("templates.subject")}</strong> : {preview.subject}
                </p>
              ) : null}
            </div>
            {preview.pdfUrl ? (
              <NativeDocumentFrame
                url={preview.pdfUrl}
                mediaType="application/pdf"
                title={`${t("templates.previewTitle")} · ${draft.name}`}
                testId="template-preview-frame"
              />
            ) : (
              <iframe
                className="template-preview-frame"
                title={`${t("templates.previewTitle")} · ${draft.name}`}
                sandbox="allow-same-origin"
                srcDoc={preview?.html ?? ""}
                data-testid="template-preview-frame"
              />
            )}
          </DocumentViewerDialog>
        ) : null}
      </div>
    </div>
  );
}
