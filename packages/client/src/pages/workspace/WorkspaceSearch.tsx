import { type ResourceSearchCriteria, type ResourceSummary, resourceKinds } from "@hall/api-contract";
import { type CouncilBusiness, matchDiscriminated } from "@hall/domain";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardViewIcon, ListViewIcon } from "../../components/icons";
import { FolderSectionsList } from "../../components/search/FolderSectionsList";
import type { FacetOptionSets } from "../../components/search/facetSuggestions";
import { folderSections, sectionItems } from "../../components/search/folderSections";
import {
  emptySearchBoxState,
  isSearchBoxActive,
  SearchBox,
  type SearchBoxState,
} from "../../components/search/SearchBox";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { councilBusinessKindKeys } from "../../features/council-business/presentation";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
  documentaryResourceTone,
  useDocumentaryResourceTypeLabel,
} from "../../features/documents/DocumentaryResourceGlyph";
import { SearchResultRow } from "../../features/search/SearchHitRow";
import { searchTypeLabelKeys } from "../../features/search/searchCorpus";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities } from "../../lib/search";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { WorkspaceSelection } from "./workspaceItemReference";

type ResourceReadiness = ResourceSearchCriteria["readiness"][number];
type ResourceSearchMedia = ResourceSearchCriteria["media"][number];
type WorkspaceSearchKind = "councilBusiness" | "resource";
type WorkspaceBusinessSearchHit = Searchable<"councilBusiness"> & {
  entity: { entityKind: "councilBusiness"; business: CouncilBusiness };
};
type WorkspaceResourceSearchHit = Searchable<"resource"> & {
  entity: { entityKind: "documentaryResource"; resource: DocumentaryLeafSummary };
};
type WorkspaceSearchHit = WorkspaceBusinessSearchHit | WorkspaceResourceSearchHit;

const leafResourceKinds = resourceKinds.filter((kind) => kind !== "folder");
const readinessLabelKeys = {
  incomplete: "workspace.resourceState.incomplete",
  empty: "workspace.resourceState.empty",
  ready: "status.ready",
} as const;

export type WorkspaceSearchState = SearchBoxState<WorkspaceSearchKind, ResourceReadiness, ResourceSearchMedia>;

export const emptySearch: WorkspaceSearchState = emptySearchBoxState;

export function isSearchActive(search: WorkspaceSearchState): boolean {
  return isSearchBoxActive(search);
}

function pathPrefixes(paths: readonly string[]): string[] {
  const prefixes = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    segments.forEach((_segment, index) => {
      prefixes.add(segments.slice(0, index + 1).join("/"));
    });
  }
  return [...prefixes].sort((left, right) => left.localeCompare(right, "fr"));
}

function isDocumentaryLeaf(resource: ResourceSummary): resource is DocumentaryLeafSummary {
  return resource.kind !== "folder";
}

