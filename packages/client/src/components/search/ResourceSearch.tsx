import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type ResourceSearchScope, useResourceSearch } from "../../features/search/useResourceSearch";
import { useI18n } from "../../i18n/I18nProvider";
import type { SearchType } from "../../lib/search";
import type { Mentionable } from "../editor/references";
import { CardViewIcon, CheckIcon, ListViewIcon } from "../icons";
import { Button } from "../ui/button";
import { SearchResultRow } from "../ui/search-result-row";
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
  allowLayout?: boolean;
  hideResultsWhenEmpty?: boolean;
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
    allowLayout = false,
    hideResultsWhenEmpty = false,
  },
  ref,
) {
  const [layout, setLayout] = useState<"list" | "cards">("list");
  const { t } = useI18n();
  const [local, setLocal] = useState<SearchBoxState<SearchType>>({ ...emptySearchBoxState, query: initialQuery });
  const state = controlled ?? local;
  const effective = externalQuery === undefined ? state : { ...state, query: externalQuery };
  const [rawActive, setActive] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const search = useResourceSearch(effective, scope, items, !hideResultsWhenEmpty || isSearchBoxActive(effective));
  const active = Math.min(rawActive, Math.max(search.items.length - 1, 0));
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
        (active + (event.key === "ArrowDown" ? 1 : -1) + Math.max(search.items.length, 1)) %
          Math.max(search.items.length, 1),
      );
      return true;
    }
    if (event.key === "Enter" && search.items[active] && !search.loading) {
      event.preventDefault();
      pick(search.items[active]);
      return true;
    }
    return false;
  };
  const keyHandler = useRef<((event: SearchKeyEvent) => boolean) | null>(null);
  useImperativeHandle(ref, () => ({ onKeyDown: (event) => keyHandler.current?.(event) ?? false }));
  useEffect(() => {
    const list = root.current?.querySelector<HTMLElement>(".shared-search-results");
    const row = list?.children[active] as HTMLElement | undefined;
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect(),
      rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) list.scrollTop += rowRect.top - listRect.top;
    else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
  }, [active]);
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
        placeholder={t("common.searchPlaceholder")}
        onResultsKey={handleKey}
        autoFocus={autoFocus}
        testId={testId}
      />
      {!(inline && facetHashPattern.test(effective.query)) &&
        (!hideResultsWhenEmpty || isSearchBoxActive(effective)) && (
          <>
            <div className="shared-search-toolbar">
              <button
                type="button"
                data-testid={`${testId}-browse-folders`}
                aria-expanded={browsing}
                onClick={() => setBrowsing(!browsing)}
              >
                {t("search.browseFolders")}
              </button>
              {allowLayout ? (
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid={`${testId}-layout-list`}
                    aria-label={t("common.layoutList")}
                    onClick={() => setLayout("list")}
                  >
                    <ListViewIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid={`${testId}-layout-cards`}
                    aria-label={t("common.layoutCards")}
                    onClick={() => setLayout("cards")}
                  >
                    <CardViewIcon />
                  </Button>
                </span>
              ) : null}
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
                <button type="button" data-testid={`${testId}-retry`} onClick={search.retry}>
                  {t("common.retry")}
                </button>
              </div>
            ) : null}
            {!search.loading && !search.error && !search.items.length ? (
              <p data-testid={`${testId}-empty`}>{t("workspace.noResults")}</p>
            ) : null}
            <div
              role="listbox"
              className={`shared-search-results${layout === "cards" ? " wsearch-grid" : ""}`}
              data-testid={`${testId}-results`}
              aria-busy={search.loading}
            >
              {search.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <SearchResultRow
                    key={`${item.kind}:${item.id}`}
                    role="option"
                    aria-selected={selectedIds.length ? selectedIds.includes(item.id) : active === index}
                    active={active === index}
                    card={layout === "cards"}
                    data-testid={`${testId}-result`}
                    data-reference-id={item.id}
                    data-resource-kind={item.resourceKind ?? item.kind}
                    disabled={search.loading}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onPick={() => pick(item)}
                    onKeyDown={handleKey}
                    glyph={
                      Icon ? (
                        <span className="workspace-glyph">
                          <Icon aria-hidden="true" />
                        </span>
                      ) : (
                        <KindGlyph kind={item.kind} />
                      )
                    }
                    title={item.label}
                    meta={[item.metaLabel, item.folderPath].filter(Boolean).join(" · ")}
                    badge={selectedIds.includes(item.id) ? <CheckIcon aria-hidden="true" /> : null}
                  />
                );
              })}
            </div>
            {search.items.length < search.total ? (
              <button type="button" disabled={search.loading} data-testid={`${testId}-more`} onClick={search.more}>
                {t("search.more")}
              </button>
            ) : null}
          </>
        )}
    </div>
  );
});
