import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { MarkdownView } from "../../components/MarkdownView";
import { useI18n } from "../../i18n/I18nProvider";
import { DocumentPreviewFailure, DocumentPreviewUnavailable } from "./DocumentPreviewFailure";

function PdfRendererUnavailable() {
  return <DocumentPreviewFailure onRetry={() => window.location.reload()} />;
}

const PdfDocumentPages = lazy(() =>
  import("./PdfDocumentPages").then(
    (module) => ({ default: module.PdfDocumentPages }),
    () => ({ default: PdfRendererUnavailable }),
  ),
);

function TextDocumentFrame({
  url,
  mediaType,
  title,
  testId,
}: {
  url: string;
  mediaType: string;
  title: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ url, attempt }), [url, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    setText(null);
    setFailed(false);
    void (async () => {
      try {
        if (!request.url.startsWith("blob:")) throw new Error("Expected a local preview blob");
        const response = await fetch(request.url, { signal: controller.signal });
        if (!response.ok) throw new Error("Preview unavailable");
        const content = await response.text();
        if (!controller.signal.aborted) setText(content);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [request]);
  return (
    <section data-testid={testId} aria-label={title} className="h-full w-full overflow-auto p-4">
      {failed ? (
        <DocumentPreviewFailure onRetry={() => setAttempt((value) => value + 1)} />
      ) : text === null ? (
        <LoadingIndicator size="zone" label={t("common.loading")} />
      ) : mediaType === "text/markdown" ? (
        <MarkdownView markdown={text} allowEmbeddedImages />
      ) : (
        <pre className="whitespace-pre-wrap break-words">{text}</pre>
      )}
    </section>
  );
}

function PdfLoading() {
  const { t } = useI18n();
  return <LoadingIndicator size="zone" label={t("common.loading")} />;
}

/** Media types the browser displays itself; any other file is offered for download. */
function browserDisplayable(type: string): boolean {
  return (
    type === "application/pdf" ||
    type.startsWith("image/") ||
    type.startsWith("text/") ||
    type.startsWith("audio/") ||
    type.startsWith("video/")
  );
}

/** Fragment parameters that open the browser PDF viewer with its page sidebar closed: `navpanes` for Chrome and Edge,
 * `pagemode` for Firefox. */
const closedPagePanes = [
  ["navpanes", "0"],
  ["pagemode", "none"],
] as const;

/** Address of a PDF for the browser viewer, with its page sidebar closed; the parameters already in the fragment, such
 * as `page`, are kept. Works for `blob:` addresses as for server ones. */
export function pdfViewerUrl(url: string): string {
  const hashIndex = url.indexOf("#");
  const base = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const fragment = hashIndex < 0 ? "" : url.slice(hashIndex + 1);
  const parts = fragment.split("&").filter(Boolean);
  const names = new Set(parts.map((part) => part.split("=", 1)[0]));
  for (const [name, value] of closedPagePanes) if (!names.has(name)) parts.push(`${name}=${value}`);
  return `${base}#${parts.join("&")}`;
}

// @implements-requirement HALL-FR-DOC-480
/** Shared browser surface for every loaded document representation. */
export function NativeDocumentFrame({
  url,
  mediaType,
  title,
  testId,
  onError,
}: {
  url: string;
  mediaType: string;
  title: string;
  testId?: string;
  onError?(): void;
}) {
  const type = mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (type === "text/plain" || type === "text/markdown") {
    return <TextDocumentFrame key={url} url={url} mediaType={type} title={title} testId={testId} />;
  }
  if (!browserDisplayable(type)) {
    return <DocumentPreviewUnavailable testId={testId ? `${testId}-unavailable` : undefined} />;
  }
  if (type === "application/pdf" && navigator.pdfViewerEnabled === false) {
    return (
      <Suspense fallback={<PdfLoading />}>
        <PdfDocumentPages key={url} url={url} title={title} testId={testId} />
      </Suspense>
    );
  }
  return mediaType === "application/pdf" ? (
    <iframe data-testid={testId} src={pdfViewerUrl(url)} title={title} onError={onError} />
  ) : (
    <object
      data-testid={testId}
      data={type === "application/pdf" ? pdfViewerUrl(url) : url}
      type={mediaType}
      aria-label={title}
      onError={onError}
    />
  );
}
