import type { CouncilCommitteeBusinessLink } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { CouncilBusinessIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { SectionHeader } from "../../components/ui/section-header";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { listCouncilCommitteeBusinesses } from "../../services/councilBusinessCommitteesApi";

/** @implements-requirement HALL-FR-BUS-070 */
export function CouncilCommitteeBusinesses({ committeeId }: { committeeId: string }) {
  const { t } = useI18n();
  const [businesses, setBusinesses] = useState<CouncilCommitteeBusinessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorCode | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void listCouncilCommitteeBusinesses(committeeId)
      .then((links) => {
        if (current) setBusinesses(links);
      })
      .catch((failure) => {
        if (current) setError(apiErrorCode(failure));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [committeeId]);

  return (
    <section className="admin-related" aria-labelledby="committee-businesses-title" data-testid="committee-businesses">
      <SectionHeader
        titleId="committee-businesses-title"
        title={t("committees.businesses")}
        description={t("committees.businessesDescription")}
      />
      {loading ? <p role="status">{t("common.loading")}</p> : null}
      {!loading && businesses.length === 0 && !error ? <p>{t("committees.noBusinesses")}</p> : null}
      {businesses.length > 0 ? (
        <ListRows>
          {businesses.map((business) => (
            <ListRow
              key={business.councilBusinessId}
              to={`/workspace?${new URLSearchParams({ councilBusiness: business.councilBusinessId })}`}
              openTestId="committee-business-link"
              head={
                <ListRowIcon nature="council">
                  <CouncilBusinessIcon />
                </ListRowIcon>
              }
              title={business.title}
            />
          ))}
        </ListRows>
      ) : null}
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} compact />
    </section>
  );
}
