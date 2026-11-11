import { matchDiscriminated } from "@hall/domain";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { normalizeForSearch, type SearchableMedia, type SearchableState } from "../../lib/search";
import { CloseIcon, FilterIcon, SearchIcon } from "../icons";
import { Button } from "../ui/button";
import { Disclosure } from "../ui/disclosure";
import { Input } from "../ui/input";
import { type FacetSuggestion, facetHashPattern, facetSuggestionsFor } from "./facetSuggestions";

export interface SearchKeyEvent {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
}
export interface SearchBoxState<
  K extends string = string,
  S extends string = SearchableState,
  M extends string = SearchableMedia,
> {
  query: string;
  types: K[];
  folders: string[];
  tags: string[];
  states: S[];
  media: M[];
}
export const emptySearchBoxState: SearchBoxState<never, never, never> = {
  query: "",
  types: [],
  folders: [],
  tags: [],
  states: [],
  media: [],
};
export function isSearchBoxActive<K extends string, S extends string, M extends string>(
  state: SearchBoxState<K, S, M>,
): boolean {
  return (
    !!state.query.trim() ||
    [state.types, state.folders, state.tags, state.states, state.media].some((values) => values.length > 0)
  );
}
export interface SearchTypeOption<K extends string = string> {
  value: K;
  label: string;
  count?: number;
}
export interface SearchFolderOption {
  value: string;
  count?: number;
}
export function applySearchFacet<K extends string, S extends string, M extends string>(
  state: SearchBoxState<K, S, M>,
  facet: FacetSuggestion<K, S, M>,
  remove = false,
): SearchBoxState<K, S, M> {
  const next = { ...state, query: remove ? state.query : state.query.replace(facetHashPattern, "").trimEnd() };
  const update = <V extends string>(values: V[], value: V) =>
    remove ? values.filter((entry) => entry !== value) : [...new Set([...values, value])];
  return matchDiscriminated(facet, "facet", {
    type: (f) => ({ ...next, types: update(state.types, f.value) }),
    folder: (f) => ({ ...next, folders: update(state.folders, f.value) }),
    tag: (f) => ({ ...next, tags: update(state.tags, f.value) }),
    state: (f) => ({ ...next, states: update(state.states, f.value) }),
    media: (f) => ({ ...next, media: update(state.media, f.value) }),
  });
}

