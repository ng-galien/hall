import type { DocumentResource } from "@hall/domain";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { loadResourceObjectUrl } from "../services/resourcesApi";
import { FullscreenIcon } from "./icons";

/**
 * L'aperçu embarqué d'un document : le PDF ou l'image se lit sur place, dans l'établi,
 * au lieu d'un lien à suivre. Le plein écran reste à un clic.
 */
export function DocumentEmbed({ resource, onOpenFull }: { resource: DocumentResource; onOpenFull?(): void }) {
  const { t } = useI18n();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let loadedUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    void loadResourceObjectUrl(resource)
      .then((url) => {
        loadedUrl = url;
        if (active) setObjectUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
  }, [resource]);

  return (
    <div className="document-embed">
      {!objectUrl && !failed ? (
        <span className="spinner" role="status">
          {t("common.loading")}
        </span>
      ) : null}
      {failed ? <p role="alert">{t("common.requestFailed")}</p> : null}
      {objectUrl ? <object data={objectUrl} type={resource.mediaType} aria-label={resource.fileName} /> : null}
      {onOpenFull ? (
        <button
          type="button"
          className="document-embed-expand"
          aria-label={t("common.fullscreen")}
          title={t("common.fullscreen")}
          onClick={onOpenFull}
        >
          <FullscreenIcon />
        </button>
      ) : null}
    </div>
  );
}
