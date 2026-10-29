import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilDelegationsStore } from "../../stores/councilDelegationsStore";
import { delegationKind } from "./representativeBodyKinds";

/** The external representations where a contact is currently designated, read only, each linked to its page. */
// @implements-requirement HALL-FR-DIR-140
export function MemberDelegations({ contactId }: { contactId: string }) {
  const { t, formatDate } = useI18n();
  const { bodies, details, load, loadAllDetails } = useCouncilDelegationsStore();
  useEffect(() => {
    if (bodies.length === 0) void load();
    else void loadAllDetails();
  }, [bodies.length, load, loadAllDetails]);
  const current = Object.values(details)
    .filter((detail) => !detail.body.archivedAt)
    .flatMap((detail) =>
      detail.memberships
        .filter((membership) => membership.contactId === contactId && !membership.endedOn)
        .map((membership) => ({ delegation: detail.body, membership })),
    )
    .sort((left, right) => left.delegation.name.localeCompare(right.delegation.name));
  return (
    <section
      id="delegations"
      className="admin-related"
      aria-labelledby="member-delegations-title"
      data-testid="member-delegations"
    >
      <div className="admin-section-heading">
        <div>
          <h2 id="member-delegations-title">{t("members.delegations")}</h2>
          <p>{t("members.delegationsDescription")}</p>
        </div>
        <Badge variant="secondary">{current.length}</Badge>
      </div>
      {current.length === 0 ? (
        <div className="admin-inline-empty">{t("members.noDelegations")}</div>
      ) : (
        <div className="admin-related-list">
          {current.map(({ delegation, membership }) => (
            <Link
              className="data-row linked"
              key={membership.id}
              to={`${delegationKind.path}/${delegation.id}`}
              data-testid={`member-delegation-${delegation.id}`}
            >
              <div>
                <strong>{delegation.name}</strong>
                <span>
                  {t(delegationKind.roleLabel(membership.role))} ·{" "}
                  {t(delegationKind.text.sinceDate, { date: formatDate(membership.startedOn) })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
