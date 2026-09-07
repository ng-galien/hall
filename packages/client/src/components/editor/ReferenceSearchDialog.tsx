import { type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";
import { imageWidthRange } from "@hall/templating";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { searchEntities } from "../../lib/search";
import { FolderSectionsList } from "../search/FolderSectionsList";
import { facetOptionsFrom } from "../search/facetSuggestions";
import { folderSections, sectionItems } from "../search/folderSections";
import { emptySearchBoxState, SearchBox, type SearchBoxState } from "../search/SearchBox";
import { insertResourceImage } from "./images";
import { referenceKindPresentations } from "./referenceKindPresentation";
import { type Mentionable, mentionableFacetValueLabels, mentionableIcon } from "./references";

/** Full reference search: the unified search box, kind counts, and results along the folder tree. */
export function ReferenceSearchDialog({
  initialQuery,
  mentionables,
  context,
  allowedKinds = referenceEntityKinds,
  title,
  testId = "reference-search-dialog",
  onQueryChange,
  onPick,
  onClose,
}: {
  initialQuery: string;
  mentionables: Mentionable[];
  context?: string;
  allowedKinds?: readonly ReferenceEntityKind[];
  title?: string;
  testId?: string;
  onQueryChange?(query: string): void;
  onPick(item: Mentionable): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<SearchBoxState<ReferenceEntityKind>>({
    ...emptySearchBoxState,
    query: initialQuery,
  });
  const [preview, setPreview] = useState<SearchBoxState<ReferenceEntityKind> | null>(null);
  const [rawActive, setActive] = useState(0);

  useEffect(() => {
    if (!onQueryChange) return;
    const timeout = window.setTimeout(() => onQueryChange(state.query), 200);
    return () => window.clearTimeout(timeout);
  }, [onQueryChange, state.query]);

  const groupLabel = useCallback((kind: ReferenceEntityKind) => t(referenceKindPresentations[kind].groupLabelKey), [t]);

  const effective = preview ?? state;
  const pool = useMemo(
    () => mentionables.filter((item) => allowedKinds.includes(item.kind)),
    [mentionables, allowedKinds],
  );
  const matches = useMemo(
    () =>
      searchEntities(pool, effective.query, {
        context,
        kinds: effective.types,
        folders: effective.folders,
        tags: effective.tags,
        states: effective.states,
        media: effective.media,
      }).results,
    [pool, effective, context],
  );
  const facetOptions = useMemo(
    () => facetOptionsFrom(pool, groupLabel, allowedKinds, mentionableFacetValueLabels(pool)),
    [pool, groupLabel, allowedKinds],
  );

  const sections = useMemo(() => folderSections(matches, groupLabel), [matches, groupLabel]);
  const shown = useMemo(() => sectionItems(sections), [sections]);
  const active = Math.min(rawActive, Math.max(shown.length - 1, 0));

  const onResultsKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((active + 1) % Math.max(shown.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((active - 1 + Math.max(shown.length, 1)) % Math.max(shown.length, 1));
    } else if (event.key === "Enter" && shown[active]) {
      event.preventDefault();
      onPick(shown[active]);
    }
  };

  const toggleType = (kind: ReferenceEntityKind) => {
    const types = state.types.includes(kind)
      ? state.types.filter((candidate) => candidate !== kind)
      : [...state.types, kind];
    setState({ ...state, types });
  };

  const onPreview = useCallback((next: SearchBoxState<ReferenceEntityKind> | null) => setPreview(next), []);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid={testId} className="reference-search-dialog" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{title ?? t("editor.searchReferences")}</DialogTitle>
        </DialogHeader>
        <SearchBox
          state={state}
          onState={(next) => {
            setState(next);
            setActive(0);
          }}
          typeOptions={facetOptions.types}
          folderOptions={facetOptions.folders}
          tagOptions={facetOptions.tags}
          stateOptions={facetOptions.states}
          mediaOptions={facetOptions.media}
          placeholder={t("common.searchPlaceholder")}
          onPreview={onPreview}
          onResultsKey={onResultsKey}
          autoFocus
          testId="reference-search"
        />
        <div className="reference-search-filters">
          {facetOptions.types.map((option) => (
            <button
              key={option.value}
              type="button"
              data-testid={`reference-kind-${option.value}`}
              className={cn("reference-search-filter", state.types.includes(option.value) && "is-active")}
              onClick={() => toggleType(option.value)}
            >
              {option.label} · {option.count}
            </button>
          ))}
        </div>
        <div className="reference-search-results" role="listbox">
          <FolderSectionsList
            sections={sections}
            itemKey={(item) => `${item.kind}:${item.id}`}
            renderItem={(item, index) => {
              const Icon = mentionableIcon(item);
              const metaLabel = item.metaLabel;
              return (
                <button
                  type="button"
                  data-testid="reference-result"
                  data-reference-id={item.id}
                  role="option"
                  aria-selected={index === active}
                  className="workspace-explorer-row"
                  data-active={index === active || undefined}
                  onClick={() => onPick(item)}
                >
                  <Icon aria-hidden="true" />
                  <span className="workspace-explorer-copy">
                    <strong>{item.label}</strong>
                    {metaLabel ? <span>{metaLabel}</span> : null}
                  </span>
                </button>
              );
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface FullSearchRequest {
  query: string;
  /** The `@` query range to replace when opened from the mention menu. */
  range?: { from: number; to: number };
}

/** Bridges an editor to the full search: opens it, inserts at the caret, closes. */
export function EditorReferenceSearch({
  editor,
  request,
  mentionables,
  context,
  onClose,
}: {
  editor: Editor;
  request: FullSearchRequest;
  mentionables: RefObject<Mentionable[]>;
  context: RefObject<string | undefined>;
  onClose(): void;
}) {
  return (
    <ReferenceSearchDialog
      initialQuery={request.query}
      mentionables={mentionables.current}
      context={context.current}
      onClose={onClose}
      onPick={(item) => {
        const chain = editor.chain().focus();
        if (request.range) chain.deleteRange(request.range);
        if (item.media === "image") {
          if (request.range) chain.run();
          insertResourceImage(editor, {
            id: item.id,
            alt: item.label,
            align: "left",
            width: imageWidthRange.default,
          });
        } else {
          chain
            .insertContent([
              { type: "reference", attrs: { kind: item.kind, id: item.id, label: item.label } },
              { type: "text", text: " " },
            ])
            .run();
        }
        onClose();
      }}
    />
  );
}
