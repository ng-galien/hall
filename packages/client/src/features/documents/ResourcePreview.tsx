import type { Resource } from "@hall/domain";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { useDocumentPreview } from "../../hooks/useDocumentPreview";
import { useI18n } from "../../i18n/I18nProvider";
import { downloadResourceDocument, getResourceDetails } from "../../services/resourcesApi";
import { DocumentPreviewFailure } from "./DocumentPreviewFailure";
import { RemoteResourceEmbed } from "./RemoteResourceEmbed";

/** Preview panel for a resource; `resourceId` is the immutable entity id, never the navigation slug. */
export function ResourcePreview({ resourceId, onClose }: { resourceId: string; onClose(): void }) {
  const { t } = useI18n();
  const [resource, setResource] = useState<Resource | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const document = resource?.kind === "document" ? resource : null;
  const { objectUrl, mediaType, failed: previewFailed, retry } = useDocumentPreview(document);

  useEffect(() => {
    let active = true;
    setResource(null);
    setDetailsFailed(false);
    void getResourceDetails(resourceId)
      .then((details) => {
        if (!active) return;
        setResource(details.resource);
      })
      .catch(() => {
        if (active) setDetailsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [resourceId]);

  return (
    <div className="document-viewer-backdrop" role="presentation">
      <section
        className="document-viewer"
        data-testid="resource-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-preview-title"
      >
        <header>
          <div>
            <span>{t("editor.kind.resource")}</span>
            <h2 id="resource-preview-title">{resource?.title ?? "…"}</h2>
          </div>
          <div className="document-viewer-actions">
            {resource?.kind === "document" ? (
              <Button variant="outline" onClick={() => void downloadResourceDocument(resource)}>
                {t("common.download")}
              </Button>
            ) : null}
            <Button
              data-testid="resource-preview-close"
              size="icon"
              variant="ghost"
              aria-label={t("common.close")}
              onClick={onClose}
            >
              <CloseIcon />
            </Button>
          </div>
        </header>
        <div className="document-viewer-content">
          {!resource && !detailsFailed ? (
            <span className="spinner" role="status">
              {t("common.loading")}
            </span>
          ) : null}
          {detailsFailed ? <p role="alert">{t("common.requestFailed")}</p> : null}
          {resource?.kind === "text" ? (
            <div className="resource-preview-text">
              <MarkdownView markdown={resource.content} />
            </div>
          ) : null}
          {resource?.kind === "remote" ? <RemoteResourceEmbed resource={resource} /> : null}
          {previewFailed ? <DocumentPreviewFailure onRetry={retry} /> : null}
          {objectUrl && mediaType && resource?.kind === "document" ? (
            <object
              data-testid="resource-preview-object"
              data={objectUrl}
              type={mediaType}
              aria-label={resource.fileName}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