function WorkspaceSearchHitRow({
  hit,
  active,
  card,
  onPick,
}: {
  hit: WorkspaceSearchHit;
  active?: boolean;
  card?: boolean;
  onPick(hit: WorkspaceSearchHit): void;
}) {
  const { t, formatFileSize } = useI18n();
  const typeLabel = useDocumentaryResourceTypeLabel();
  const presentation = matchDiscriminated(hit.entity, "entityKind", {
    councilBusiness: ({ business }) => ({
      glyph: <CouncilBusinessGlyph business={business} />,
      title: business.title,
      meta: t(councilBusinessKindKeys[business.kind]),
    }),
    documentaryResource: ({ resource }) => ({
      glyph: <DocumentaryResourceGlyph resource={resource} />,
      title: resource.name,
      meta:
        resource.kind === "document"
          ? `${typeLabel(resource)} · ${formatFileSize(resource.binary.byteSize)}`
          : typeLabel(resource),
    }),
  });
  return <SearchResultRow {...presentation} active={active} card={card} onPick={() => onPick(hit)} />;
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
  const { t } = useI18n();
  const [layout, setLayout] = useState<"list" | "cards">("list");
  const [preview, setPreview] = useState<WorkspaceSearchState | null>(null);
  const [rawActiveRow, setActiveRow] = useState(0);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const catalog = useWorkspaceResourcesStore((state) => state.catalog);
  const resourceSearchResult = useWorkspaceResourcesStore((state) => state.searchResult);
  const searchResources = useWorkspaceResourcesStore((state) => state.search);
  const clearResourceSearch = useWorkspaceResourcesStore((state) => state.clearSearch);

  const effective = preview ?? search;
  const active = isSearchActive(effective);
  const businessAllowed = effective.types.length === 0 || effective.types.includes("councilBusiness");
  const resourceAllowed = effective.types.length === 0 || effective.types.includes("resource");
  const resourceCriteria = useMemo<ResourceSearchCriteria>(
    () => ({
      query: effective.query.replace(/#([^\s#]*)$/, "").trim(),
      paths: effective.folders,
      kinds: leafResourceKinds,
      tags: effective.tags,
      readiness: effective.states,
      media: effective.media,
    }),
    [effective.folders, effective.media, effective.query, effective.states, effective.tags],
  );

  useEffect(() => {
    if (!active || !resourceAllowed) {
      clearResourceSearch();
      return;
    }
    const timer = window.setTimeout(() => void searchResources(resourceCriteria), 180);
    return () => window.clearTimeout(timer);
  }, [active, clearResourceSearch, resourceAllowed, resourceCriteria, searchResources]);

  const businessCorpus = useMemo<WorkspaceBusinessSearchHit[]>(
    () =>
      businesses.map((business) => ({
        kind: "councilBusiness",
        id: business.id,
        label: business.title,
        extra: [business.report],
        folderPath: business.folderPath,
        entity: { entityKind: "councilBusiness", business },
      })),
    [businesses],
  );
  const businessHits = useMemo(
    () =>
      !businessAllowed || effective.tags.length > 0 || effective.states.length > 0 || effective.media.length > 0
        ? []
        : searchEntities(businessCorpus, effective.query, {
            context,
            kinds: ["councilBusiness"],
            folders: effective.folders,
          }).results,
    [businessAllowed, businessCorpus, context, effective],
  );
  const resourceHits = useMemo<WorkspaceResourceSearchHit[]>(() => {
    if (!resourceAllowed) return [];
    const candidates = (resourceSearchResult?.items ?? []).filter(isDocumentaryLeaf).map((resource) => ({
      kind: "resource" as const,
      id: resource.id,
      label: resource.name,
      extra: resource.tags,
      folderPath: resource.path,
      tags: resource.tags,
      media: documentaryResourceTone(resource) === "image" ? ("image" as const) : undefined,
      entity: { entityKind: "documentaryResource" as const, resource },
    }));
    return searchEntities(candidates, "", { context }).results;
  }, [context, resourceAllowed, resourceSearchResult]);
  const hits = useMemo<WorkspaceSearchHit[]>(() => [...businessHits, ...resourceHits], [businessHits, resourceHits]);

  const facetOptions = useMemo<FacetOptionSets<WorkspaceSearchKind, ResourceReadiness, ResourceSearchMedia>>(() => {
    const resourceAvailable = catalog.some((entry) => entry.kind !== "folder") || resourceHits.length > 0;
    const types = (
      [
        ...(businesses.length > 0 ? (["councilBusiness"] as const) : []),
        ...(resourceAvailable ? (["resource"] as const) : []),
      ] as WorkspaceSearchKind[]
    ).map((value) => ({ value, label: t(searchTypeLabelKeys[value]) }));
    const paths = pathPrefixes([
      ...businesses.map((business) => business.folderPath),
      ...(resourceSearchResult?.facets.paths ?? []),
    ]);
    return {
      types,
      folders: paths.map((value) => ({ value, label: value })),
      tags: (resourceSearchResult?.facets.tags ?? []).map((value) => ({ value, label: value })),
      states: (resourceSearchResult?.facets.readiness ?? []).map((value) => ({
        value,
        label: t(readinessLabelKeys[value]),
      })),
      media: (resourceSearchResult?.facets.media ?? []).map((value) => ({
        value,
        label: t("workspace.type.image"),
      })),
    };
  }, [businesses, catalog, resourceHits.length, resourceSearchResult, t]);

  const sections = useMemo(() => folderSections(hits, (kind) => t(searchTypeLabelKeys[kind])), [hits, t]);
  const shown = useMemo(() => sectionItems(sections), [sections]);
  const total = hits.length;
  const activeRow = Math.min(rawActiveRow, Math.max(total - 1, 0));

  const pick = (hit: WorkspaceSearchHit) => {
    return matchDiscriminated(hit.entity, "entityKind", {
      councilBusiness: ({ business }) => {
        onSearch(emptySearch);
        onSelect({ kind: "councilBusiness", id: business.id }, business.folderPath);
      },
      documentaryResource: ({ resource }) => {
        onSearch(emptySearch);
        onSelect({ kind: "resource", id: resource.id }, resource.path);
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
                <WorkspaceSearchHitRow key={`${hit.kind}:${hit.id}`} hit={hit} card onPick={pick} />
              ))}
            </div>
          ) : (
            <FolderSectionsList
              sections={sections}
              itemKey={(hit) => `${hit.kind}:${hit.id}`}
              renderItem={(hit, index) => (
                <WorkspaceSearchHitRow hit={hit} active={index === activeRow} onPick={pick} />
              )}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
