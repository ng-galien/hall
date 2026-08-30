import type { LegalReferenceResolvedResource, LegalReferenceSnapshot } from "@hall/domain";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, OpenIcon, RedoIcon, WarningIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { legalStatusLabel } from "./legalReferencePresentation";

function optionalDate(value: string | null, formatDate: (value: string) => string, fallback: string): string {
  return value ? formatDate(value) : fallback;
}

export function LegalReferenceResourceView({
  resource,
  snapshots,
  canRefresh,
  refreshing,
  refreshConflict,
  onRefresh,
}: {
  resource: LegalReferenceResolvedResource;
  snapshots: LegalReferenceSnapshot[];
  canRefresh: boolean;
  refreshing: boolean;
  refreshConflict: boolean;
  onRefresh(): void;
}) {
  const { t, formatDate, formatDateTime } = useI18n();
  const currentSnapshot =
    snapshots.find((snapshot) => snapshot.snapshotHash === resource.snapshotHash) ?? snapshots.at(-1) ?? null;
  const history = [...snapshots].reverse();

  return (
    <div className="legal-reference-view">
      <div className="legal-reference-heading">
        <div>
          <span className="legal-reference-citation">{resource.citationLabel}</span>
          <span className={`legal-reference-verification legal-reference-verification-${resource.verificationStatus}`}>
            {resource.verificationStatus === "current" ? (
              <CheckCircleIcon aria-hidden="true" />
            ) : (
              <WarningIcon aria-hidden="true" />
            )}
            {t(
              resource.verificationStatus === "current"
                ? "legalReference.verificationCurrent"
                : "legalReference.verificationUnavailable",
            )}
          </span>
        </div>
        <div className="legal-reference-heading-actions">
          {canRefresh ? (
            <Button
              data-testid="legal-reference-refresh"
              variant="outline"
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={onRefresh}
            >
              {refreshing ? <span className="spinner" aria-hidden="true" /> : <RedoIcon aria-hidden="true" />}
              {t(refreshing ? "legalReference.refreshing" : "legalReference.refresh")}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <a href={resource.sourceUrl} target="_blank" rel="noreferrer">
              <OpenIcon aria-hidden="true" />
              {t("legalReference.openOfficialSource")}
            </a>
          </Button>
        </div>
      </div>

      {refreshConflict ? (
        <p className="legal-reference-notice" role="status">
          {t("legalReference.refreshConflict")}
        </p>
      ) : null}
      {resource.verificationStatus === "verificationUnavailable" ? (
        <p className="legal-reference-warning" role="status">
          <WarningIcon aria-hidden="true" />
          {t("legalReference.lastSnapshotPreserved")}
        </p>
      ) : null}

      <dl className="legal-reference-metadata">
        <div>
          <dt>{t("legalReference.legalStatus")}</dt>
          <dd>{legalStatusLabel(resource.legalStatus, t)}</dd>
        </div>
        <div>
          <dt>{t("legalReference.version")}</dt>
          <dd className="legal-reference-version">{resource.versionId}</dd>
        </div>
        <div>
          <dt>{t("legalReference.effectiveVersion")}</dt>
          <dd>{optionalDate(resource.effectiveAt, formatDate, t("legalReference.currentVersion"))}</dd>
        </div>
        <div>
          <dt>{t("legalReference.validity")}</dt>
          <dd>
            {currentSnapshot?.validFrom
              ? t("legalReference.validFrom").replace("{date}", formatDate(currentSnapshot.validFrom))
              : t("common.none")}
            {currentSnapshot?.validTo
              ? ` · ${t("legalReference.validTo").replace("{date}", formatDate(currentSnapshot.validTo))}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>{t("legalReference.providerUpdatedAt")}</dt>
          <dd>{optionalDate(resource.providerUpdatedAt, formatDateTime, t("common.none"))}</dd>
        </div>
        <div>
          <dt>{t("legalReference.fetchedAt")}</dt>
          <dd>{formatDateTime(resource.fetchedAt)}</dd>
        </div>
      </dl>

      <div className="legal-reference-content-grid">
        <article className="legal-reference-article" aria-labelledby="legal-reference-content-title">
          <header>
            <h2 id="legal-reference-content-title">{t("legalReference.officialText")}</h2>
            <span>{resource.citationLabel}</span>
          </header>
          <div className="legal-reference-text">
            {currentSnapshot?.normalizedContent ?? t("legalReference.contentUnavailable")}
          </div>
          <footer>{resource.attribution}</footer>
        </article>

        <aside className="legal-reference-history" aria-labelledby="legal-reference-history-title">
          <h2 id="legal-reference-history-title">{t("legalReference.history")}</h2>
          {history.length === 0 ? (
            <p>{t("legalReference.historyEmpty")}</p>
          ) : (
            <ol>
              {history.map((snapshot) => (
                <li key={snapshot.id} className={snapshot.snapshotHash === resource.snapshotHash ? "current" : ""}>
                  <strong>{snapshot.versionId}</strong>
                  <span>{legalStatusLabel(snapshot.legalStatus, t)}</span>
                  <span>{formatDateTime(snapshot.fetchedAt)}</span>
                  {snapshot.effectiveAt ? <span>{formatDate(snapshot.effectiveAt)}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
