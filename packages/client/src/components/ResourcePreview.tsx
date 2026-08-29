import type { Resource } from "@hall/domain";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "../i18n/I18nProvider";
import { downloadResourceDocument, getResourceDetails, loadResourceObjectUrl } from "../services/resourcesApi";
import { CloseIcon } from "./icons";
import { MarkdownView } from "./MarkdownView";

/**
 * Aperçu d'une pièce depuis sa référence : le même panneau que le visionneur de documents
 * des séances, mais adressé par slug — c'est tout ce qu'une puce connaît. Un document
 * s'affiche dans le lecteur natif du navigateur, un texte est rendu comme partout ailleurs.
 */
export function ResourcePreview({ slug, onClose }: { slug: string; onClose(): void }) {
  const { t } = useI18n();
  const [resource, setResource] = useState<Resource | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let loadedUrl: string | null = null;
    setResource(null);
    setObjectUrl(null);
    setFailed(false);
    void getResourceDetails(slug)
      .then(async (details) => {
        if (!active) return;
        setResource(details.resource);
        if (details.resource.kind === "document") {
          loadedUrl = await loadResourceObjectUrl(details.resource);
          if (active) setObjectUrl(loadedUrl);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
  }, [slug]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: fermer au clic sur le fond, comme le bouton.
    <div
      className="document-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="document-viewer" role="dialog" aria-modal="true" aria-labelledby="resource-preview-title">
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
            <Button size="icon" variant="ghost" aria-label={t("common.close")} onClick={onClose}>
              <CloseIcon />
            </Button>
          </div>
        </header>
        <div className="document-viewer-content">
          {!resource && !failed ? (
            <span className="spinner" role="status">
              {t("common.loading")}
            </span>
          ) : null}
          {failed ? <p role="alert">{t("common.requestFailed")}</p> : null}
          {resource?.kind === "text" ? (
            <div className="resource-preview-text">
              <MarkdownView markdown={resource.content} />
            </div>
          ) : null}
          {objectUrl && resource?.kind === "document" ? (
            <object data={objectUrl} type={resource.mediaType} aria-label={resource.fileName} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
