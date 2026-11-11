import type { ResourceDetail } from "@hall/api-contract";
import type { GeographicResourceData, GeographicView } from "@hall/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CopyReferenceButton } from "../../components/CopyReferenceButton";
import { OpenIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { GeographicResourceMap } from "../../features/geographic/GeographicResourceMap";
import { councilBusinessHref } from "../../features/references/referenceNavigation";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useI18n } from "../../i18n/I18nProvider";
import type { ApiErrorCode } from "../../services/apiClient";
import { loadCommunePosition } from "../../services/hallSettingsApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { MapsPanel } from "./MapsPanel";
import { type MapSummary, mapPathSegments, readRecentMapIds, rememberRecentMap } from "./mapsSelector";
import {
  communeMapsView,
  formatMapsViewParameter,
  geographicViewFromMapsView,
  type MapsView,
  mapsViewFromGeographicView,
  mapsViewOnOpen,
  type PixelSize,
  parseMapsViewParameter,
} from "./mapsView";
import "./MapsPage.css";

type GeographicResource = Extract<ResourceDetail, { kind: "geographic" }>;

interface MapsSurface {
  /** Route resource identifier the surface belongs to; empty for the commune surface. */
  routeId: string;
  resource: GeographicResource;
  data: GeographicResourceData;
  /** Displayed view of the Cartes surface; the map's saved framing stays in `data.view`. */
  view: GeographicView;
  canUpdate: boolean;
}

const SEARCH_PAGE_SIZE = 100;
const DEFAULT_SURFACE_SIZE: PixelSize = { width: 1024, height: 768 };
const COMMUNE_SURFACE_ID = "00000000-0000-4000-8000-000000000000";

/** Lists every geographic resource through the workspace search relation. */
async function loadMapSummaries(): Promise<MapSummary[] | null> {
  const collected: MapSummary[] = [];
  for (let offset = 0; ; offset += SEARCH_PAGE_SIZE) {
    const result = await useWorkspaceResourcesStore.getState().hydrate({
      query: "",
      paths: [],
      kinds: ["geographic"],
      tags: [],
      readiness: [],
      media: [],
      limit: SEARCH_PAGE_SIZE,
      offset,
    });
    if (!result) return null;
    collected.push(...result.items.filter((item): item is MapSummary => item.kind === "geographic"));
    if (result.items.length === 0 || offset + SEARCH_PAGE_SIZE >= result.total) return collected;
  }
}

async function openMap(id: string): Promise<{ resource: GeographicResource; canUpdate: boolean } | null> {
  const opened = await useWorkspaceResourcesStore.getState().open(id);
  if (opened?.data.kind !== "geographic") return null;
  return { resource: opened.data, canUpdate: resourceCapabilities(opened.representation ?? null).updateContent };
}

/** Read-only surface shown when no map is chosen; it is never sent to the server. */
function communeSurface(view: MapsView): MapsSurface {
  const now = new Date(0).toISOString();
  const document: GeographicResourceData = {
    view: geographicViewFromMapsView(view),
    layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
    hallLayer: { type: "FeatureCollection", features: [] },
    provenance: {
      attribution: "IGN",
      license: "Licence Ouverte 2.0",
      metadataUrl: "https://geoservices.ign.fr/",
      configuredAt: now,
      sourceUpdatedAt: null,
    },
  };
  return {
    routeId: "",
    data: document,
    view: document.view,
    canUpdate: false,
    resource: {
      id: COMMUNE_SURFACE_ID,
      kind: "geographic",
      slug: "maps",
      path: "",
      name: "maps",
      fullPath: "maps",
      tags: [],
      state: { readiness: "empty", availability: null },
      createdAt: now,
      updatedAt: now,
      autosaveEnabled: false,
      document,
      version: 1,
      overlays: [],
    },
  };
}

function surfaceSize(element: HTMLElement | null): PixelSize {
  const rectangle = element?.getBoundingClientRect();
  return rectangle && rectangle.width > 0 && rectangle.height > 0
    ? { width: rectangle.width, height: rectangle.height }
    : DEFAULT_SURFACE_SIZE;
}

function workspaceResourceHref(resource: GeographicResource): string {
  const parameters = new URLSearchParams();
  if (resource.path) parameters.set("path", resource.path);
  parameters.set("resource", resource.id);
  return `/workspace?${parameters.toString()}`;
}

/**
 * Cartes entry: one map at a time, read-only, with a view that lives in the address and is never saved.
 * @implements-requirement HALL-FR-WSP-310
 * @implements-requirement HALL-FR-WSP-330
 * @implements-requirement HALL-FR-WSP-340 (also: the businesses of the opened map are found among the documents of
 * every business, loaded on demand)
 * @implements-requirement HALL-FR-WSP-360
 */
