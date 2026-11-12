import type { LegalReferenceSearchResult, ResourceDetail } from "@hall/api-contract";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { LegalReferenceIcon, OpenIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { ActiveOption } from "../../components/ui/active-option";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { legalStatusLabel } from "./legalReferencePresentation";

const LEGAL_REFERENCE_SEARCH_DEBOUNCE_MS = 650;
const LEGAL_REFERENCE_SEARCH_MINIMUM_LENGTH = 2;

export function LegalReferenceResolver({
  resource,
  onResolved,
}: {
  resource: Extract<ResourceDetail, { kind: "legalReference" }>;
  onResolved(resource: Extract<ResourceDetail, { kind: "legalReference" }>): void;
}) {
  const { t } = useI18n();
  const resultsId = useId();
  const requestSequence = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LegalReferenceSearchResult[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const selected = results.find((result) => result.versionId === selectedVersionId) ?? null;

  const search = useCallback(async (normalizedQuery: string) => {
    const sequence = ++requestSequence.current;
    setSearching(true);
    setError(null);
    try {
      const nextResults = await useWorkspaceResourcesStore.getState().searchLegalReferences({
        query: normalizedQuery,
        effectiveAt: null,
      });
      const requestError = useWorkspaceResourcesStore.getState().error;
      if (requestError) throw new Error(requestError);
      if (requestSequence.current !== sequence) return;
      setResults(nextResults);
      setSelectedVersionId((current) =>
        current && nextResults.some((result) => result.versionId === current) ? current : null,
      );
      setSearched(true);
    } catch (failure) {
      if (requestSequence.current !== sequence) return;
      setResults([]);
      setSelectedVersionId(null);
      setSearched(true);
      setError(apiErrorCode(failure));
    } finally {
      if (requestSequence.current === sequence) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < LEGAL_REFERENCE_SEARCH_MINIMUM_LENGTH) {
      requestSequence.current += 1;
      setResults([]);
      setSelectedVersionId(null);
      setSearched(false);
      setSearching(false);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void search(normalizedQuery);
    }, LEGAL_REFERENCE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const resolve = async () => {
    if (!selected || resolving) return;
    setResolving(true);
    setError(null);
    try {
      const resolved = await useWorkspaceResourcesStore.getState().resolveLegalReference(resource.id, {
        title: selected.title,
        provider: selected.provider,
        referenceKind: selected.referenceKind,
        fund: selected.fund,
        versionId: selected.versionId,
        effectiveAt: selected.effectiveAt,
      });
      if (resolved?.kind !== "legalReference" || resolved.document.resolutionStatus !== "resolved") {
        throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
      }
      onResolved(resolved);
    } catch (failure) {
      setError(apiErrorCode(failure));
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="legal-reference-setup">
      <div className="legal-reference-setup-heading">
        <h2>{t("legalReference.setupTitle")}</h2>
        <p>{t("legalReference.searchDescription")}</p>
      </div>
      <RequestErrorBanner error={error} />
      <SearchInput
        autoFocus
        data-testid="legal-reference-search-input"
        role="combobox"
        value={query}
        status={searching ? t("legalReference.searching") : undefined}
        aria-autocomplete="list"
        aria-controls={resultsId}
        aria-expanded={results.length > 0}
        aria-activedescendant={selected ? `legal-reference-result-${selected.versionId}` : undefined}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (!results.length || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          const selectedIndex = results.findIndex((result) => result.versionId === selectedVersionId);
          const nextIndex =
            selectedIndex < 0
              ? event.key === "ArrowDown"
                ? 0
                : results.length - 1
              : (selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          setSelectedVersionId(results[nextIndex]?.versionId ?? null);
        }}
        placeholder={t("legalReference.searchPlaceholder")}
        aria-label={t("legalReference.searchLabel")}
      />
      <div
        id={resultsId}
        className="legal-reference-search-results"
        role="listbox"
        aria-label={t("legalReference.resultsLabel")}
        aria-live="polite"
      >
        {results.map((result) => {
          const selectedResult = result.versionId === selectedVersionId;
          return (
            <ActiveOption
              id={`legal-reference-result-${result.versionId}`}
              key={result.versionId}
              className={`legal-reference-result${selectedResult ? " legal-reference-result-selected" : ""}`}
              data-testid={`legal-reference-result-${result.versionId}`}
              role="option"
              aria-selected={selectedResult}
              onClick={() => setSelectedVersionId(result.versionId)}
            >
              <LegalReferenceIcon aria-hidden="true" />
              <span className="legal-reference-result-copy">
                <strong>{result.title}</strong>
                <span>
                  {legalStatusLabel(result.legalStatus, t)} · {result.versionId}
                </span>
              </span>
            </ActiveOption>
          );
        })}
        {searched && !error && results.length === 0 ? (
          <p className="legal-reference-search-empty">{t("legalReference.noResults")}</p>
        ) : query.trim().length < LEGAL_REFERENCE_SEARCH_MINIMUM_LENGTH ? (
          <p className="legal-reference-search-empty">{t("legalReference.searchHint")}</p>
        ) : null}
      </div>
      <div className="legal-reference-setup-actions">
        <Button asChild variant="secondary">
          <a href={selected?.sourceUrl ?? "https://www.legifrance.gouv.fr/"} target="_blank" rel="noreferrer">
            <OpenIcon aria-hidden="true" />
            {t("legalReference.openOfficialSource")}
          </a>
        </Button>
        <Button
          data-testid="legal-reference-resolve-submit"
          type="button"
          disabled={!selected || resolving}
          onClick={() => void resolve()}
        >
          {t(resolving ? "common.saving" : "legalReference.useReference")}
        </Button>
      </div>
    </div>
  );
}
