import { type CouncilBusinessCommitteeLink, findSirenAction, type SirenEntity } from "@hall/api-contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AddIcon, CloseIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SearchInput } from "../../components/ui/search-input";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../../services/apiClient";
import {
  associateCouncilBusinessCommittee,
  dissociateCouncilBusinessCommittee,
  listCouncilBusinessCommittees,
} from "../../services/councilBusinessCommitteesApi";
import { listCouncilCommitteesSiren } from "../../services/councilCommitteesApi";
import { type CommitteeCandidate, matchingCommitteeCandidates } from "./committeeSearch";
import "./CouncilBusinessCommittees.css";

/** @implements-requirement HALL-FR-BUS-070 */
export function CouncilBusinessCommittees({ businessId }: { businessId: string }) {
  const { t } = useI18n();
  const activeBusinessId = useRef(businessId);
  activeBusinessId.current = businessId;
  const [associations, setAssociations] = useState<CouncilBusinessCommitteeLink[]>([]);
  const [candidates, setCandidates] = useState<CommitteeCandidate[]>([]);
  const [representation, setRepresentation] = useState<SirenEntity | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setQuery("");
    setAssociations([]);
    setCandidates([]);
    setRepresentation(null);
    setPendingId(null);
    void Promise.all([
      listCouncilBusinessCommittees(businessId),
      sirenRepresentation(`/council-business/${encodeURIComponent(businessId)}`),
    ])
      .then(async ([links, entity]) => {
        if (!current) return;
        setAssociations(links);
        setRepresentation(entity);
        if (findSirenAction(entity, "council-business.associate-committee")) {
          const result = await listCouncilCommitteesSiren();
          if (current) setCandidates(result.data);
        } else {
          setCandidates([]);
        }
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
  }, [businessId]);

  const canAssociate = Boolean(
    representation && findSirenAction(representation, "council-business.associate-committee"),
  );
  const canDissociate = Boolean(
    representation && findSirenAction(representation, "council-business.dissociate-committee"),
  );
  const matches = useMemo(
    () => matchingCommitteeCandidates(candidates, associations, query),
    [candidates, associations, query],
  );
  const resultsOpen = canAssociate && focused && query.trim().length > 0 && !loading;

  const mutate = async (committeeId: string, kind: "associate" | "dissociate") => {
    if (!representation || pendingId || (kind === "associate" ? !canAssociate : !canDissociate)) return;
    setPendingId(committeeId);
    setError(null);
    try {
      if (kind === "associate") await associateCouncilBusinessCommittee(representation, committeeId);
      else await dissociateCouncilBusinessCommittee(representation, committeeId);
      const [links, entity] = await Promise.all([
        listCouncilBusinessCommittees(businessId),
        sirenRepresentation(`/council-business/${encodeURIComponent(businessId)}`),
      ]);
      if (activeBusinessId.current !== businessId) return;
      setAssociations(links);
      setRepresentation(entity);
      setQuery("");
      setSelectedIndex(0);
    } catch (failure) {
      if (activeBusinessId.current === businessId) setError(apiErrorCode(failure));
    } finally {
      if (activeBusinessId.current === businessId) setPendingId(null);
    }
  };

  return (
    <div className="business-committees" data-testid="business-committees">
      <span className="business-committees-label">{t("business.committees")}</span>
      <div className="business-committees-items" data-testid="business-committee-badges">
        {associations.map((association) => (
          <Badge key={association.committeeId} variant="secondary" data-testid="business-committee-badge">
            <Link
              className="business-committee-link"
              to={`/council-committees/${encodeURIComponent(association.committeeId)}`}
              data-testid="business-committee-link"
            >
              {association.name}
            </Link>
            {canDissociate ? (
              <button
                type="button"
                className="business-committee-remove"
                data-testid="business-committee-remove"
                aria-label={t("business.removeCommittee").replace("{name}", association.name)}
                disabled={pendingId !== null}
                onClick={() => void mutate(association.committeeId, "dissociate")}
              >
                <CloseIcon aria-hidden="true" />
              </button>
            ) : null}
          </Badge>
        ))}
        {canAssociate ? (
          <div className="business-committee-search" data-testid="business-committee-search">
            <SearchInput
              data-testid="business-committee-search-input"
              aria-label={t("business.searchCommittee")}
              placeholder={t("business.searchCommittee")}
              value={query}
              disabled={pendingId !== null}
              onFocus={() => setFocused(true)}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget as Node))
                  setFocused(false);
              }}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setSelectedIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFocused(false);
                if (event.key === "ArrowDown" && resultsOpen) {
                  event.preventDefault();
                  setSelectedIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
                }
                if (event.key === "ArrowUp" && resultsOpen) {
                  event.preventDefault();
                  setSelectedIndex((index) => Math.max(index - 1, 0));
                }
                if (event.key === "Enter" && resultsOpen && matches[selectedIndex]) {
                  event.preventDefault();
                  void mutate(matches[selectedIndex].id, "associate");
                }
              }}
            />
            {resultsOpen ? (
              <div className="business-committee-results" data-testid="business-committee-results">
                {matches.length === 0 ? (
                  <p>{t("business.noCommitteeResults")}</p>
                ) : (
                  <>
                    {matches.map((candidate, index) => (
                      <div
                        className="business-committee-result"
                        key={candidate.id}
                        data-testid="business-committee-result"
                      >
                        <button
                          type="button"
                          className="business-committee-result-name"
                          data-testid="business-committee-result-select"
                          aria-current={index === selectedIndex ? "true" : undefined}
                          disabled={pendingId !== null}
                          onFocus={() => setSelectedIndex(index)}
                          onClick={() => void mutate(candidate.id, "associate")}
                        >
                          {candidate.name}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          data-testid="business-committee-result-add"
                          aria-label={t("business.addCommittee").replace("{name}", candidate.name)}
                          disabled={pendingId !== null}
                          onClick={() => void mutate(candidate.id, "associate")}
                        >
                          <AddIcon aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    <p className="business-committee-keyboard-hint">{t("business.committeeEnterHint")}</p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {loading ? <span role="status">{t("common.loading")}</span> : null}
        {pendingId ? <span role="status">{t("common.saving")}</span> : null}
      </div>
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} compact />
    </div>
  );
}