export function MapsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { resourceId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const viewParameter = searchParams.get("view");
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const currentViewRef = useRef<MapsView | null>(null);
  const writtenViewRef = useRef<string | null>(null);
  const routeIdRef = useRef(resourceId);
  routeIdRef.current = resourceId;
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [surface, setSurface] = useState<MapsSurface | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>(readRecentMapIds);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const loadCatalog = useWorkspaceResourcesStore((state) => state.loadCatalog);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    let active = true;
    void loadMapSummaries().then((summaries) => {
      if (!active) return;
      if (summaries) setMaps(summaries);
      else setError(useWorkspaceResourcesStore.getState().error ?? "request_failed");
    });
    return () => {
      active = false;
    };
  }, []);

  const writeView = useCallback(
    (routeId: string, view: MapsView) => {
      const formatted = formatMapsViewParameter(view);
      const key = `${routeId}|${formatted}`;
      currentViewRef.current = view;
      if (key === writtenViewRef.current) return;
      writtenViewRef.current = key;
      navigate({ search: `?view=${formatted}` }, { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (viewParameter !== null && `${resourceId}|${viewParameter}` === writtenViewRef.current) return;
    let active = true;
    const requested = parseMapsViewParameter(viewParameter);
    const size = surfaceSize(surfaceRef.current);
    void (async () => {
      if (resourceId) {
        const openedMap = await openMap(resourceId);
        if (!active) return;
        if (!openedMap) {
          setSurface(null);
          setError(useWorkspaceResourcesStore.getState().openErrors[resourceId] ?? "resource_not_found");
          return;
        }
        const { resource, canUpdate } = openedMap;
        const view =
          requested ?? mapsViewOnOpen({ current: currentViewRef.current, size, document: resource.document });
        setError(null);
        setSurface({
          routeId: resourceId,
          resource,
          data: resource.document,
          view: geographicViewFromMapsView(view),
          canUpdate,
        });
        setRecentIds(rememberRecentMap(resource.id));
        writeView(resourceId, view);
        return;
      }
      const view =
        requested ??
        communeMapsView({
          position: await loadCommunePosition().catch(() => null),
          documents: await (async () => {
            const summaries = (await loadMapSummaries()) ?? [];
            const opened = await Promise.all(summaries.map((summary) => openMap(summary.id)));
            return opened.flatMap((entry) => (entry ? [entry.resource.document] : []));
          })(),
          size,
        });
      if (!active) return;
      setError(null);
      setSurface(communeSurface(view));
      writeView("", view);
    })();
    return () => {
      active = false;
    };
  }, [resourceId, viewParameter, writeView]);

  const changeView = useCallback(
    (routeId: string, view: GeographicView) => {
      if (routeId !== routeIdRef.current) return;
      writeView(routeId, mapsViewFromGeographicView(view));
    },
    [writeView],
  );
  const surfaceRouteId = surface?.routeId ?? "";
  const onViewChange = useCallback(
    (view: GeographicView) => changeView(surfaceRouteId, view),
    [changeView, surfaceRouteId],
  );
  const openMapRoute = useCallback((id: string) => navigate(`/maps/${encodeURIComponent(id)}`), [navigate]);

  const opened = surface?.routeId ? surface.resource : null;
  const openedId = opened?.id ?? null;
  const businessIds = useMemo(() => businesses.map((business) => business.id).join(","), [businesses]);
  useEffect(() => {
    if (openedId && businessIds) void useCouncilBusinessStore.getState().loadResourceItems(businessIds.split(","));
  }, [openedId, businessIds]);
  const relatedBusinesses = useMemo(
    () =>
      opened ? businesses.filter((business) => business.resources.some((resource) => resource.id === opened.id)) : [],
    [businesses, opened],
  );

  return (
    <div className="maps-page" data-testid="maps-page" data-map-open={opened ? "true" : "false"}>
      <MapsPanel
        maps={maps}
        recentIds={recentIds}
        activeId={opened?.id ?? null}
        collapsed={panelCollapsed}
        onCollapsedChange={setPanelCollapsed}
        onOpen={openMapRoute}
      />
      <section className="maps-main" aria-label={t("navigation.maps")}>
        {opened ? (
          <header className="maps-context" data-testid="maps-context">
            <div className="maps-context-title-row">
              <h1 className="maps-context-title" data-testid="maps-context-title">
                {opened.name}
              </h1>
              <CopyReferenceButton
                size="icon"
                reference={{
                  name: opened.name,
                  path: opened.path || undefined,
                  page: `/app/maps/${opened.id}`,
                  href: `/api/resources/${opened.slug}`,
                }}
              />
              <Link className="maps-context-open" data-testid="maps-open-workspace" to={workspaceResourceHref(opened)}>
                <OpenIcon />
                {t("maps.openInWorkspace")}
              </Link>
            </div>
            <nav className="maps-context-path" aria-label={t("maps.folder")}>
              <Link data-testid="maps-context-folder" data-path="" to="/workspace">
                {t("navigation.workspace")}
              </Link>
              {mapPathSegments(opened.path).map((segment) => (
                <span key={segment.path} className="maps-context-segment">
                  <span aria-hidden="true">›</span>
                  <Link
                    data-testid="maps-context-folder"
                    data-path={segment.path}
                    to={`/workspace?path=${encodeURIComponent(segment.path)}`}
                  >
                    {segment.name}
                  </Link>
                </span>
              ))}
            </nav>
            <div className="maps-context-businesses">
              <span className="maps-context-label">{t("maps.businesses")}</span>
              {relatedBusinesses.length === 0 ? (
                <span className="maps-context-empty">{t("workspace.noRelatedCouncilBusiness")}</span>
              ) : (
                relatedBusinesses.map((business) => (
                  <Link
                    key={business.id}
                    className="workbench-business-chip"
                    data-testid="maps-context-business"
                    data-business-id={business.id}
                    to={councilBusinessHref(business)}
                  >
                    <CouncilBusinessGlyph business={business} />
                    {business.title}
                  </Link>
                ))
              )}
            </div>
          </header>
        ) : (
          <header className="maps-context" data-testid="maps-context-empty">
            <p className="maps-context-empty">{t("maps.noSelection")}</p>
          </header>
        )}
        <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
        <div className="maps-surface" data-testid="maps-surface" ref={surfaceRef}>
          {surface ? (
            <GeographicResourceMap
              key={`${surface.routeId}:${surface.resource.id}`}
              resource={surface.resource}
              data={surface.data}
              canUpdate={surface.canUpdate}
              autosaveEnabled={surface.canUpdate}
              onError={setError}
              onViewChange={onViewChange}
              initialView={surface.view}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
