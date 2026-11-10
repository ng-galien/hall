import type { ResourceDetail } from "@hall/api-contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { EditIcon, OpenIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";

/** Direct browser preview for an external web resource; Hall never fetches the remote content server-side. */
export function RemoteResourceEmbed({
  resource,
  onEdit,
}: {
  resource: Extract<ResourceDetail, { kind: "remote" }>;
  onEdit?(): void;
}) {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  if (resource.target.kind !== "url") return null;
  const url = resource.target.url;
  const loading = loadedUrl !== url;
  if (phone) {
    return (
      <div className="remote-resource-phone" data-testid="resource-presentation-remote-read">
        <span className="remote-resource-url">{url}</span>
        <Button asChild>
          <a href={url} target="_blank" rel="noreferrer" data-testid="remote-resource-open">
            <OpenIcon aria-hidden="true" />
            {t("workspace.openRemoteResource")}
          </a>
        </Button>
        {onEdit ? (
          <Button variant="outline" data-testid="remote-resource-edit" onClick={onEdit}>
            <EditIcon aria-hidden="true" />
            {t("workspace.editRemoteUrl")}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="remote-resource-embed" data-testid="resource-presentation-remote-read">
      <div className="remote-resource-toolbar">
        <span className="remote-resource-url" title={url}>
          {url}
        </span>
        {onEdit ? (
          <Button variant="ghost" size="sm" data-testid="remote-resource-edit" onClick={onEdit}>
            <EditIcon aria-hidden="true" />
            {t("workspace.editRemoteUrl")}
          </Button>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="remote-resource-open"
          data-testid="remote-resource-open"
        >
          <OpenIcon aria-hidden="true" />
          {t("workspace.openRemoteResource")}
        </a>
      </div>
      <div className="relative flex min-h-0 flex-1" aria-busy={loading} data-testid="remote-resource-content">
        <iframe
          key={url}
          data-testid="remote-resource-frame"
          src={url}
          title={resource.name}
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedUrl(url)}
          onError={() => setLoadedUrl(url)}
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        />
        {loading ? (
          <div className="absolute inset-0 grid place-items-center bg-[var(--hall-color-surface)]">
            <LoadingIndicator>{t("common.loading")}</LoadingIndicator>
          </div>
        ) : null}
      </div>
    </div>
  );
}
