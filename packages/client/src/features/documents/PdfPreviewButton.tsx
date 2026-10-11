import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { previewTemplatePdf } from "../../services/templatesApi";
import { NativeDocumentFrame } from "./NativeDocumentFrame";

/** Preview the current Markdown through the same Siren PDF action used by the editor Lab. */
export function PdfPreviewButton({
  markdown,
  testId,
  viewerTestId,
  disabled = false,
}: {
  markdown: string;
  testId: string;
  viewerTestId?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const requestSequence = useRef(0);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  const openPreview = async () => {
    const request = ++requestSequence.current;
    setStatus("loading");
    setUrl(null);
    try {
      const nextUrl = await previewTemplatePdf(markdown);
      if (request !== requestSequence.current) return;
      setUrl(nextUrl);
      setStatus("idle");
    } catch {
      if (request === requestSequence.current) setStatus("failed");
    }
  };

  return (
    <>
      <Button
        data-testid={testId}
        variant="outline"
        disabled={disabled || status === "loading"}
        onClick={() => void openPreview()}
      >
        <PdfIcon />
        {t(status === "loading" ? "editor.pdfPreviewLoading" : "editor.pdfPreview")}
      </Button>
      {status === "failed" ? (
        <p className="m-0 text-sm !text-[var(--hall-color-danger)]" role="alert">
          {t("editor.pdfPreviewFailed")}
        </p>
      ) : null}
      <Dialog
        open={Boolean(url)}
        onOpenChange={(open) => {
          if (!open) {
            requestSequence.current += 1;
            setUrl(null);
          }
        }}
      >
        <DialogContent
          className="editor-lab-pdf-dialog h-[var(--hall-size-overlay-height)] w-[var(--hall-size-viewer-width)] max-w-[var(--hall-size-viewer-width)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[var(--hall-size-document-viewer)]"
          data-testid={`${testId}-dialog`}
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{t("editor.pdfPreview")}</DialogTitle>
          </DialogHeader>
          {url ? (
            <section className="editor-lab-pdf-preview" data-testid={viewerTestId ?? `${testId}-native-viewer`}>
              <NativeDocumentFrame url={url} mediaType="application/pdf" title={t("editor.pdfPreview")} />
            </section>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
