/** Single native browser surface for every loaded document representation. */
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
  /** Browser loading failure only; native PDF plugin internals remain opaque. */
  onError?(): void;
}) {
  return mediaType === "application/pdf" ? (
    <iframe data-testid={testId} src={url} title={title} onError={onError} />
  ) : (
    <object data-testid={testId} data={url} type={mediaType} aria-label={title} onError={onError} />
  );
}
