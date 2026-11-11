import { useMemo, useState } from "react";
import { CollapseIcon, ExpandIcon } from "../../components/icons";
import { matchesQuery } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ExplorerTree, ExplorerTreeBranch } from "../../components/ui/explorer-tree";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { SearchInput } from "../../components/ui/search-input";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { DocumentaryResourceGlyph } from "../../features/documents/DocumentaryResourceGlyph";
import { FolderGlyph } from "../../features/documents/FolderGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { buildPathTree } from "../workspace/paths";
import { type MapSummary, type MapsTreeNode, mapsByBusiness, mapsTree, rootMaps } from "./mapsSelector";

type PanelMode = "tree" | "business";

function MapRow({ map, active, onOpen }: { map: MapSummary; active: boolean; onOpen(id: string): void }) {
  return (
    <ListRow
      data-resource-id={map.id}
      onOpen={() => onOpen(map.id)}
      openTestId="maps-entry"
      openProps={{ "aria-current": active ? "page" : undefined }}
      selected={active}
      head={<DocumentaryResourceGlyph resource={map} />}
      title={map.name}
      detail={map.path ? map.path.split("/").join(" › ") : undefined}
    />
  );
}

function MapLeaf({
  map,
  activeId,
  testId,
  onOpen,
}: {
  map: MapSummary;
  activeId: string | null;
  testId: string;
  onOpen(id: string): void;
}) {
  return (
    <ExplorerTreeBranch
      title={
        <span
          className={`maps-tree-map${map.id === activeId ? " maps-tree-map-active" : ""}`}
          data-testid="maps-tree-map"
          data-resource-id={map.id}
          aria-current={map.id === activeId ? "page" : undefined}
        >
          {map.name}
        </span>
      }
      testId={testId}
      icon={<DocumentaryResourceGlyph resource={map} />}
      expandable={false}
      onActivate={() => onOpen(map.id)}
    >
      {null}
    </ExplorerTreeBranch>
  );
}

function FolderBranch({
  node,
  activeId,
  onOpen,
}: {
  node: MapsTreeNode;
  activeId: string | null;
  onOpen(id: string): void;
}) {
  return (
    <ExplorerTreeBranch
      title={node.name}
      testId={`maps-tree-folder-${encodeURIComponent(node.path)}`}
      defaultOpen
      icon={node.business ? <CouncilBusinessGlyph business={node.business} /> : <FolderGlyph />}
      meta={<span className="maps-tree-count">{node.mapCount}</span>}
    >
      {node.children.map((child) => (
        <FolderBranch key={child.path} node={child} activeId={activeId} onOpen={onOpen} />
      ))}
      {node.maps.map((map) => (
        <MapLeaf key={map.id} map={map} activeId={activeId} testId={`maps-tree-map-${map.id}`} onOpen={onOpen} />
      ))}
    </ExplorerTreeBranch>
  );
}

/**
 * Collapsible map selector of the Cartes surface: search, recent maps, reduced workspace tree, list by business.
 * @implements-requirement HALL-FR-WSP-320
 */
