import { serializeResourceEmbedDirective } from "@hall/templating";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { serializeImageDirective } from "../components/editor/images";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { PdfIcon } from "../components/icons";
import { MarkdownView } from "../components/MarkdownView";
import { PageHeader } from "../components/Ui";
import { NativeDocumentFrame } from "../features/documents/NativeDocumentFrame";
import { loadResourceEmbedTableOptions } from "../features/resources/ResourceEmbedPresentation";
import { useReferenceMentionables } from "../hooks/useReferenceMentionables";
import { useI18n } from "../i18n/I18nProvider";
import { previewTemplatePdf } from "../services/templatesApi";
import { useResourcesStore } from "../stores/resourcesStore";

export function EditorLabPage() {
  const { t } = useI18n();
  const [markdown, setMarkdown] = useState(() => t("editor.lab.sample"));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "failed">("idle");
  const mentionables = useReferenceMentionables();
  const resources = useResourcesStore((state) => state.resources);

  useEffect(() => {
    let active = true;
    const prepare = async () => {
      const demoImage = mentionables.find((item) => item.media === "image");
      const pdf = resources.find(
        (resource) => resource.kind === "document" && resource.mediaType === "application/pdf",
      );
      const remote = resources.find((resource) => resource.kind === "remote" && resource.url);
      const legal = resources.find(
        (resource) => resource.kind === "legalReference" && resource.resolutionStatus === "resolved",
      );
      const map = resources.find((resource) => resource.kind === "geographic");
      const spreadsheet = resources.find((resource) => resource.kind === "spreadsheet");
      if (!demoImage || !pdf || !remote || !legal || !map || !spreadsheet) return;
      const sheet = (await loadResourceEmbedTableOptions(spreadsheet.id).catch(() => []))[0];
      if (!active || !sheet) return;
      const blocks = [
        `Consulter :resource[${pdf.title}]{#${pdf.id}} et :resource[${remote.title}]{#${remote.id}}.`,
        serializeResourceEmbedDirective({ id: legal.id, label: legal.title, presentation: "legal-citation" }),
        serializeResourceEmbedDirective({ id: map.id, label: map.title, presentation: "map" }),
        serializeResourceEmbedDirective({
          id: spreadsheet.id,
          label: spreadsheet.title,
          presentation: "table",
          sheet: sheet.id,
          range: sheet.defaultRange,
        }),
      ];
      setMarkdown((current) => {
        if (current.includes("::resource-embed[")) return current;
        return [
          serializeImageDirective({ id: demoImage.id, alt: demoImage.label, align: "center", width: 75 }),
          `## ${t("editor.lab.resourceShowcase")}`,
          ...blocks,
          current,
        ].join("\n\n");
      });
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [mentionables, resources, t]);

  const openPdfPreview = async () => {
    setPdfStatus("loading");
    try {
      setPdfUrl(await previewTemplatePdf(markdown));
      setPdfStatus("idle");
    } catch {
      setPdfStatus("failed");
    }
  };

  return (
    <div className="page" data-testid="editor-lab-page">
      <PageHeader title={t("editor.lab.title")} description={t("editor.lab.description")} />
      <div className="page-content editor-lab">
        <div className="editor-lab-actions">
          <Button
            data-testid="editor-pdf-preview"
            variant="outline"
            disabled={pdfStatus === "loading"}
            onClick={() => void openPdfPreview()}
          >
            <PdfIcon />
            {t(pdfStatus === "loading" ? "editor.pdfPreviewLoading" : "editor.pdfPreview")}
          </Button>
          {pdfStatus === "failed" ? <p role="alert">{t("editor.pdfPreviewFailed")}</p> : null}
        </div>
        <Dialog open={Boolean(pdfUrl)} onOpenChange={(open) => !open && setPdfUrl(null)}>
          <DialogContent
            className="editor-lab-pdf-dialog h-[var(--hall-size-overlay-height)] w-[var(--hall-size-viewer-width)] max-w-[var(--hall-size-viewer-width)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[var(--hall-size-document-viewer)]"
            data-testid="editor-pdf-preview-dialog"
            closeLabel={t("common.close")}
          >
            <DialogHeader>
              <DialogTitle>{t("editor.pdfPreview")}</DialogTitle>
            </DialogHeader>
            {pdfUrl ? (
              <section className="editor-lab-pdf-preview" data-testid="editor-pdf-native-viewer">
                <NativeDocumentFrame url={pdfUrl} mediaType="application/pdf" title={t("editor.pdfPreview")} />
              </section>
            ) : null}
          </DialogContent>
        </Dialog>
        <section className="editor-lab-pane" aria-labelledby="editor-lab-write">
          <h2 id="editor-lab-write">{t("editor.lab.writing")}</h2>
          <MarkdownEditor
            title={t("editor.lab.editorTitle")}
            markdown={markdown}
            onChange={setMarkdown}
            mentionables={mentionables}
            searchContext="culture"
          />
        </section>

        <section className="editor-lab-pane" aria-labelledby="editor-lab-render">
          <h2 id="editor-lab-render">{t("editor.lab.rendering")}</h2>
          <div className="editor-lab-render" data-testid="editor-lab-rendered-document">
            <MarkdownView markdown={markdown} />
          </div>
        </section>

        <section className="editor-lab-pane editor-lab-source" aria-labelledby="editor-lab-source">
          <h2 id="editor-lab-source">{t("editor.lab.source")}</h2>
          <pre data-testid="editor-lab-markdown-source">{markdown}</pre>
        </section>

        <section className="editor-lab-pane editor-lab-recipe" aria-labelledby="editor-lab-recipe">
          <h2 id="editor-lab-recipe">{t("editor.lab.imageRecipe")}</h2>
          <ol>
            <li>{t("editor.lab.imageRecipeMention")}</li>
            <li>{t("editor.lab.imageRecipePicker")}</li>
            <li>{t("editor.lab.imageRecipeAlignment")}</li>
            <li>{t("editor.lab.imageRecipeResize")}</li>
            <li>{t("editor.lab.imageRecipeViewer")}</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
