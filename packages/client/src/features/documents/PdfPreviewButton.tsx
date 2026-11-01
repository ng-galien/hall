import { collectResourceReferences, parse } from "@hall/templating";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, PdfIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { previewTemplatePdf } from "../../services/templatesApi";
import { DocumentViewerDialog } from "./DocumentViewerDialog";
import { NativeDocumentFrame } from "./NativeDocumentFrame";

// @implements-requirement HALL-FR-WSP-370
/** Preview the current Markdown through the same Siren PDF action used by the editor Lab. */
export function PdfPreviewButton({
  markdown,
  title,
  testId,
  viewerTestId,
  disabled = false,
}: {
  markdown: string;
  title: string;
  testId: string;
  viewerTestId?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const referencesDocuments = useMemo(
    () =>
      collectResourceReferences(parse(markdown)).some(
        ({ directive }) => directive === "resource" || directive === "resource-embed",
      ),
    [markdown],
  );
  const requestSequence = useRef(0);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  const openPreview = async (attachDocuments: boolean) => {
    const request = ++requestSequence.current;
    setStatus("loading");
    setUrl(null);
    try {
      const nextUrl = await previewTemplatePdf(markdown, attachDocuments);
      if (request !== requestSequence.current) return;
      setUrl(nextUrl);
      setStatus("idle");
    } catch {
      if (request === requestSequence.current) setStatus("failed");
    }
  };

  const buttonProps = {
    "data-testid": testId,
    variant: "outline",
    disabled: disabled || status === "loading",
  } as const;
  const buttonContent = (
    <>
      <PdfIcon />
      {t(status === "loading" ? "editor.pdfPreviewLoading" : "editor.pdfPreview")}
    </>
  );

  return (
    <>
      {referencesDocuments ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button {...buttonProps}>
              {buttonContent}
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max max-w-[calc(100vw-2rem)] whitespace-nowrap">
            <DropdownMenuItem data-testid={`${testId}-without-documents`} onSelect={() => void openPreview(false)}>
              {t("editor.pdfWithoutDocuments")}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid={`${testId}-with-documents`} onSelect={() => void openPreview(true)}>
              {t("editor.pdfWithDocuments")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button {...buttonProps} onClick={() => void openPreview(false)}>
          {buttonContent}
        </Button>
      )}
      {status === "failed" ? (
        <p className="m-0 text-sm !text-[var(--hall-color-danger)]" role="alert">
          {t("editor.pdfPreviewFailed")}
        </p>
      ) : null}
      {url ? (
        <DocumentViewerDialog
          testId={`${testId}-dialog`}
          titleId={`${testId}-title`}
          title={title}
          caption={t("editor.pdfPreview")}
          closeTestId={`${testId}-close`}
          onClose={() => {
            requestSequence.current += 1;
            setUrl(null);
          }}
        >
          <div className="h-full min-h-0 w-full" data-testid={viewerTestId ?? `${testId}-native-viewer`}>
            <NativeDocumentFrame url={url} mediaType="application/pdf" title={title} />
          </div>
        </DocumentViewerDialog>
      ) : null}
    </>
  );
}