// @implements-requirement HALL-FR-SRC-030
export function SearchBox<K extends string, S extends string = SearchableState, M extends string = SearchableMedia>({
  state,
  onState,
  typeOptions,
  folderOptions,
  tagOptions = [],
  stateOptions = [],
  mediaOptions = [],
  placeholder,
  onResultsKey,
  trailing,
  autoFocus = false,
  testId = "resource-search",
  onPreview: _onPreview,
  keyHandler,
  inline = false,
}: {
  inline?: boolean;
  state: SearchBoxState<K, S, M>;
  onState(next: SearchBoxState<K, S, M>): void;
  typeOptions: SearchTypeOption<K>[];
  folderOptions: SearchFolderOption[];
  tagOptions?: SearchFolderOption[];
  stateOptions?: SearchTypeOption<S>[];
  mediaOptions?: SearchTypeOption<M>[];
  placeholder: string;
  onPreview?(preview: SearchBoxState<K, S, M> | null): void;
  onResultsKey?(event: SearchKeyEvent): boolean | undefined;
  keyHandler?: { current: ((event: SearchKeyEvent) => boolean) | null };
  trailing?: ReactNode;
  autoFocus?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const [browse, setBrowse] = useState(false);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<FacetSuggestion["facet"] | "" | null>(null);
  const [editing, setEditing] = useState<FacetSuggestion<K, S, M> | null>(null);
  const hash = facetHashPattern.exec(state.query);
  const showing = browse || !!hash;
  const labels = {
    type: t("workspace.facetType"),
    folder: t("workspace.facetFolder"),
    tag: t("search.facetTag"),
    state: t("workspace.facetState"),
    media: t("search.facetMedia"),
  };
  const options = {
    types: typeOptions,
    folders: folderOptions.map((x) => ({ ...x, label: x.value })),
    tags: tagOptions.map((x) => ({ ...x, label: x.value })),
    states: stateOptions,
    media: mediaOptions,
  };
  const facets: FacetSuggestion<K, S, M>[] = [
    ...state.types.map((value) => ({
      facet: "type" as const,
      value,
      label: typeOptions.find((x) => x.value === value)?.label ?? value,
    })),
    ...state.folders.map((value) => ({ facet: "folder" as const, value, label: value })),
    ...state.tags.map((value) => ({ facet: "tag" as const, value, label: value })),
    ...state.states.map((value) => ({
      facet: "state" as const,
      value,
      label: stateOptions.find((x) => x.value === value)?.label ?? value,
    })),
    ...state.media.map((value) => ({
      facet: "media" as const,
      value,
      label: mediaOptions.find((x) => x.value === value)?.label ?? value,
    })),
  ];
  const categoryKinds = ["type", "folder", "tag", "state", "media"] as const;
  const fragment = hash?.[1] ?? "";
  const admissible = facetSuggestionsFor("", options).filter(
    (f) => !facets.some((x) => x.facet === f.facet && x.value === f.value) && (!editing || f.facet === editing.facet),
  );
  const matching = facetSuggestionsFor(fragment, options);
  const categories = categoryKinds
    .map((category) => ({
      category,
      values: admissible.filter(
        (f) =>
          f.facet === category &&
          (!fragment ||
            normalizeForSearch(labels[category]).includes(normalizeForSearch(fragment)) ||
            matching.some((m) => m.facet === f.facet && m.value === f.value)),
      ),
    }))
    .filter((group) => group.values.length);
  const opened = editing?.facet ?? expanded ?? (fragment && categories.length === 1 ? categories[0].category : null);
  type Entry =
    | { kind: "category"; category: FacetSuggestion["facet"] }
    | { kind: "value"; value: FacetSuggestion<K, S, M> };
  const visible: Entry[] = categories.flatMap((group) => [
    ...(inline && group.category === "type" ? [] : [{ kind: "category" as const, category: group.category }]),
    ...(opened === group.category || (inline && group.category === "type")
      ? group.values.map((value) => ({ kind: "value" as const, value }))
      : []),
  ]);
  const index = Math.min(active, Math.max(0, visible.length - 1));
  const activeId = visible[index]
    ? matchDiscriminated(visible[index], "kind", {
        category: (entry) => `${testId}-filter-category-${entry.category}`,
        value: (entry) => `${testId}-filter-${entry.value.facet}-${entry.value.value}`,
      })
    : undefined;
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = overlay.current;
    if (!showing || !list) return;
    let distance = 0;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      distance += event.deltaY;
      if (Math.abs(distance) < 24) return;
      const direction = Math.sign(distance);
      distance = 0;
      setActive((current) => Math.max(0, Math.min(visible.length - 1, current + direction)));
    };
    list.addEventListener("wheel", wheel, { passive: false });
    return () => list.removeEventListener("wheel", wheel);
  }, [showing, visible.length]);
  const choose = (facet: FacetSuggestion<K, S, M>) => {
    onState(applySearchFacet(editing ? applySearchFacet(state, editing, true) : state, facet));
    setBrowse(false);
    setEditing(null);
    setExpanded(null);
    setActive(0);
    input.current?.focus();
  };
  const close = () => {
    setBrowse(false);
    setEditing(null);
    if (hash) onState({ ...state, query: state.query.replace(facetHashPattern, "") });
    input.current?.focus();
  };
  const onKeyDown = (event: SearchKeyEvent) => {
    if (showing) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return true;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(
          (index + (event.key === "ArrowDown" ? 1 : -1) + Math.max(visible.length, 1)) % Math.max(visible.length, 1),
        );
        return true;
      }
      const entry = visible[index];
      if (entry && (event.key === "Enter" || event.key === "ArrowRight")) {
        event.preventDefault();
        matchDiscriminated(entry, "kind", {
          category: (row) => setExpanded(opened === row.category ? "" : row.category),
          value: (row) => {
            if (event.key === "Enter") choose(row.value);
          },
        });
        return true;
      }
      if (event.key === "ArrowLeft" && opened) {
        event.preventDefault();
        setActive(visible.findIndex((row) => row.kind === "category" && row.category === opened));
        setExpanded(null);
        setEditing(null);
        return true;
      }
    }
    if (event.key === "Backspace" && !state.query && facets.length)
      onState(applySearchFacet(state, facets[facets.length - 1], true));
    return onResultsKey?.(event) ?? false;
  };
  useEffect(() => {
    if (keyHandler) keyHandler.current = onKeyDown;
    return () => {
      if (keyHandler) keyHandler.current = null;
    };
  });
  return (
    <div className="searchbox" data-testid={testId}>
      <div className="wsearch-field searchbox-field" hidden={inline && showing}>
        <SearchIcon className="app-icon wsearch-icon" />
        {facets.map((f) => (
          <span className="wsearch-chip" key={`${f.facet}:${f.value}`}>
            <Button
              variant="secondary"
              data-testid={`${testId}-edit-${f.facet}-${f.value}`}
              onClick={() => {
                setEditing(f);
                setExpanded(f.facet);
                setBrowse(true);
                setActive(0);
              }}
            >
              {labels[f.facet]} : {f.label}
            </Button>
            <Button
              variant="plain"
              size="icon"
              data-testid={`${testId}-remove-${f.facet}-${f.value}`}
              aria-label={`${t("common.delete")} ${f.label}`}
              onClick={() => {
                onState(applySearchFacet(state, f, true));
                input.current?.focus();
              }}
            >
              <CloseIcon />
            </Button>
          </span>
        ))}
        <Input
          ref={input}
          data-testid={`${testId}-input`}
          value={state.query}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? `${testId}-filters` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showing ? activeId : undefined}
          onChange={(e) => {
            setActive(0);
            onState({ ...state, query: e.target.value });
          }}
          onKeyDown={onKeyDown}
        />
        <Button
          variant="plain"
          data-testid={`${testId}-add-filter`}
          aria-expanded={showing}
          onClick={() => {
            setBrowse(!showing);
            setEditing(null);
            setExpanded(null);
            setActive(0);
            if (hash) close();
          }}
        >
          <FilterIcon />
          <span className="shared-search-filter-label">{t("search.addFilter")}</span>
        </Button>
        {isSearchBoxActive(state) ? (
          <Button
            variant="plain"
            size="icon"
            data-testid={`${testId}-clear`}
            aria-label={t("workspace.clearSearch")}
            onClick={() => {
              onState(emptySearchBoxState);
              setBrowse(false);
              input.current?.focus();
            }}
          >
            <CloseIcon />
          </Button>
        ) : null}
        {trailing}
      </div>
      {showing && inline ? (
        <div className="shared-search-filter-overlay" data-testid={`${testId}-filters`}>
          <div className="shared-search-filter-wheel" ref={overlay} role="tree" aria-label={t("search.addFilter")}>
            {visible.map((entry, rowIndex) =>
              matchDiscriminated(entry, "kind", {
                category: (row) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the search field drives the rows with the arrow keys through aria-activedescendant.
                  <div
                    role="treeitem"
                    tabIndex={-1}
                    key={row.category}
                    id={`${testId}-filter-category-${row.category}`}
                    data-testid={`${testId}-filter-category-${row.category}`}
                    data-active={index === rowIndex}
                    aria-selected={index === rowIndex}
                    aria-expanded={opened === row.category}
                    className="shared-search-wheel-row shared-search-wheel-category"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setExpanded(opened === row.category ? "" : row.category);
                      setActive(rowIndex);
                    }}
                  >
                    <span>{labels[row.category]}</span>
                    <span aria-hidden="true">{opened === row.category ? "−" : "+"}</span>
                  </div>
                ),
                value: (row) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the search field drives the rows with the arrow keys through aria-activedescendant.
                  <div
                    role="treeitem"
                    tabIndex={-1}
                    key={`${row.value.facet}:${row.value.value}`}
                    id={`${testId}-filter-${row.value.facet}-${row.value.value}`}
                    data-testid={`${testId}-filter-${row.value.facet}-${row.value.value}`}
                    data-active={index === rowIndex}
                    aria-selected={index === rowIndex}
                    className="shared-search-wheel-row shared-search-wheel-value"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(row.value)}
                  >
                    <span>{row.value.label}</span>
                  </div>
                ),
              }),
            )}
            {!visible.length ? <p>{t("workspace.noResults")}</p> : null}
          </div>
        </div>
      ) : showing ? (
        <fieldset id={`${testId}-filters`} className="shared-search-filters" data-testid={`${testId}-filters`}>
          {categories.map((group) => (
            <Disclosure
              key={group.category}
              testId={`${testId}-category-${group.category}`}
              toggleTestId={`${testId}-filter-category-${group.category}`}
              contentTestId={`${testId}-category-values-${group.category}`}
              open={opened === group.category}
              active={visible[index]?.kind === "category" && visible[index].category === group.category}
              onOpenChange={(open) => {
                setEditing(null);
                setExpanded(open ? group.category : "");
                setActive(visible.findIndex((entry) => entry.kind === "category" && entry.category === group.category));
              }}
              title={
                <span className="shared-search-category-title">
                  {labels[group.category]}
                  <span>{group.values.length}</span>
                </span>
              }
            >
              <div role="listbox" aria-label={labels[group.category]}>
                {group.values.map((f) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the search field drives the options with the arrow keys through aria-activedescendant.
                  <div
                    key={`${f.facet}:${f.value}`}
                    role="option"
                    tabIndex={-1}
                    id={`${testId}-filter-${f.facet}-${f.value}`}
                    data-testid={`${testId}-filter-${f.facet}-${f.value}`}
                    aria-selected={activeId === `${testId}-filter-${f.facet}-${f.value}`}
                    className={`searchbox-suggestion${activeId === `${testId}-filter-${f.facet}-${f.value}` ? " is-active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() =>
                      setActive(
                        visible.findIndex(
                          (entry) =>
                            entry.kind === "value" && entry.value.facet === f.facet && entry.value.value === f.value,
                        ),
                      )
                    }
                    onClick={() => choose(f)}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </Disclosure>
          ))}
          {!categories.length ? <p>{t("workspace.noResults")}</p> : null}
          <Button variant="secondary" data-testid={`${testId}-filters-close`} onClick={close}>
            {t("common.close")}
          </Button>
        </fieldset>
      ) : null}
    </div>
  );
}
