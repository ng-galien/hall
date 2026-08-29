import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { serializeImageDirective } from "../components/editor/images";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { PdfIcon } from "../components/icons";
import { MarkdownView } from "../components/MarkdownView";
import { PageHeader } from "../components/Ui";
import { useReferenceMentionables } from "../hooks/useReferenceMentionables";
import { useI18n } from "../i18n/I18nProvider";
import { previewTemplatePdf } from "../services/templatesApi";

export function EditorLabPage() {
  const { t } = useI18n();
  const [markdown, setMarkdown] = useState(() => t("editor.lab.sample"));
  const [demoReady, setDemoReady] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "failed">("idle");
  const mentionables = useReferenceMentionables();

  useEffect(() => {
    const demoImage = mentionables.find((item) => item.media === "image");
    if (!demoImage) return;
    setMarkdown((current) =>
      current.includes("::image[")
        ? current
        : `${serializeImageDirective({ id: demoImage.id, alt: demoImage.label, align: "center", width: 75 })}\n\n${current}`,
    );
    setDemoReady(true);
  }, [mentionables]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  const openPdfPreview = async () => {
    setPdfStatus("loading");
    try {
      const next = URL.createObjectURL(await previewTemplatePdf(markdown));
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = next;
      setPdfUrl(next);
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
        {pdfUrl ? (
          <section className="editor-lab-pdf-preview" data-testid="editor-pdf-native-viewer">
            <object data={pdfUrl} type="application/pdf" aria-label={t("editor.pdfPreview")} />
          </section>
        ) : null}
        <section className="editor-lab-pane" aria-labelledby="editor-lab-write">
          <h2 id="editor-lab-write">{t("editor.lab.writing")}</h2>
          {demoReady ? (
            <MarkdownEditor
              title={t("editor.lab.editorTitle")}
              markdown={markdown}
              onChange={setMarkdown}
              mentionables={mentionables}
              searchContext="culture"
            />
          ) : (
            <span className="spinner" role="status">
              {t("editor.lab.preparing")}
            </span>
          )}
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
