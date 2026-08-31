import type { DocumentResource } from "@hall/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadResourcePreviewObjectUrl } from "../services/resourcesApi";

export function useDocumentPreview(resource: DocumentResource | null) {
  const resourceId = resource?.id;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ resourceId, attempt }), [resourceId, attempt]);

  useEffect(() => {
    if (!request.resourceId) {
      setObjectUrl(null);
      setMediaType(null);
      setFailed(false);
      return;
    }
    let active = true;
    let loadedUrl: string | null = null;
    setObjectUrl(null);
    setMediaType(null);
    setFailed(false);
    void loadResourcePreviewObjectUrl(request.resourceId)
      .then((preview) => {
        if (!active) {
          if (preview.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
          return;
        }
        loadedUrl = preview.url;
        setObjectUrl(preview.url);
        setMediaType(preview.mediaType);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (loadedUrl?.startsWith("blob:")) URL.revokeObjectURL(loadedUrl);
    };
  }, [request]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { objectUrl, mediaType, failed, retry };
}
