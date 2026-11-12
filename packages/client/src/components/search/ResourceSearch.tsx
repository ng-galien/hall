import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { referenceKindNatures, ToneGlyph } from "../../features/documents/ResourceGlyph";
import { type ResourceSearchScope, useResourceSearch } from "../../features/search/useResourceSearch";
import { useI18n } from "../../i18n/I18nProvider";
import type { SearchType } from "../../lib/search";
import type { Mentionable } from "../editor/references";
import { Button } from "../ui/button";
import { ListRowIcon, ListRows } from "../ui/list-row";
import { FolderSectionsList } from "./FolderSectionsList";
import { facetHashPattern } from "./facetSuggestions";
import { folderSections } from "./folderSections";
import { KindGlyph } from "./kindPresentation";
import {
  emptySearchBoxState,
  isSearchBoxActive,
  SearchBox,
  type SearchBoxState,
  type SearchKeyEvent,
} from "./SearchBox";
import { SearchHit } from "./SearchHit";
import { SearchResultsPanel } from "./SearchResultsPanel";
import { type SearchSort, sortSearchItems } from "./searchSort";
import "./resource-search.css";

export interface ResourceSearchHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}
export interface ResourceSearchProps {
  scope?: ResourceSearchScope;
  items?: readonly Mentionable[];
  initialQuery?: string;
  externalQuery?: string;
  onQueryChange?(query: string): void;
  state?: SearchBoxState<SearchType>;
  onState?(state: SearchBoxState<SearchType>): void;
  onPick(item: Mentionable): void;
  onClose?(): void;
  testId?: string;
  autoFocus?: boolean;
  inline?: boolean;
  selectedIds?: readonly string[];
  hideResultsWhenEmpty?: boolean;
  /** Adapts the presentation of each result row for the calling picker. */
  presentItem?(item: Mentionable): Mentionable;
  /** Element that receives the full results screen, with count, folder filter and sort. */
  resultsTarget?: HTMLElement | null;
  /** Text of the empty field, which says where one searches. */
  placeholder?: string;
}
// @implements-requirement HALL-FR-SRC-030
export const ResourceSearch = forwardRef<ResourceSearchHandle, ResourceSearchProps>(function ResourceSearch(
  {
    scope,
    items,
    initialQuery = "",
    externalQuery,
    onQueryChange,
    state: controlled,
    onState,
    onPick,
    onClose,
    testId = "resource-search",
    autoFocus = true,
    inline = false,
    selectedIds = [],
    hideResultsWhenEmpty = false,
    presentItem,
    resultsTarget,
    placeholder,
  },
  ref,
) {
  const [sort, setSort] = useState<SearchSort>("relevance");
  const resultsList = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [local, setLocal] = useState<SearchBoxState<SearchType>>({ ...emptySearchBoxState, query: initialQuery });
  const state = controlled ?? local;
  const effective = externalQuery === undefined ? state : { ...state, query: externalQuery };
  const [rawActive, setActive] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const search = useResourceSearch(effective, scope, items, !hideResultsWhenEmpty || isSearchBoxActive(effective));
  const presentedItems = presentItem ? search.items.map(presentItem) : search.items;
  const typeLabel = (item: Mentionable) =>
    item.metaLabel ?? (item.kind === "councilBusiness" ? t("editor.kind.councilBusiness") : "");
  const shownItems = resultsTarget ? sortSearchItems(presentedItems, sort, typeLabel) : presentedItems;
  const searchMore = search.more;
  const needsEveryResult = Boolean(resultsTarget) && sort !== "relevance" && search.items.length < search.total;
  useEffect(() => {
    if (needsEveryResult && !search.loading) searchMore();
  }, [needsEveryResult, search.loading, searchMore]);
  const active = Math.min(rawActive, Math.max(shownItems.length - 1, 0));
  const change = (next: SearchBoxState<SearchType>) => {
    setActive(0);
    setLocal(next);
    onState?.(next);
    if (next.query !== effective.query) onQueryChange?.(next.query);
  };
  const pick = (item: Mentionable) => {
    onPick(item);
  };
  const handleKey = (event: { key: string; preventDefault(): void; stopPropagation(): void }) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (active + (event.key === "ArrowDown" ? 1 : -1) + Math.max(shownItems.length, 1)) %
          Math.max(shownItems.length, 1),
      );
      return true;
    }
    if (event.key === "Enter" && shownItems[active] && !search.loading) {
      event.preventDefault();
      pick(shownItems[active]);
      return true;
    }
    return false;
  };
  const keyHandler = useRef<((event: SearchKeyEvent) => boolean) | null>(null);
  useImperativeHandle(ref, () => ({ onKeyDown: (event) => keyHandler.current?.(event) ?? false }));
  useEffect(() => {
    const list = resultsList.current ?? root.current?.querySelector<HTMLElement>(".shared-search-results");
    const container = resultsList.current?.querySelector<HTMLElement>("[role='listbox']") ?? list;
    const row = container?.children[active] as HTMLElement | undefined;
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect(),
      rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) list.scrollTop += rowRect.top - listRect.top;
    else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
  }, [active]);
  const glyph = (item: Mentionable) => {
    if (item.kind === "resource" && item.tone) return <ToneGlyph tone={item.tone} />;
    if (item.kind === "resource" || item.kind === "councilBusiness") return <KindGlyph kind={item.kind} />;
    const Icon = item.icon;
    return Icon ? (
      <ListRowIcon nature={referenceKindNatures[item.kind]}>
        <Icon aria-hidden="true" />
      </ListRowIcon>
    ) : (
      <KindGlyph kind={item.kind} />
    );
  };
  const folderNodes = folderSections(
    search.options.folders.map((folder) => ({ kind: "resource", folderPath: folder.value })),
    () => "",
  );
  return (
    <div className="shared-resource-search" data-testid={`${testId}-panel`} ref={root}>
      <SearchBox
        inline={inline}
        keyHandler={keyHandler}
        state={effective}
        onState={change}
        typeOptions={search.options.types}
        folderOptions={search.options.folders}
        tagOptions={search.options.tags}
        stateOptions={search.options.states}
        mediaOptions={search.options.media}
        placeholder={placeholder ?? t("common.searchPlaceholder")}
        onResultsKey={handleKey}
        autoFocus={autoFocus}
        testId={testId}
      />
      {resultsTarget && isSearchBoxActive(effective)
        ? createPortal(
            <SearchResultsPanel
              items={shownItems}
              total={search.total}
              loading={search.loading}
              error={search.error}
              onRetry={search.retry}
              onMore={searchMore}
              active={active}
              onActive={setActive}
              onPick={pick}
              onKey={handleKey}
              glyph={glyph}
              typeLabel={typeLabel}
              folders={search.options.folders.map((option) => option.value)}
              folder={effective.folders[0] ?? null}
              onFolder={(folder) => change({ ...effective, folders: folder ? [folder] : [] })}
              sort={sort}
              onSort={setSort}
              listRef={resultsList}
              testId={testId}
            />,
            resultsTarget,
          )
        : null}
      {!resultsTarget &&
        !(inline && facetHashPattern.test(effective.query)) &&
        (!hideResultsWhenEmpty || isSearchBoxActive(effective)) && (
          <>
            <div className="shared-search-toolbar">
              <Button
                variant="plain"
                data-testid={`${testId}-browse-folders`}
                aria-expanded={browsing}
                onClick={() => setBrowsing(!browsing)}
              >
                {t("search.browseFolders")}
              </Button>
              <span data-testid={`${testId}-count`}>{search.total}</span>
            </div>
            {browsing ? (
              <div className="shared-search-folders">
                <FolderSectionsList
                  sections={folderNodes}
                  itemKey={(item) => item.folderPath}
                  renderItem={() => null}
                  onFolderSelect={(path) => {
                    change({ ...effective, folders: [path] });
                    setBrowsing(false);
                  }}
                />
              </div>
            ) : null}
            {search.loading ? (
              <p role="status" data-testid={`${testId}-loading`}>
                {t("common.loading")}
              </p>
            ) : null}
            {search.error ? (
              <div role="alert" data-testid={`${testId}-error`}>
                <p>{t("common.requestFailed")}</p>
                <Button variant="secondary" data-testid={`${testId}-retry`} onClick={search.retry}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}
            {!search.loading && !search.error && !shownItems.length ? (
              <p data-testid={`${testId}-empty`}>{t("workspace.noResults")}</p>
            ) : null}
            <ListRows
              role="listbox"
              className="shared-search-results"
              data-testid={`${testId}-results`}
              aria-busy={search.loading}
            >
              {shownItems.map((item, index) => (
                <SearchHit
                  key={`${item.kind}:${item.id}`}
                  testId={`${testId}-result`}
                  referenceId={item.id}
                  resourceKind={item.resourceKind ?? item.kind}
                  ariaSelected={selectedIds.length ? selectedIds.includes(item.id) : active === index}
                  active={active === index}
                  selected={selectedIds.includes(item.id)}
                  disabled={search.loading}
                  onActive={() => setActive(index)}
                  onPick={() => pick(item)}
                  onKey={handleKey}
                  glyph={glyph(item)}
                  title={item.label}
                  meta={[item.metaLabel, item.folderPath].filter(Boolean).join(" · ")}
                />
              ))}
            </ListRows>
            {shownItems.length < search.total ? (
              <Button
                variant="secondary"
                disabled={search.loading}
                data-testid={`${testId}-more`}
                onClick={search.more}
              >
                {t("search.more")}
              </Button>
            ) : null}
          </>
        )}
    </div>
  );
});
