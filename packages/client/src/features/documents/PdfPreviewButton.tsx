import { collectResourceReferences, parse } from "@hall/templating";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { ChevronDownIcon, MailIcon, PdfIcon } from "../../components/icons";
import type { ItemCommand } from "../../components/ui/item-commands";
import { useI18n } from "../../i18n/I18nProvider";
import { previewTemplatePdf } from "../../services/templatesApi";
import { PrepareMailButton, usePrepareMail } from "../mail/PrepareMailButton";
import { DocumentViewerDialog } from "./DocumentViewerDialog";
import { NativeDocumentFrame } from "./NativeDocumentFrame";

/** Generation of a PDF and its viewer: the latest request alone opens, and closing forgets the pending one. */
export function usePdfViewer({
  title,
  testId,
  viewerTestId,
}: {
  title: string;
  testId: string;
  viewerTestId?: string;
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

  const open = async (load: () => Promise<string | null>) => {
    const request = ++requestSequence.current;
    setStatus("loading");
    setUrl(null);
    try {
      const nextUrl = await load();
      if (request !== requestSequence.current) return;
      setUrl(nextUrl);
      setStatus("idle");
    } catch {
      if (request === requestSequence.current) setStatus("failed");
    }
  };

  const view = (
    <>
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
  return { status, open, view };
}

/** Generation and viewer of the PDF preview of a Markdown text, presented by a button or a menu. */
export function usePdfPreview({
  markdown,
  title,
  testId,
  viewerTestId,
}: {
  markdown: string;
  title: string;
  testId: string;
  viewerTestId?: string;
}) {
  const { status, open, view } = usePdfViewer({ title, testId, viewerTestId });
  const referencesDocuments = useMemo(
    () =>
      collectResourceReferences(parse(markdown)).some(
        ({ directive }) => directive === "resource" || directive === "resource-embed",
      ),
    [markdown],
  );
  const openPreview = (attachDocuments: boolean) => open(() => previewTemplatePdf(markdown, attachDocuments));
  return { referencesDocuments, status, openPreview, view };
}

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
  const { referencesDocuments, status, openPreview, view } = usePdfPreview({ markdown, title, testId, viewerTestId });
  const buttonProps = {
    "data-testid": testId,
    variant: "secondary",
    disabled: disabled || status === "loading",
    pending: status === "loading",
    pendingLabel: t("editor.pdfPreviewLoading"),
  } as const;
  const buttonContent = (
    <>
      <PdfIcon />
      {t("editor.pdfPreview")}
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
      <PrepareMailButton input={{ kind: "pdf", title, bodyMarkdown: markdown }} testId={`${testId}-mail`} />
      {view}
    </>
  );
}

/** The PDF preview of a Markdown text as commands of the « … » menu, with the draft of a mail carrying it. */
export function usePdfCommands({
  markdown,
  title,
  testId,
  disabled = false,
}: {
  markdown: string;
  title: string;
  testId: string;
  disabled?: boolean;
}): { commands: ItemCommand[]; view: ReactNode } {
  const { t } = useI18n();
  const { referencesDocuments, status, openPreview, view } = usePdfPreview({ markdown, title, testId });
  const mail = usePrepareMail({ kind: "pdf", title, bodyMarkdown: markdown });
  const unavailable = disabled || status === "loading";
  const label = t("editor.pdfPreview");
  const icon = status === "loading" ? <LoadingIndicator label={t("editor.pdfPreviewLoading")} /> : <PdfIcon />;
  const commands: ItemCommand[] = referencesDocuments
    ? [
        {
          id: "pdf-without-documents",
          label: `${label} · ${t("editor.pdfWithoutDocuments")}`,
          icon,
          testId: `${testId}-without-documents`,
          group: testId,
          disabled: unavailable,
          onSelect: () => void openPreview(false),
        },
        {
          id: "pdf-with-documents",
          label: `${label} · ${t("editor.pdfWithDocuments")}`,
          icon,
          testId: `${testId}-with-documents`,
          group: testId,
          disabled: unavailable,
          onSelect: () => void openPreview(true),
        },
      ]
    : [
        {
          id: "pdf",
          label,
          icon,
          testId,
          disabled: unavailable,
          onSelect: () => void openPreview(false),
        },
      ];
  if (mail.available && !disabled)
    commands.push({
      id: "pdf-mail",
      label: t("mail.preparePdf"),
      icon: <MailIcon />,
      testId: `${testId}-mail`,
      disabled: mail.busy,
      onSelect: mail.prepare,
    });
  return { commands, view };
}
