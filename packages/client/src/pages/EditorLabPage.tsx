import { resourceKinds } from "@hall/api-contract";
import { serializeResourceEmbedDirective } from "@hall/templating";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";

export function EditorLabPage() {
  const { t } = useI18n();
  const [markdown, setMarkdown] = useState(() => t("editor.lab.sample"));
  const [catalogReady, setCatalogReady] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "failed">("idle");
  const editorInteracted = useRef(false);
  const mentionables = useReferenceMentionables();
  const resourcesStore = useWorkspaceResourcesStore();
  const resources = useMemo(
    () => resourcesStore.searchResult?.items.filter((resource) => resource.kind !== "folder") ?? [],
    [resourcesStore.searchResult],
  );
  const tableOptions = useRef(new Map<string, ReturnType<typeof loadResourceEmbedTableOptions>>());

  useEffect(() => {
    let active = true;
    void resourcesStore
      .loadCatalog()
      .then(() =>
        resourcesStore.search({
          query: "",
          paths: [],
          kinds: resourceKinds.filter((kind) => kind !== "folder"),
          tags: [],
          readiness: [],
          media: [],
        }),
      )
      .then(() => {
        if (active) setCatalogReady(true);
      });
    return () => {
      active = false;
    };
  }, [resourcesStore.loadCatalog, resourcesStore.search]);

  useEffect(() => {
    if (!catalogReady) return;
    let active = true;
    const prepare = async () => {
      const demoImage = mentionables.find((item) => item.media === "image");
      const pdf = resources.find(
        (resource) => resource.kind === "document" && resource.binary.mediaType === "application/pdf",
      );
      const remote = resources.find((resource) => resource.kind === "remote");
      const legal = resources.find((resource) => resource.kind === "legalReference");
      const map = resources.find((resource) => resource.kind === "geographic");
      const spreadsheet = resources.find((resource) => resource.kind === "spreadsheet");
      if (spreadsheet && !tableOptions.current.has(spreadsheet.id)) {
        tableOptions.current.set(spreadsheet.id, loadResourceEmbedTableOptions(spreadsheet.id));
      }
      const sheet = spreadsheet ? (await tableOptions.current.get(spreadsheet.id)?.catch(() => []))?.[0] : undefined;
      if (!active) return;
      const links = [pdf, remote].filter((resource) => resource !== undefined);
      const blocks = [
        links.length > 0
          ? `Consulter ${links.map((resource) => `:resource[${resource.name}]{#${resource.id}}`).join(" et ")}.`
          : null,
        legal
          ? serializeResourceEmbedDirective({ id: legal.id, label: legal.name, presentation: "legal-citation" })
          : null,
        map ? serializeResourceEmbedDirective({ id: map.id, label: map.name, presentation: "map" }) : null,
        spreadsheet && sheet
          ? serializeResourceEmbedDirective({
              id: spreadsheet.id,
              label: spreadsheet.name,
              presentation: "table",
              sheet: sheet.id,
              range: sheet.defaultRange,
            })
          : null,
      ].filter((block) => block !== null);
      if (!demoImage && blocks.length === 0) return;
      setMarkdown((current) => {
        if (editorInteracted.current || current.includes("::resource-embed[")) return current;
        return [
          demoImage
            ? serializeImageDirective({ id: demoImage.id, alt: demoImage.label, align: "center", width: 75 })
            : null,
          `## ${t("editor.lab.resourceShowcase")}`,
          ...blocks,
          current,
        ]
          .filter((block) => block !== null)
          .join("\n\n");
      });
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [catalogReady, mentionables, resources, t]);

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
        <section
          className="editor-lab-pane"
          aria-labelledby="editor-lab-write"
          onFocusCapture={() => {
            editorInteracted.current = true;
          }}
          onPointerDownCapture={() => {
            editorInteracted.current = true;
          }}
        >
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
