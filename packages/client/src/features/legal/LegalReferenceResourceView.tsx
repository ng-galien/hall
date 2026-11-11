import type { ResourceDetail } from "@hall/api-contract";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { CheckCircleIcon, OpenIcon, RedoIcon, WarningIcon } from "../../components/icons";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { useI18n } from "../../i18n/I18nProvider";
import { ToneGlyph } from "../documents/ResourceGlyph";
import { legalStatusLabel } from "./legalReferencePresentation";

function optionalDate(value: string | null, formatDate: (value: string) => string, fallback: string): string {
  return value ? formatDate(value) : fallback;
}

export function LegalReferenceResourceView({
  resource,
  canRefresh,
  refreshing,
  refreshConflict,
  onRefresh,
}: {
  resource: Extract<ResourceDetail, { kind: "legalReference" }>;
  canRefresh: boolean;
  refreshing: boolean;
  refreshConflict: boolean;
  onRefresh(): void;
}) {
  const { t, formatDate, formatDateTime } = useI18n();
  if (resource.document.resolutionStatus !== "resolved") return null;
  const details = resource.document;
  const snapshots = details.snapshots;
  const currentSnapshot =
    snapshots.find((snapshot) => snapshot.snapshotHash === details.snapshotHash) ?? snapshots.at(-1) ?? null;
  const history = [...snapshots].reverse();

  return (
    <div className="legal-reference-view">
      <div className="legal-reference-heading">
        <div>
          <span className="legal-reference-citation">{details.citationLabel}</span>
          <span className={`legal-reference-verification legal-reference-verification-${details.verificationStatus}`}>
            {details.verificationStatus === "current" ? (
              <CheckCircleIcon aria-hidden="true" />
            ) : (
              <WarningIcon aria-hidden="true" />
            )}
            {t(
              details.verificationStatus === "current"
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
              {refreshing ? <LoadingIndicator aria-hidden="true" /> : <RedoIcon aria-hidden="true" />}
              {t(refreshing ? "legalReference.refreshing" : "legalReference.refresh")}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <a href={details.sourceUrl} target="_blank" rel="noreferrer">
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
      {details.verificationStatus === "verificationUnavailable" ? (
        <p className="legal-reference-warning" role="status">
          <WarningIcon aria-hidden="true" />
          {t("legalReference.lastSnapshotPreserved")}
        </p>
      ) : null}

      <dl className="legal-reference-metadata">
        <div>
          <dt>{t("legalReference.legalStatus")}</dt>
          <dd>{legalStatusLabel(details.legalStatus, t)}</dd>
        </div>
        <div>
          <dt>{t("legalReference.version")}</dt>
          <dd className="legal-reference-version">{details.versionId}</dd>
        </div>
        <div>
          <dt>{t("legalReference.effectiveVersion")}</dt>
          <dd>{optionalDate(details.effectiveAt, formatDate, t("legalReference.currentVersion"))}</dd>
        </div>
        <div>
          <dt>{t("legalReference.validity")}</dt>
          <dd>
            {currentSnapshot?.validFrom
              ? t("legalReference.validFrom", { date: formatDate(currentSnapshot.validFrom) })
              : t("common.none")}
            {currentSnapshot?.validTo
              ? ` · ${t("legalReference.validTo", { date: formatDate(currentSnapshot.validTo) })}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>{t("legalReference.providerUpdatedAt")}</dt>
          <dd>{optionalDate(details.providerUpdatedAt, formatDateTime, t("common.none"))}</dd>
        </div>
        <div>
          <dt>{t("legalReference.fetchedAt")}</dt>
          <dd>{formatDateTime(details.fetchedAt)}</dd>
        </div>
      </dl>

      <div className="legal-reference-content-grid">
        <article className="legal-reference-article" aria-labelledby="legal-reference-content-title">
          <header>
            <h2 id="legal-reference-content-title">{t("legalReference.officialText")}</h2>
            <span>{details.citationLabel}</span>
          </header>
          <div className="legal-reference-text">
            {currentSnapshot?.normalizedContent ?? t("legalReference.contentUnavailable")}
          </div>
          <footer>{details.attribution}</footer>
        </article>

        <aside className="legal-reference-history" aria-labelledby="legal-reference-history-title">
          <h2 id="legal-reference-history-title">{t("legalReference.history")}</h2>
          {history.length === 0 ? (
            <p>{t("legalReference.historyEmpty")}</p>
          ) : (
            <ListRows>
              {history.map((snapshot) => (
                <ListRow
                  key={snapshot.id}
                  selected={snapshot.snapshotHash === details.snapshotHash}
                  head={<ToneGlyph tone="legalReference" />}
                  title={snapshot.versionId}
                  detail={[
                    formatDateTime(snapshot.fetchedAt),
                    snapshot.effectiveAt ? formatDate(snapshot.effectiveAt) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  status={{ tone: "neutral", label: legalStatusLabel(snapshot.legalStatus, t) }}
                />
              ))}
            </ListRows>
          )}
        </aside>
      </div>
    </div>
  );
}
