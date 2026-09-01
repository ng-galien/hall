import { matchDiscriminated } from "@hall/domain";
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { normalizeForSearch, type SearchableMedia, type SearchableState } from "../../lib/search";
import { CloseIcon, FolderIcon, SearchIcon, TagIcon } from "../icons";
import { type FacetSuggestion, facetHashPattern, facetSuggestionsFor } from "./facetSuggestions";

/* The unified search field: facet chips inside the field, and `#` to add one. Typing `#`
   completes the best matching criterion inline, as selected ghost text inside the input;
   the arrow keys cycle the candidates, Tab or Enter turns the current one into a chip.
   The candidate previews live in the results. Every search surface uses this component. */

export interface SearchBoxState<TKind extends string = string> {
  query: string;
  types: TKind[];
  folders: string[];
  tags: string[];
  states: SearchableState[];
  media: SearchableMedia[];
}

export const emptySearchBoxState: SearchBoxState<never> = {
  query: "",
  types: [],
  folders: [],
  tags: [],
  states: [],
  media: [],
};

export function isSearchBoxActive(state: SearchBoxState): boolean {
  return (
    state.query.trim().length > 0 ||
    state.types.length > 0 ||
    state.folders.length > 0 ||
    state.tags.length > 0 ||
    state.states.length > 0 ||
    state.media.length > 0
  );
}

export interface SearchTypeOption<TKind extends string = string> {
  value: TKind;
  label: string;
  count?: number;
}

export interface SearchFolderOption {
  value: string;
  count?: number;
}

