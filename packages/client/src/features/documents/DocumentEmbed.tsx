import type { ResourceDetail, SirenEntity } from "@hall/api-contract";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { FullscreenIcon } from "../../components/icons";
import { useDocumentPreview } from "../../hooks/useDocumentPreview";
import { useI18n } from "../../i18n/I18nProvider";
import { DocumentPreviewFailure, DocumentPreviewUnavailable } from "./DocumentPreviewFailure";
import { NativeDocumentFrame } from "./NativeDocumentFrame";

/** Inline document preview; PDFs and images render in place, with an optional full-screen action. */
export function DocumentEmbed({
  resource,
  representation,
  onOpenFull,
  objectTestId,
}: {
  resource: Extract<ResourceDetail, { kind: "document" }>;
  representation: SirenEntity | null;
  onOpenFull?(): void;
  objectTestId?: string;
}) {
  const { t } = useI18n();
  const { objectUrl, mediaType, failed, unavailable, retry } = useDocumentPreview(resource, representation);

  return (
    <div className="document-embed">
      {unavailable ? (
        <DocumentPreviewUnavailable testId={objectTestId ? `${objectTestId}-unavailable` : undefined} />
      ) : null}
      {!objectUrl && !failed && !unavailable ? <LoadingIndicator>{t("common.loading")}</LoadingIndicator> : null}
      {failed ? <DocumentPreviewFailure onRetry={retry} /> : null}
      {objectUrl && mediaType ? (
        <NativeDocumentFrame url={objectUrl} mediaType={mediaType} title={resource.name} testId={objectTestId} />
      ) : null}
      {onOpenFull ? (
        <Button
          variant="secondary"
          size="icon"
          className="document-embed-expand"
          aria-label={t("common.fullscreen")}
          title={t("common.fullscreen")}
          onClick={onOpenFull}
        >
          <FullscreenIcon />
        </Button>
      ) : null}
    </div>
  );
}
