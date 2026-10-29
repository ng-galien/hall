import type { ContentTemplate } from "@hall/domain";
import { useEffect, useId, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { EmptyState, Modal, PageHeader, RequestErrorBanner } from "../components/Ui";
import { TemplateDecorationField } from "../features/templates/TemplateDecorationField";
import { templateTypeLabel } from "../features/templates/templateTypes";
import { useTemplateImageUpload } from "../features/templates/useTemplateImageUpload";
import { useSubmitting } from "../hooks/useSubmitting";
import { useI18n } from "../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { openTemplate, previewTemplate, type TemplateInput, updateTemplate } from "../services/templatesApi";

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
  const [preview, setPreview] = useState<string | null>(null);

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
        setPreview((await previewTemplate(draft)).html);
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
        </section>
        <Modal
          open={preview !== null}
          size="wide"
          title={t("templates.previewTitle")}
          testId="template-preview-dialog"
          onClose={() => setPreview(null)}
        >
          <iframe
            className="template-preview-frame"
            title={t("templates.previewTitle")}
            sandbox="allow-same-origin"
            srcDoc={preview ?? ""}
            data-testid="template-preview-frame"
          />
        </Modal>
      </div>
    </div>
  );
}
