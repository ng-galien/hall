import { imageWidthRange, type ReferenceKind, referenceKinds } from "@hall/templating";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { type KeyboardEvent, useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities } from "../../lib/search";
import { FolderSectionsList } from "../search/FolderSectionsList";
import { folderSections, sectionItems } from "../search/folderSections";
import { emptySearchBoxState, SearchBox, type SearchBoxState, type SearchTypeOption } from "../search/SearchBox";
import { insertResourceImage } from "./images";
import { type Mentionable, mentionableIcon } from "./references";

/** Full reference search: the unified search box, kind counts, and results along the folder tree. */
export function ReferenceSearchDialog({
  initialQuery,
  mentionables,
  context,
  allowedKinds = referenceKinds,
  title,
  testId = "reference-search-dialog",
  onPick,
  onClose,
}: {
  initialQuery: string;
  mentionables: Searchable[];
  context?: string;
  allowedKinds?: readonly ReferenceKind[];
  title?: string;
  testId?: string;
  onPick(item: Searchable): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<SearchBoxState>({ ...emptySearchBoxState, query: initialQuery });
  const [preview, setPreview] = useState<SearchBoxState | null>(null);
  const [rawActive, setActive] = useState(0);

  const groupLabels: Record<ReferenceKind, string> = useMemo(
    () => ({
      member: t("editor.group.member"),
      resource: t("editor.group.resource"),
      councilBusiness: t("editor.group.councilBusiness"),
      meeting: t("editor.group.meeting"),
      decision: t("editor.group.decision"),
    }),
    [t],
  );

  const effective = preview ?? state;
  const pool = useMemo(
    () => mentionables.filter((item) => allowedKinds.includes(item.kind)),
    [mentionables, allowedKinds],
  );
  const base = useMemo(
    () => searchEntities(pool, effective.query, { context, folders: effective.folders, tags: effective.tags }).results,
    [pool, effective.query, effective.folders, effective.tags, context],
  );
  const matches = useMemo(
    () => (effective.types.length > 0 ? base.filter((item) => effective.types.includes(item.kind)) : base),
    [base, effective.types],
  );
  const counts = useMemo(() => {
    const byKind = new Map<ReferenceKind, number>();
    for (const item of base) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    return byKind;
  }, [base]);

  const typeOptions = useMemo<SearchTypeOption[]>(
    () =>
      referenceKinds
        .filter((kind) => allowedKinds.includes(kind))
        .map((kind) => ({ value: kind, label: groupLabels[kind], count: counts.get(kind) ?? 0 })),
    [allowedKinds, groupLabels, counts],
  );
  const folderOptions = useMemo(() => {
    const folderCounts = new Map<string, number>();
    for (const item of pool) {
      if (!item.folderPath) continue;
      const segments = item.folderPath.split("/");
      for (let index = 1; index <= segments.length; index += 1) {
        const prefix = segments.slice(0, index).join("/");
        folderCounts.set(prefix, (folderCounts.get(prefix) ?? 0) + 1);
      }
    }
    return [...folderCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
      .map(([value, count]) => ({ value, count }));
  }, [pool]);
  const tagOptions = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const item of pool) {
      for (const tag of item.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    return [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
      .map(([value, count]) => ({ value, count }));
  }, [pool]);

  const sections = useMemo(
    () => folderSections(matches, (kind) => groupLabels[kind as ReferenceKind]),
    [matches, groupLabels],
  );
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

  const toggleType = (kind: ReferenceKind) => {
    const types = state.types.includes(kind)
      ? state.types.filter((candidate) => candidate !== kind)
      : [...state.types, kind];
    setState({ ...state, types });
  };

  const onPreview = useCallback((next: SearchBoxState | null) => setPreview(next), []);

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
          typeOptions={typeOptions}
          folderOptions={folderOptions}
          tagOptions={tagOptions}
          placeholder={t("common.searchPlaceholder")}
          onPreview={onPreview}
          onResultsKey={onResultsKey}
          autoFocus
          testId="reference-search"
        />
        <div className="reference-search-filters">
          {typeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              data-testid={`reference-kind-${option.value}`}
              className={cn("reference-search-filter", state.types.includes(option.value) && "is-active")}
              onClick={() => toggleType(option.value as ReferenceKind)}
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
              const Icon = mentionableIcon(item as Mentionable);
              const metaLabel = (item as Mentionable).metaLabel;
              return (
                <button
                  type="button"
                  data-testid="reference-result"
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
  mentionables: RefObject<Searchable[]>;
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
