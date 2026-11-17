import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { CouncilBusinessIcon, FolderIcon } from "../../components/icons";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { SearchInput } from "../../components/ui/search-input";
import { DocumentaryResourceGlyph } from "../../features/documents/DocumentaryResourceGlyph";
import { useI18n } from "../../i18n/I18nProvider";
import { useBackLayer } from "../../lib/backLayers";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { folderColorIconProps } from "../workspace/folderColor";
import { folderColorsByPath } from "../workspace/paths";
import { type MapEntry, type MapSummary, mapEntries, mapPathSegments, matchingMapEntries } from "./mapsSelector";

/** Second line of a map: its businesses, or the path of its folder when it has none. */
function MapPlace({ entry, folderColor }: { entry: MapEntry; folderColor: string | null }) {
  const { t } = useI18n();
  if (entry.businesses.length)
    return (
      <span className="maps-finder-place" data-place="business" data-nature="council">
        <CouncilBusinessIcon aria-hidden="true" />
        <span className="maps-finder-place-text">{entry.businesses.map((business) => business.title).join(", ")}</span>
      </span>
    );
  const segments = mapPathSegments(entry.map.path).map((segment) => segment.name);
  return (
    <span className="maps-finder-place" data-place="folder" data-nature="folder">
      <FolderIcon aria-hidden="true" {...folderColorIconProps(folderColor)} />
      <span className="maps-finder-place-text">
        {segments.length ? segments.join(" › ") : t("navigation.workspace")}
      </span>
    </span>
  );
}

/**
 * Field « Rechercher une carte » laid on the map, and the list of every map that opens over the map under it: one line
 * per map in alphabetical order, its businesses or its folder under its name, reduced as the person types. The field
 * keeps the focus and the arrow keys; Enter, a click or a tap opens the map; Escape, a click outside and the back command
 * close the list without changing the map.
 * @implements-requirement HALL-FR-WSP-320
 * @implements-requirement HALL-FR-WSP-480
 */
export function MapsFinder({
  maps,
  activeId,
  onOpen,
  claimFocus,
}: {
  maps: readonly MapSummary[] | null;
  activeId: string | null;
  /** Opens the map; `byKeyboard` is true when it was chosen with Enter. */
  onOpen(id: string, byKeyboard: boolean): void;
  /** Asked when the field appears: true when it takes the focus back after a map chosen with the keyboard. */
  claimFocus?(): boolean;
}) {
  const { t } = useI18n();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const catalog = useWorkspaceResourcesStore((state) => state.catalog);
  const entries = useMemo(() => mapEntries(maps ?? [], businesses), [maps, businesses]);
  const found = useMemo(() => matchingMapEntries(entries, query), [entries, query]);
  const folderColors = useMemo(() => folderColorsByPath(catalog), [catalog]);
  const optionId = (index: number) => `${listId}-option-${index}`;
  const listed = open && maps !== null && found.length > 0;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const show = () => {
    if (open) return;
    const current = activeId ? entries.findIndex((entry) => entry.map.id === activeId) : -1;
    setHighlighted(Math.max(current, 0));
    setOpen(true);
  };
  const choose = (entry: MapEntry | undefined, byKeyboard: boolean) => {
    if (!entry) return;
    close();
    if (entry.map.id !== activeId) onOpen(entry.map.id, byKeyboard);
  };

  useBackLayer(open, close);

  useEffect(() => {
    if (claimFocus?.()) inputRef.current?.focus({ preventScroll: true });
  }, [claimFocus]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [open, close]);

  useEffect(() => {
    if (!listed) return;
    document.getElementById(optionId(highlighted))?.scrollIntoView({ block: "nearest" });
  });

  return (
    <div ref={rootRef} className="maps-finder" data-testid="maps-finder" data-open={open ? "true" : "false"}>
      <SearchInput
        ref={inputRef}
        data-testid="maps-search"
        role="combobox"
        aria-label={t("maps.search")}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={listed && found[highlighted] ? optionId(highlighted) : undefined}
        placeholder={t("maps.search")}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        value={query}
        onClick={show}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) close();
        }}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) show();
            else setHighlighted((index) => Math.min(index + 1, Math.max(found.length - 1, 0)));
          } else if (event.key === "ArrowUp" && open) {
            event.preventDefault();
            setHighlighted((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && listed) {
            event.preventDefault();
            choose(found[highlighted], true);
          }
        }}
      />
      {open ? (
        <div className="maps-finder-popup" data-testid="maps-list">
          {maps === null ? (
            <LoadingIndicator size="zone" label={t("common.loading")} />
          ) : found.length === 0 ? (
            <p className="maps-finder-empty" role="status" data-testid="maps-list-empty">
              {entries.length === 0 ? t("maps.empty") : t("maps.searchEmpty")}
            </p>
          ) : (
            <ListRows id={listId} role="listbox" aria-label={t("maps.list")} className="maps-finder-list">
              {found.map((entry, index) => (
                <ListRow
                  key={entry.map.id}
                  role="none"
                  data-resource-id={entry.map.id}
                  data-highlighted={index === highlighted ? "true" : undefined}
                  selected={entry.map.id === activeId}
                  onOpen={() => choose(entry, false)}
                  openTestId="maps-entry"
                  openProps={{
                    id: optionId(index),
                    role: "option",
                    tabIndex: -1,
                    "aria-selected": index === highlighted,
                    "aria-current": entry.map.id === activeId ? "page" : undefined,
                    onMouseDown: (event) => event.preventDefault(),
                    onPointerMove: () => setHighlighted(index),
                  }}
                  head={<DocumentaryResourceGlyph resource={entry.map} />}
                  title={entry.map.name}
                  detail={<MapPlace entry={entry} folderColor={folderColors.get(entry.map.path) ?? null} />}
                />
              ))}
            </ListRows>
          )}
        </div>
      ) : null}
    </div>
  );
}