function toggle<TValue extends string>(values: TValue[], value: TValue): TValue[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

/** The state with one facet applied and its `#fragment` removed from the query. */
function applied<TKind extends string>(
  state: SearchBoxState<TKind>,
  suggestion: FacetSuggestion<TKind>,
): SearchBoxState<TKind> {
  const query = state.query.replace(facetHashPattern, "").trimEnd();
  return matchDiscriminated(suggestion, "facet", {
    type: (facet) => ({ ...state, types: toggle(state.types, facet.value), query }),
    tag: (facet) => ({ ...state, tags: toggle(state.tags, facet.value), query }),
    folder: (facet) => ({ ...state, folders: toggle(state.folders, facet.value), query }),
    state: (facet) => ({ ...state, states: toggle(state.states, facet.value), query }),
    media: (facet) => ({ ...state, media: toggle(state.media, facet.value), query }),
  });
}

export function SearchBox<TKind extends string>({
  state,
  onState,
  typeOptions,
  folderOptions,
  tagOptions = [],
  stateOptions = [],
  mediaOptions = [],
  placeholder,
  onPreview,
  onResultsKey,
  trailing,
  autoFocus = false,
  testId,
}: {
  state: SearchBoxState<TKind>;
  onState(next: SearchBoxState<TKind>): void;
  typeOptions: SearchTypeOption<TKind>[];
  folderOptions: SearchFolderOption[];
  tagOptions?: SearchFolderOption[];
  stateOptions?: SearchTypeOption<SearchableState>[];
  mediaOptions?: SearchTypeOption<SearchableMedia>[];
  placeholder: string;
  /** Receives the state the current candidate would produce, and null when none is completing. */
  onPreview?(preview: SearchBoxState<TKind> | null): void;
  /** Receives arrow and enter keys while no candidate is completing, to walk the results. */
  onResultsKey?(event: KeyboardEvent): void;
  trailing?: ReactNode;
  autoFocus?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement | null>(null);
  const [rawActive, setRawActive] = useState(0);
  const [ghostEnabled, setGhostEnabled] = useState(true);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const hashMatch = facetHashPattern.exec(state.query);
  const fragment = hashMatch?.[1] ?? "";

  const candidates = useMemo<FacetSuggestion<TKind>[]>(() => {
    if (!hashMatch) return [];
    const needle = normalizeForSearch(fragment);
    return facetSuggestionsFor(fragment, {
      types: typeOptions.filter((option) => !state.types.includes(option.value)),
      folders: folderOptions
        .filter((option) => !state.folders.includes(option.value))
        .map((option) => ({ ...option, label: option.value })),
      tags: tagOptions
        .filter((option) => !state.tags.includes(option.value))
        .map((option) => ({ ...option, label: option.value })),
      states: stateOptions.filter((option) => !state.states.includes(option.value)),
      media: mediaOptions.filter((option) => !state.media.includes(option.value)),
    }).filter((suggestion) => normalizeForSearch(suggestion.label).startsWith(needle));
  }, [
    hashMatch,
    fragment,
    state.types,
    state.folders,
    state.tags,
    state.states,
    state.media,
    typeOptions,
    folderOptions,
    tagOptions,
    stateOptions,
    mediaOptions,
  ]);

  const active = Math.min(rawActive, Math.max(candidates.length - 1, 0));
  const candidate = ghostEnabled ? candidates[active] : undefined;
  const ghost = candidate ? candidate.label.slice(fragment.length) : "";
  const displayValue = state.query + ghost;

  const settingSelection = useRef(false);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element || !ghost) return;
    if (document.activeElement === element) {
      settingSelection.current = true;
      element.setSelectionRange(state.query.length, displayValue.length);
      settingSelection.current = false;
    }
  }, [ghost, state.query.length, displayValue.length]);

  useEffect(() => {
    if (!onPreview) return;
    onPreview(candidate ? applied(state, candidate) : null);
  }, [candidate, state, onPreview]);

  const chips: Array<
    | { kind: "type"; value: TKind; label: string }
    | { kind: "folder"; value: string; label: string }
    | { kind: "tag"; value: string; label: string }
    | { kind: "state"; value: SearchableState; label: string }
    | { kind: "media"; value: SearchableMedia; label: string }
  > = [
    ...state.types.map((value) => ({
      kind: "type" as const,
      value,
      label: typeOptions.find((option) => option.value === value)?.label ?? value,
    })),
    ...state.folders.map((value) => ({ kind: "folder" as const, value, label: value })),
    ...state.tags.map((value) => ({ kind: "tag" as const, value, label: value })),
    ...state.states.map((value) => ({
      kind: "state" as const,
      value,
      label: stateOptions.find((option) => option.value === value)?.label ?? value,
    })),
    ...state.media.map((value) => ({
      kind: "media" as const,
      value,
      label: mediaOptions.find((option) => option.value === value)?.label ?? value,
    })),
  ];

  const removeChip = (chip: (typeof chips)[number]) => {
    matchDiscriminated(chip, "kind", {
      type: (entry) => onState({ ...state, types: toggle(state.types, entry.value) }),
      folder: (entry) => onState({ ...state, folders: toggle(state.folders, entry.value) }),
      tag: (entry) => onState({ ...state, tags: toggle(state.tags, entry.value) }),
      state: (entry) => onState({ ...state, states: toggle(state.states, entry.value) }),
      media: (entry) => onState({ ...state, media: toggle(state.media, entry.value) }),
    });
    input.current?.focus();
  };

  const apply = (suggestion: FacetSuggestion<TKind>) => {
    onState(applied(state, suggestion));
    setRawActive(0);
    setGhostEnabled(true);
    onPreview?.(null);
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (hashMatch && candidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setGhostEnabled(true);
        setRawActive((active + 1) % candidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setGhostEnabled(true);
        setRawActive((active - 1 + candidates.length) % candidates.length);
        return;
      }
      if ((event.key === "Tab" || event.key === "Enter") && candidate) {
        event.preventDefault();
        apply(candidate);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setGhostEnabled(false);
        onPreview?.(null);
        return;
      }
      if (event.key === "Backspace" && ghost) {
        event.preventDefault();
        setGhostEnabled(false);
        return;
      }
    } else {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        onResultsKey?.(event);
        return;
      }
      if (event.key === "Escape") {
        onState(emptySearchBoxState);
        onPreview?.(null);
        return;
      }
    }
    if (event.key === "Backspace" && state.query === "" && chips.length > 0) {
      removeChip(chips[chips.length - 1]);
    }
  };

  return (
    <div className="searchbox" data-testid={testId}>
      <div className="wsearch-field searchbox-field">
        <SearchIcon aria-hidden="true" className="app-icon wsearch-icon" />
        {chips.map((chip) => (
          <span className="wsearch-chip" key={`${chip.kind}:${chip.value}`}>
            {chip.kind === "folder" ? <FolderIcon aria-hidden="true" /> : null}
            {chip.kind === "tag" ? <TagIcon aria-hidden="true" /> : null}
            {chip.label}
            <button type="button" aria-label={`${t("common.cancel")} ${chip.label}`} onClick={() => removeChip(chip)}>
              <CloseIcon />
            </button>
          </span>
        ))}
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={Boolean(ghost)}
          aria-autocomplete="inline"
          data-testid={testId ? `${testId}-input` : undefined}
          value={displayValue}
          placeholder={chips.length > 0 ? "" : placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
            setGhostEnabled(inputType.startsWith("insert"));
            setRawActive(0);
            onState({ ...state, query: event.target.value });
          }}
          onSelect={(event) => {
            if (settingSelection.current || !ghost) return;
            const element = event.currentTarget;
            if (element.selectionStart === element.selectionEnd) setGhostEnabled(false);
          }}
          onBlur={() => {
            setGhostEnabled(true);
            onPreview?.(null);
          }}
          onKeyDown={onKeyDown}
        />
        {candidate ? (
          <span className="searchbox-completion" aria-live="polite">
            {candidate.facet === "folder" ? <FolderIcon aria-hidden="true" /> : null}
            {candidate.facet === "tag" ? <TagIcon aria-hidden="true" /> : null}
            {t(
              matchDiscriminated(candidate, "facet", {
                folder: () => "workspace.facetFolder" as const,
                tag: () => "search.facetTag" as const,
                type: () => "workspace.facetType" as const,
                state: () => "workspace.facetState" as const,
                media: () => "search.facetMedia" as const,
              }),
            )}
            {candidates.length > 1 ? ` ${active + 1}/${candidates.length}` : ""}
            <kbd>Tab</kbd>
          </span>
        ) : null}
        {state.query === "" && !candidate ? (
          <kbd className="searchbox-hash-hint" title={t("search.hashHint")}>
            #
          </kbd>
        ) : null}
        {isSearchBoxActive(state) ? (
          <button
            className="wsearch-clear"
            type="button"
            aria-label={t("workspace.clearSearch")}
            onClick={() => {
              onState(emptySearchBoxState);
              onPreview?.(null);
              input.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}