export function MapsPanel({
  maps,
  recentIds,
  activeId,
  collapsed,
  onCollapsedChange,
  onOpen,
}: {
  maps: readonly MapSummary[] | null;
  recentIds: readonly string[];
  activeId: string | null;
  collapsed: boolean;
  onCollapsedChange(collapsed: boolean): void;
  onOpen(id: string): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PanelMode>("tree");
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const catalog = useWorkspaceResourcesStore((state) => state.catalog);
  const allMaps = useMemo(() => maps ?? [], [maps]);
  const tree = useMemo(() => mapsTree(buildPathTree(businesses, catalog), allMaps), [allMaps, businesses, catalog]);
  const atRoot = useMemo(() => rootMaps(allMaps), [allMaps]);
  const groups = useMemo(() => mapsByBusiness(businesses, allMaps), [allMaps, businesses]);
  const recent = recentIds
    .map((id) => allMaps.find((map) => map.id === id))
    .filter((map): map is MapSummary => map !== undefined);
  const found = query.trim() ? allMaps.filter((map) => matchesQuery(query, map.name, map.path)) : null;

  if (collapsed) {
    return (
      <aside className="maps-panel maps-panel-collapsed" data-testid="maps-panel" aria-label={t("maps.panel")}>
        <Button
          variant="plain"
          size="icon"
          type="button"
          data-testid="maps-panel-toggle"
          aria-expanded={false}
          aria-label={t("maps.expandPanel")}
          title={t("maps.expandPanel")}
          onClick={() => onCollapsedChange(false)}
        >
          <ExpandIcon />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="maps-panel" data-testid="maps-panel" aria-label={t("maps.panel")}>
      <div className="maps-panel-header">
        <Button
          variant="plain"
          size="icon"
          type="button"
          data-testid="maps-panel-toggle"
          aria-expanded
          aria-label={t("maps.collapsePanel")}
          title={t("maps.collapsePanel")}
          onClick={() => onCollapsedChange(true)}
        >
          <CollapseIcon />
        </Button>
      </div>
      <SearchInput
        data-testid="maps-search"
        value={query}
        placeholder={t("maps.search")}
        aria-label={t("maps.search")}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="maps-panel-body">
        {maps === null ? (
          <p className="maps-panel-empty">{t("common.loading")}</p>
        ) : found ? (
          <section data-testid="maps-search-results">
            {found.length === 0 ? (
              <p className="maps-panel-empty">{t("maps.searchEmpty")}</p>
            ) : (
              <ListRows>
                {found.map((map) => (
                  <MapRow key={map.id} map={map} active={map.id === activeId} onOpen={onOpen} />
                ))}
              </ListRows>
            )}
          </section>
        ) : (
          <>
            <section className="maps-panel-section" data-testid="maps-recent">
              <h3 className="maps-panel-section-title">{t("maps.recent")}</h3>
              {recent.length === 0 ? (
                <p className="maps-panel-empty">{t("maps.recentEmpty")}</p>
              ) : (
                <ListRows>
                  {recent.map((map) => (
                    <MapRow key={map.id} map={map} active={map.id === activeId} onOpen={onOpen} />
                  ))}
                </ListRows>
              )}
            </section>
            <section className="maps-panel-section">
              <fieldset className="maps-mode-switch">
                <legend className="sr-only">{t("maps.listMode")}</legend>
                <Button
                  variant="secondary"
                  type="button"
                  data-testid="maps-mode-tree"
                  aria-pressed={mode === "tree"}
                  onClick={() => setMode("tree")}
                >
                  {t("maps.byFolder")}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  data-testid="maps-mode-business"
                  aria-pressed={mode === "business"}
                  onClick={() => setMode("business")}
                >
                  {t("maps.byBusiness")}
                </Button>
              </fieldset>
              {allMaps.length === 0 ? (
                <p className="maps-panel-empty">{t("maps.empty")}</p>
              ) : mode === "tree" ? (
                <ExplorerTree className="maps-tree" data-testid="maps-tree">
                  {tree.map((node) => (
                    <FolderBranch key={node.path} node={node} activeId={activeId} onOpen={onOpen} />
                  ))}
                  {atRoot.map((map) => (
                    <MapLeaf
                      key={map.id}
                      map={map}
                      activeId={activeId}
                      testId={`maps-tree-map-${map.id}`}
                      onOpen={onOpen}
                    />
                  ))}
                </ExplorerTree>
              ) : groups.length === 0 ? (
                <p className="maps-panel-empty">{t("maps.noBusinessMaps")}</p>
              ) : (
                <ExplorerTree className="maps-tree" data-testid="maps-businesses">
                  {groups.map(({ business, maps: businessMaps }) => (
                    <ExplorerTreeBranch
                      key={business.id}
                      title={business.title}
                      testId={`maps-business-${business.id}`}
                      defaultOpen
                      icon={<CouncilBusinessGlyph business={business} />}
                    >
                      {businessMaps.map((map) => (
                        <MapLeaf
                          key={map.id}
                          map={map}
                          activeId={activeId}
                          testId={`maps-business-${business.id}-map-${map.id}`}
                          onOpen={onOpen}
                        />
                      ))}
                    </ExplorerTreeBranch>
                  ))}
                </ExplorerTree>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
