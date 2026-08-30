import type { RemoteResource } from "@hall/domain";
import { OpenIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";

/** Direct browser preview for an external web resource; Hall never fetches the remote content server-side. */
export function RemoteResourceEmbed({ resource }: { resource: RemoteResource }) {
  const { t } = useI18n();
  if (!resource.url) return null;
  return (
    <div className="remote-resource-embed">
      <div className="remote-resource-toolbar">
        <span className="remote-resource-url" title={resource.url}>
          {resource.url}
        </span>
        <a href={resource.url} target="_blank" rel="noreferrer" className="remote-resource-open">
          <OpenIcon aria-hidden="true" />
          {t("workspace.openRemoteResource")}
        </a>
      </div>
      <iframe
        data-testid="remote-resource-frame"
        src={resource.url}
        title={resource.title}
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
    </div>
  );
}
