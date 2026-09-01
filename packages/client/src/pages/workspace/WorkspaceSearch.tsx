import { matchDiscriminated } from "@hall/domain";
import { type KeyboardEvent, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardViewIcon, ListViewIcon } from "../../components/icons";
import { FolderSectionsList } from "../../components/search/FolderSectionsList";
import { folderSections, sectionItems } from "../../components/search/folderSections";
import {
  emptySearchBoxState,
  isSearchBoxActive,
  SearchBox,
  type SearchBoxState,
} from "../../components/search/SearchBox";
import { SearchHitRow } from "../../features/search/SearchHitRow";
import {
  searchTypeLabelKeys,
  useSearchCorpus,
  useSearchFacetOptions,
  type WorkspaceSearchHit,
} from "../../features/search/searchCorpus";
import { useI18n } from "../../i18n/I18nProvider";
import { searchEntities } from "../../lib/search";
import type { WorkspaceSelection } from "./workspaceItemReference";

export type WorkspaceSearchState = SearchBoxState<WorkspaceSearchHit["kind"]>;

export const emptySearch: WorkspaceSearchState = emptySearchBoxState;

export function isSearchActive(search: WorkspaceSearchState): boolean {
  return isSearchBoxActive(search);
}

export function WorkspaceSearch({
  search,
  onSearch,
  onSelect,
  context,
}: {
  search: WorkspaceSearchState;
  onSearch(next: WorkspaceSearchState): void;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  /** Open folder; results close to it rank first. */
  context?: string;
}) {
  const { t, formatNumber } = useI18n();
  const [layout, setLayout] = useState<"list" | "cards">("list");
  const [preview, setPreview] = useState<WorkspaceSearchState | null>(null);
  const [rawActiveRow, setActiveRow] = useState(0);

  const corpus = useSearchCorpus("workspace");
  const facetOptions = useSearchFacetOptions(corpus);

  const effective = preview ?? search;
  const active = isSearchActive(effective);
  const hits = useMemo(
    () =>
      searchEntities(corpus, effective.query, {
        context,
        kinds: effective.types,
        folders: effective.folders,
        tags: effective.tags,
        states: effective.states,
        media: effective.media,
      }).results,
    [corpus, effective, context],
  );
  const sections = useMemo(() => folderSections(hits, (kind) => t(searchTypeLabelKeys[kind])), [hits, t]);
  const shown = useMemo(() => sectionItems(sections), [sections]);
  const total = hits.length;
  const activeRow = Math.min(rawActiveRow, Math.max(total - 1, 0));

  const pick = (hit: WorkspaceSearchHit) => {
    const entity = hit.entity;
    return matchDiscriminated(entity, "entityKind", {
      councilBusiness: (entry) => {
        onSearch(emptySearch);
        onSelect({ kind: "councilBusiness", id: entry.business.id }, entry.business.folderPath);
      },
      resource: (entry) => {
        onSearch(emptySearch);
        onSelect({ kind: "resource", id: entry.resource.id }, entry.resource.folderPath);
      },
    });
  };

  const onResultsKey = (event: KeyboardEvent) => {
    if (total === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveRow((activeRow + 1) % total);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveRow((activeRow - 1 + total) % total);
    } else if (event.key === "Enter" && shown[activeRow]) {
      event.preventDefault();
      pick(shown[activeRow]);
    }
  };

  const onPreview = useCallback((next: WorkspaceSearchState | null) => setPreview(next), []);

  return (
    <div className="wsearch">
      <SearchBox
        state={search}
        onState={(next) => {
          onSearch(next);
          setActiveRow(0);
        }}
        typeOptions={facetOptions.types}
        folderOptions={facetOptions.folders}
        tagOptions={facetOptions.tags}
        stateOptions={facetOptions.states}
        mediaOptions={facetOptions.media}
        placeholder={t("workspace.searchEverywhere")}
        onPreview={onPreview}
        onResultsKey={onResultsKey}
        testId="workspace-search"
      />

      {active ? (
        <div className="wsearch-results">
          <div className="wsearch-results-bar">
            <span className="workspace-list-heading">
              {t("workspace.resultsCount").replace("{count}", formatNumber(total))}
            </span>
            <span className="wsearch-layout">
              <Button
                variant={layout === "list" ? "default" : "ghost"}
                size="icon-sm"
                aria-label={t("common.layoutList")}
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              >
                <ListViewIcon />
              </Button>
              <Button
                variant={layout === "cards" ? "default" : "ghost"}
                size="icon-sm"
                aria-label={t("common.layoutCards")}
                aria-pressed={layout === "cards"}
                onClick={() => setLayout("cards")}
              >
                <CardViewIcon />
              </Button>
            </span>
          </div>
          {total === 0 ? (
            <p className="workspace-list-empty">{t("workspace.noResults")}</p>
          ) : layout === "cards" ? (
            <div className="wsearch-grid">
              {hits.map((hit) => (
                <SearchHitRow key={`${hit.kind}:${hit.id}`} hit={hit} card onPick={pick} />
              ))}
            </div>
          ) : (
            <FolderSectionsList
              sections={sections}
              itemKey={(hit) => `${hit.kind}:${hit.id}`}
              renderItem={(hit, index) => <SearchHitRow hit={hit} active={index === activeRow} onPick={pick} />}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
