/** Single native browser surface for every loaded document representation. */
export function NativeDocumentFrame({
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
  return mediaType === "application/pdf" ? (
    <iframe data-testid={testId} src={url} title={title} />
  ) : (
    <object data-testid={testId} data={url} type={mediaType} aria-label={title} />
  );
}
