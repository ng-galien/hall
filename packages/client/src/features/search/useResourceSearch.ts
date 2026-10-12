import { type ResourceSearchResult, resourceKinds, resourceSearchCriteriaSchema } from "@hall/api-contract";
import { referenceEntityKinds } from "@hall/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mentionable } from "../../components/editor/references";
import { facetOptionsFrom } from "../../components/search/facetSuggestions";
import type { SearchBoxState } from "../../components/search/SearchBox";
import { resourceMentionable, useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { type SearchType, searchEntities } from "../../lib/search";
import { searchDocumentaryResources } from "../../services/resourcesApi";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { toneLabelKeys } from "../documents/ResourceGlyph";
import { searchTypeLabelKeys } from "./searchCorpus";

export interface ResourceSearchScope {
  types?: readonly SearchType[];
  excludedIds?: readonly string[];
  includedIds?: readonly string[];
  context?: string;
  businessId?: string;
}
export const allSearchTypes: readonly SearchType[] = [
  ...referenceEntityKinds.filter((kind) => kind !== "resource"),
  ...resourceKinds.filter((kind) => kind !== "folder"),
];
const emptyItems: Mentionable[] = [];
const emptyScope: ResourceSearchScope = {};
const pageSize = 30;

// @implements-requirement HALL-FR-SRC-020
export function useResourceSearch(
  state: SearchBoxState<SearchType>,
  scope: ResourceSearchScope = emptyScope,
  supplied: readonly Mentionable[] = emptyItems,
  enabled = true,
) {
  const { t } = useI18n();
  const canonical = useReferenceMentionables(scope.businessId);
  const representation = useWorkspaceResourcesStore((s) => s.collectionRepresentation);
  const loadCatalog = useWorkspaceResourcesStore((s) => s.loadCatalog);
  const catalogError = useWorkspaceResourcesStore((s) => s.error);
  const base = useMemo(
    () => [...new Map([...canonical, ...supplied].map((item) => [`${item.kind}:${item.id}`, item])).values()],
    [canonical, supplied],
  );
  const allowed = scope.types ?? allSearchTypes;
  const eligibleTypes = allSearchTypes.filter(
    (type) => allowed.includes(type) || (allowed.includes("resource") && resourceKinds.some((kind) => kind === type)),
  );
  const types = state.types.length
    ? eligibleTypes.filter(
        (type) =>
          state.types.includes(type) ||
          (state.types.includes("resource") && resourceKinds.some((kind) => kind === type)),
      )
    : eligibleTypes;
  const kinds = resourceKinds.filter((kind) => kind !== "folder" && types.includes(kind));
  const excluded = new Set(scope.excludedIds ?? []);
  const preferred = base.filter((item) => item.preferred).map((item) => item.id);
  const criteria = {
    query: state.query.replace(/#([^\s#]*)$/, "").trim(),
    paths: state.folders,
    kinds,
    tags: state.tags,
    readiness: state.states.filter((value): value is "ready" | "incomplete" | "empty" =>
      ["ready", "incomplete", "empty"].includes(value),
    ),
    media: state.media,
    context: scope.context ?? "",
    preferredIds: preferred,
    excludedIds: [...excluded],
    includedIds: scope.includedIds,
  };
  const [retryEpoch, setRetryEpoch] = useState(0);
  const key = JSON.stringify({ ...criteria, states: state.states, retryEpoch });
  const [page, setPage] = useState({ key: "", size: pageSize });
  const size = page.key === key ? page.size : pageSize;
  const [remote, setRemote] = useState<{
    key: string;
    items: Mentionable[];
    total: number;
    facets: ResourceSearchResult["facets"];
  } | null>(null);
  const [request, setRequest] = useState<{ key: string; size: number; error: boolean } | null>(null);
  const generation = useRef(0);
  const canSearchResources =
    enabled && kinds.length > 0 && (state.states.length === 0 || criteria.readiness.length > 0);
  useEffect(() => {
    if (canSearchResources && !representation) void loadCatalog();
  }, [canSearchResources, representation, loadCatalog]);
  useEffect(() => {
    const current = ++generation.current;
    if (!canSearchResources || !representation) return;
    const timer = window.setTimeout(async () => {
      try {
        const requestCriteria = resourceSearchCriteriaSchema.parse(JSON.parse(key));
        const items: Mentionable[] = [];
        let total = 0;
        let facets: ResourceSearchResult["facets"] = {
          paths: [],
          tags: [],
          readiness: [],
          media: [],
        };
        while (items.length < size) {
          const result = await searchDocumentaryResources(representation, {
            ...requestCriteria,
            offset: items.length,
            limit: Math.min(100, size - items.length),
          });
          if (current !== generation.current) return;
          total = result.data.total;
          facets = result.data.facets;
          items.push(
            ...result.data.items.flatMap((resource) =>
              resource.kind === "folder"
                ? []
                : [
                    {
                      ...resourceMentionable(resource, t),
                      preferred: requestCriteria.preferredIds?.includes(resource.id),
                    },
                  ],
            ),
          );
          if (items.length >= total || !result.data.items.length) break;
        }
        setRemote({ key, items, total, facets });
        setRequest({ key, size, error: false });
      } catch {
        if (current === generation.current) setRequest({ key, size, error: true });
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      generation.current++;
    };
  }, [key, size, representation, canSearchResources, t]);
  const current = remote?.key === key ? remote : null;
  const error =
    canSearchResources &&
    ((request?.key === key && request.size === size && request.error) || (!representation && !!catalogError));
  const loading = canSearchResources && !error && (!representation || request?.key !== key || request.size !== size);
  const local = searchEntities(
    base.filter(
      (item) =>
        types.length > 0 &&
        item.kind !== "resource" &&
        !excluded.has(item.id) &&
        (scope.includedIds === undefined || scope.includedIds.includes(item.id)),
    ),
    criteria.query,
    {
      kinds: types,
      folders: state.folders,
      tags: state.tags,
      states: state.states,
      media: state.media,
      context: scope.context,
    },
  );
  const merged = searchEntities([...local.results, ...(current?.items ?? [])], criteria.query, {
    context: scope.context,
  }).results;
  const total = local.total + (canSearchResources ? (current?.total ?? 0) : 0);
  const typeLabel = (type: SearchType) =>
    type in searchTypeLabelKeys
      ? t(searchTypeLabelKeys[type as keyof typeof searchTypeLabelKeys])
      : t(toneLabelKeys[type as keyof typeof toneLabelKeys]);
  const facets = facetOptionsFrom(
    base.filter(
      (item) =>
        !excluded.has(item.id) &&
        (scope.includedIds === undefined || scope.includedIds.includes(item.id)) &&
        (types.includes(item.kind) || (item.resourceKind && types.includes(item.resourceKind))),
    ),
    (kind) => t(searchTypeLabelKeys[kind]),
    undefined,
    {
      state: (value) => base.find((item) => item.state === value)?.stateLabel ?? value,
      media: () => t("workspace.type.image"),
    },
  );
  const paths = new Set([...(current?.facets.paths ?? []), ...facets.folders.map((x) => x.value)]);
  const folders = [...paths]
    .flatMap((path) =>
      path.split("/").map((_, i) =>
        path
          .split("/")
          .slice(0, i + 1)
          .join("/"),
      ),
    )
    .filter(Boolean);
  return {
    items: merged.slice(0, size),
    total,
    loading,
    error,
    more: () => setPage({ key, size: size + pageSize }),
    retry: () => {
      setRequest(null);
      setRetryEpoch((value) => value + 1);
      if (!representation) void loadCatalog();
    },
    options: {
      types: eligibleTypes.map((value) => ({ value, label: typeLabel(value) })),
      folders: [...new Set(folders)].sort().map((value) => ({ value, label: value })),
      tags: [...new Set([...(current?.facets.tags ?? []), ...facets.tags.map((x) => x.value)])].map((value) => ({
        value,
        label: value,
      })),
      states: [
        ...facets.states,
        ...(canSearchResources
          ? (current?.facets.readiness ?? []).map((value) => ({
              value,
              label: t(
                value === "ready"
                  ? "status.ready"
                  : value === "incomplete"
                    ? "workspace.resourceState.incomplete"
                    : "workspace.resourceState.empty",
              ),
            }))
          : []),
      ],
      media: facets.media,
    },
  };
}
