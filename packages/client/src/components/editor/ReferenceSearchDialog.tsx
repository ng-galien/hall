import { imageWidthRange, type ReferenceKind } from "@hall/templating";
import type { Editor } from "@tiptap/react";
import { type KeyboardEvent, type RefObject, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities, searchFacetTokens } from "../../lib/search";
import { FolderIcon } from "../icons";
import { insertResourceImage } from "./images";
import { type Mentionable, mentionableIcon } from "./references";

const kindOrder: readonly ReferenceKind[] = ["member", "resource", "councilBusiness", "meeting", "decision"];

/** Search syntax hint shared by the `@` menu and the full search. */
export function SearchSyntaxHint() {
  const { locale, t } = useI18n();
  return (
    <div className="search-syntax-hint">
      <span className="search-syntax-label">{t("editor.hintLabel")}</span>
      <kbd>{t("editor.hintFreeText")}</kbd>
      <span>{t("editor.hintOr")}</span>
      {searchFacetTokens[locale === "fr" ? "fr" : "en"].map((token) => (
        <kbd key={token}>{token}</kbd>
      ))}
    </div>
  );
}

/** Full reference search: whole list, kind filters with counts, and the syntax hint. */
export function ReferenceSearchDialog({
  initialQuery,
  mentionables,
  context,
  allowedKinds = kindOrder,
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
  const [query, setQuery] = useState(initialQuery);
  const [kindFilter, setKindFilter] = useState<ReferenceKind | null>(null);
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

  const matches = useMemo(
    () => searchEntities(mentionables, query, { context }).results.filter((item) => allowedKinds.includes(item.kind)),
    [allowedKinds, mentionables, query, context],
  );
  const counts = useMemo(() => {
    const byKind = new Map<ReferenceKind, number>();
    for (const item of matches) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    return byKind;
  }, [matches]);
  const sections = useMemo(() => {
    const pool = kindFilter ? matches.filter((item) => item.kind === kindFilter) : matches;
    const ordered = new Map<string, { key: string; title: string; folder: boolean; items: Searchable[] }>();
    for (const item of pool) {
      const key = item.folderPath ? `folder:${item.folderPath}` : `kind:${item.kind}`;
      let section = ordered.get(key);
      if (!section) {
        section = {
          key,
          title: item.folderPath || groupLabels[item.kind],
          folder: Boolean(item.folderPath),
          items: [],
        };
        ordered.set(key, section);
      }
      section.items.push(item);
    }
    return [...ordered.values()];
  }, [matches, kindFilter, groupLabels]);
  const shown = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const active = Math.min(rawActive, Math.max(shown.length - 1, 0));

  const onKeyDown = (event: KeyboardEvent) => {
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid={testId} className="reference-search-dialog" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{title ?? t("editor.searchReferences")}</DialogTitle>
        </DialogHeader>
        <Input
          data-testid="reference-search-input"
          type="search"
          value={query}
          placeholder={t("common.searchPlaceholder")}
          aria-label={t("common.search")}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="reference-search-filters">
          <button
            type="button"
            data-testid="reference-kind-all"
            className={cn("reference-search-filter", kindFilter === null && "is-active")}
            onClick={() => setKindFilter(null)}
          >
            {t("editor.allTypes")} · {matches.length}
          </button>
          {kindOrder
            .filter((kind) => allowedKinds.includes(kind))
            .map((kind) => (
              <button
                key={kind}
                type="button"
                data-testid={`reference-kind-${kind}`}
                className={cn("reference-search-filter", kindFilter === kind && "is-active")}
                onClick={() => setKindFilter(kindFilter === kind ? null : kind)}
              >
                {groupLabels[kind]} · {counts.get(kind) ?? 0}
              </button>
            ))}
        </div>
        <div className="reference-search-results" role="listbox">
          {(() => {
            let index = -1;
            return sections.map((section) => (
              <div key={section.key}>
                <div className={cn("mention-suggestion-group", section.folder && "reference-search-folder")}>
                  {section.folder ? <FolderIcon aria-hidden="true" /> : null}
                  {section.title}
                </div>
                {section.items.map((item) => {
                  index += 1;
                  const rowIndex = index;
                  const Icon = mentionableIcon(item);
                  const metaLabel = (item as Mentionable).metaLabel;
                  return (
                    <button
                      key={`${item.kind}:${item.id}`}
                      type="button"
                      data-testid="reference-result"
                      role="option"
                      aria-selected={rowIndex === active}
                      className={cn("mention-suggestion-item", rowIndex === active && "is-active")}
                      onClick={() => onPick(item)}
                    >
                      <Icon aria-hidden="true" /> {item.label}
                      {metaLabel ? <span className="reference-search-path">{metaLabel}</span> : null}
                    </button>
                  );
                })}
              </div>
            ));
          })()}
        </div>
        <SearchSyntaxHint />
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
