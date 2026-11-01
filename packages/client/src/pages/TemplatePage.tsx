import type { ContentTemplate } from "@hall/domain";
import { parse, serialize } from "@hall/templating";
import { useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { EmptyState, PageHeader, RequestErrorBanner } from "../components/Ui";
import { DocumentViewerDialog } from "../features/documents/DocumentViewerDialog";
import { TemplateDecorationField } from "../features/templates/TemplateDecorationField";
import { templateTypeLabel } from "../features/templates/templateTypes";
import { useTemplateImageUpload } from "../features/templates/useTemplateImageUpload";
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
 * One document template: its name, its text in Hall's editor, and for a PDF its header and footer with an embedded
 * logo, previewed as the server renders it. Saving requires template.update; otherwise the page reads only.
 */
// @implements-requirement HALL-FR-DOC-580
export function TemplatePage() {
  const { templateId = "" } = useParams();
  const { t } = useI18n();
  const id = useId();
  const { submitting, run } = useSubmitting();
  const imageUpload = useTemplateImageUpload();
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
        <PageHeader title={t("templates.title")} description={t("templates.detailDescription")} />
        <div className="page-content">
          <RequestErrorBanner error={error} />
          {missing ? <EmptyState>{t("templates.notFound")}</EmptyState> : null}
        </div>
      </div>
    );
  }

  const readOnly = !canUpdate;
  const comparable = (input: TemplateInput) => ({ ...input, bodyMarkdown: serialize(parse(input.bodyMarkdown)) });
  const dirty = JSON.stringify(comparable(draft)) !== JSON.stringify(comparable(saved));
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
      <PageHeader title={draft.name || t("templates.title")} description={t("templates.detailDescription")}>
        <Button variant="outline" disabled={submitting} data-testid="template-preview" onClick={showPreview}>
          {t("templates.preview")}
        </Button>
        {readOnly ? null : (
          <Button disabled={submitting || !dirty || !draft.name.trim()} data-testid="template-save" onClick={save}>
            {t(submitting ? "common.saving" : "common.save")}
          </Button>
        )}
      </PageHeader>
      <div className="page-content template-editor" data-testid="template-editor">
        <Link className="text-sm underline" to="/settings?category=documents">
          {t("templates.backToSettings")}
        </Link>
        <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
        <p className="template-editor-status">
          <Badge variant="outline">{typeLabel ? t(typeLabel) : draft.documentType}</Badge>
          <Badge variant="outline">{t(`templates.kind.${draft.kind}`)}</Badge>
          {readOnly ? <span className="text-xs text-muted">{t("templates.readOnly")}</span> : null}
          {dirty ? (
            <span role="status" className="text-xs text-muted" data-testid="template-unsaved">
              {t("templates.unsaved")}
            </span>
          ) : savedOnce ? (
            <span role="status" className="text-xs text-muted" data-testid="template-saved">
              {t("workspace.saved")}
            </span>
          ) : null}
        </p>
        <section className="creation-form">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>{t("templates.name")}</Label>
            <Input
              id={`${id}-name`}
              value={draft.name}
              readOnly={readOnly}
              required
              data-testid="template-name"
              onChange={(event) => change({ name: event.currentTarget.value })}
            />
          </div>
          {draft.kind === "message" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-subject`}>{t("templates.subject")}</Label>
              <Input
                id={`${id}-subject`}
                value={draft.subject ?? ""}
                readOnly={readOnly}
                data-testid="template-subject"
                onChange={(event) => change({ subject: event.currentTarget.value })}
              />
            </div>
          ) : (
            <TemplateDecorationField
              label={t("templates.header")}
              value={draft.headerHtml}
              readOnly={readOnly}
              testId="template-header"
              onChange={(headerHtml) => change({ headerHtml })}
            />
          )}
          <div className="grid gap-1.5" data-testid="template-body">
            <span className="text-sm font-medium">{t("templates.body")}</span>
            <MarkdownEditor
              testId="template-body-editor"
              markdown={draft.bodyMarkdown}
              title={draft.name}
              readOnly={readOnly}
              onUploadImage={!readOnly && imageUpload.canUpload ? imageUpload.upload : undefined}
              onChange={(bodyMarkdown) => change({ bodyMarkdown })}
            />
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
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-stylesheet`}>{t("templates.stylesheet")}</Label>
              <p className="text-xs text-muted-foreground">{t("templates.stylesheetDescription")}</p>
              <Textarea
                id={`${id}-stylesheet`}
                className="font-mono"
                value={draft.stylesheet}
                readOnly={readOnly}
                data-testid="template-stylesheet"
                onChange={(event) => change({ stylesheet: event.currentTarget.value })}
              />
            </div>
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
              <p className="text-sm text-muted-foreground" data-testid="template-preview-source">
                {preview?.sourceLabel
                  ? t(preview.sourceKind === "meeting" ? "templates.previewMeetingSource" : "templates.previewSource", {
                      source: preview.sourceLabel,
                    })
                  : t("templates.previewNoSource")}
              </p>
              {preview?.diagnostics.length ? <p role="alert">{t("templates.previewIncomplete")}</p> : null}
              {preview?.subject ? (
                <p>
                  <strong>{t("templates.subject")}</strong> : {preview.subject}
                </p>
              ) : null}
            </div>
            <iframe
              className="template-preview-frame"
              title={`${t("templates.previewTitle")} · ${draft.name}`}
              sandbox="allow-same-origin"
              srcDoc={preview?.html ?? ""}
              data-testid="template-preview-frame"
            />
          </DocumentViewerDialog>
        ) : null}
      </div>
    </div>
  );
}
