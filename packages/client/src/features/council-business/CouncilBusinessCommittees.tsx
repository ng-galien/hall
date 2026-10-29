import { type CouncilBusinessCommitteeLink, findSirenAction, type SirenEntity } from "@hall/api-contract";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDownIcon, CloseIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Badge } from "../../components/ui/badge";
import { SearchInput } from "../../components/ui/search-input";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../../services/apiClient";
import {
  associateCouncilBusinessCommittee,
  dissociateCouncilBusinessCommittee,
  listCouncilBusinessCommittees,
} from "../../services/councilBusinessCommitteesApi";
import { representativeBodiesApi } from "../../services/representativeBodiesApi";
import { committeeKind } from "../representative-bodies/representativeBodyKinds";
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
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
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
    setOpen(false);
    void Promise.all([
      listCouncilBusinessCommittees(businessId),
      sirenRepresentation(`/council-business/${encodeURIComponent(businessId)}`),
    ])
      .then(async ([links, entity]) => {
        if (!current) return;
        setAssociations(links);
        setRepresentation(entity);
        if (findSirenAction(entity, "council-business.associate-committee")) {
          const result = await representativeBodiesApi(committeeKind).list();
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
  const resultsOpen = canAssociate && open && !loading;

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
      setOpen(false);
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
                aria-label={t("business.removeCommittee", { name: association.name })}
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
              ref={inputRef}
              className="business-committee-search-input"
              data-testid="business-committee-search-input"
              role="combobox"
              aria-expanded={resultsOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={resultsOpen && matches[selectedIndex] ? `${listId}-${selectedIndex}` : undefined}
              aria-label={t("business.searchCommittee")}
              placeholder={t("business.searchCommittee")}
              value={query}
              disabled={pendingId !== null}
              onClick={() => setOpen(true)}
              onBlur={(event) => {
                const search = event.currentTarget.closest(".business-committee-search");
                if (!search?.contains(event.relatedTarget as Node)) setOpen(false);
              }}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setSelectedIndex(0);
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && resultsOpen) {
                  event.preventDefault();
                  setOpen(false);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (!resultsOpen) setOpen(true);
                  else setSelectedIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
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
            <button
              type="button"
              tabIndex={-1}
              className="business-committee-search-toggle"
              data-testid="business-committee-search-toggle"
              aria-label={t("business.showCommittees")}
              aria-expanded={resultsOpen}
              disabled={pendingId !== null}
              onClick={() => {
                setOpen(!resultsOpen);
                inputRef.current?.focus();
              }}
            >
              <ChevronDownIcon aria-hidden="true" />
            </button>
            {resultsOpen ? (
              <div className="business-committee-results" data-testid="business-committee-results">
                {matches.length === 0 ? (
                  <p>{t("business.noCommitteeResults")}</p>
                ) : (
                  <div id={listId} role="listbox" aria-label={t("business.committees")}>
                    {matches.map((candidate, index) => (
                      <button
                        type="button"
                        key={candidate.id}
                        id={`${listId}-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={index === selectedIndex}
                        className="business-committee-result"
                        data-testid="business-committee-result"
                        disabled={pendingId !== null}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void mutate(candidate.id, "associate")}
                      >
                        {candidate.name}
                      </button>
                    ))}
                  </div>
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
