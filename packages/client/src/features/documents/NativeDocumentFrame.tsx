import { useEffect, useMemo, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { MarkdownView } from "../../components/MarkdownView";
import { useI18n } from "../../i18n/I18nProvider";
import { DocumentPreviewFailure, DocumentPreviewUnavailable } from "./DocumentPreviewFailure";

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
        <LoadingIndicator>{t("common.loading")}</LoadingIndicator>
      ) : mediaType === "text/markdown" ? (
        <MarkdownView markdown={text} allowEmbeddedImages />
      ) : (
        <pre className="whitespace-pre-wrap break-words">{text}</pre>
      )}
    </section>
  );
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
  return mediaType === "application/pdf" ? (
    <iframe data-testid={testId} src={url} title={title} onError={onError} />
  ) : (
    <object data-testid={testId} data={url} type={mediaType} aria-label={title} onError={onError} />
  );
}
