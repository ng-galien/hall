import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { Mentionable } from "../editor/references";
import { ChevronDownIcon, FolderIcon, SortIcon } from "../icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ListRows } from "../ui/list-row";
import { SearchHit } from "./SearchHit";
import { type SearchSort, searchSorts } from "./searchSort";
import "./search-results-panel.css";

const sortLabelKeys = {
  relevance: "search.sortRelevance",
  name: "search.sortName",
  recent: "search.sortRecent",
  type: "search.sortType",
} as const satisfies Record<SearchSort, string>;

/** Full results screen of the workspace search: count, folder filter, sort, scrolling list. */
export function SearchResultsPanel({
  items,
  total,
  loading,
  error,
  onRetry,
  onMore,
  active,
  onActive,
  onPick,
  onKey,
  glyph,
  typeLabel,
  folders,
  folder,
  onFolder,
  sort,
  onSort,
  listRef,
  testId,
}: {
  items: Mentionable[];
  total: number;
  loading: boolean;
  error: boolean;
  onRetry(): void;
  onMore(): void;
  active: number;
  onActive(index: number): void;
  onPick(item: Mentionable): void;
  onKey(event: KeyboardEvent<HTMLElement>): void;
  glyph(item: Mentionable): ReactNode;
  typeLabel(item: Mentionable): string;
  folders: readonly string[];
  folder: string | null;
  onFolder(folder: string | null): void;
  sort: SearchSort;
  onSort(sort: SearchSort): void;
  listRef: RefObject<HTMLDivElement | null>;
  testId: string;
}) {
  const { t, plural, formatDate } = useI18n();
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = items.length < total;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, onMore]);
  return (
    <div className="search-results-panel" data-testid={`${testId}-panel-results`}>
      <div className="search-results-bar">
        <span className="search-results-count" data-testid={`${testId}-count`} data-count={total} aria-live="polite">
          {plural(total, "search.resultsOne", "search.resultsOther")}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="search-results-control"
              data-testid={`${testId}-browse-folders`}
              data-active={folder ? "true" : undefined}
            >
              <FolderIcon aria-hidden="true" />
              <span className="search-results-control-label">{folder ?? t("search.folderFilterAll")}</span>
              <ChevronDownIcon aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="search-results-folders">
            <DropdownMenuRadioGroup value={folder ?? ""} onValueChange={(value) => onFolder(value || null)}>
              <DropdownMenuRadioItem value="">{t("search.folderFilterAll")}</DropdownMenuRadioItem>
              {folders.length ? <DropdownMenuSeparator /> : null}
              {folders.map((path) => (
                <DropdownMenuRadioItem
                  key={path}
                  value={path}
                  data-testid={`search-folder-${path}`}
                  style={{
                    paddingInlineStart: `calc(var(--hall-space-6) + ${path.split("/").length - 1} * var(--hall-space-3))`,
                  }}
                >
                  {path.split("/").at(-1)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="search-results-bar-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="search-results-control" data-testid={`${testId}-sort`}>
                <SortIcon aria-hidden="true" />
                <span className="search-results-control-label">
                  {t("search.sort")} : {t(sortLabelKeys[sort])}
                </span>
                <ChevronDownIcon aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSort(value as SearchSort)}>
                {searchSorts.map((value) => (
                  <DropdownMenuRadioItem key={value} value={value} data-testid={`${testId}-sort-${value}`}>
                    {t(sortLabelKeys[value])}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <div className="search-results-scroll" ref={listRef}>
        {error ? (
          <div className="search-results-message" role="alert" data-testid={`${testId}-error`}>
            <p>{t("common.requestFailed")}</p>
            <button type="button" data-testid={`${testId}-retry`} onClick={onRetry}>
              {t("common.retry")}
            </button>
          </div>
        ) : null}
        {!loading && !error && !items.length ? (
          <p className="search-results-message" data-testid={`${testId}-empty`}>
            {t("workspace.noResults")}
          </p>
        ) : null}
        <ListRows role="listbox" className="search-results-list" data-testid={`${testId}-results`} aria-busy={loading}>
          {items.map((item, index) => (
            <SearchHit
              key={`${item.kind}:${item.id}`}
              testId={`${testId}-result`}
              referenceId={item.id}
              resourceKind={item.resourceKind ?? item.kind}
              ariaSelected={active === index}
              active={active === index}
              onActive={() => onActive(index)}
              onPick={() => onPick(item)}
              onKey={onKey}
              glyph={glyph(item)}
              title={item.label}
              meta={[typeLabel(item), item.folderPath].filter(Boolean).join(" · ")}
              wide={item.updatedAt ? <span>{formatDate(item.updatedAt)}</span> : undefined}
            />
          ))}
        </ListRows>
        {hasMore ? <div ref={sentinel} className="search-results-sentinel" aria-hidden="true" /> : null}
        {loading ? (
          <p className="search-results-message" role="status" data-testid={`${testId}-loading`}>
            {t("common.loading")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
