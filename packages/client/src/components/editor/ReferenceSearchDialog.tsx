import type { ReferenceKind } from "@hall/templating";
import type { Editor } from "@tiptap/react";
import { type KeyboardEvent, type RefObject, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities, searchFacetTokens } from "../../lib/search";
import { FolderIcon } from "../icons";
import { type Mentionable, mentionableIcon } from "./references";

const kindOrder: readonly ReferenceKind[] = ["member", "resource", "councilBusiness", "meeting", "decision"];

/**
 * L'aide de recherche : les jetons que l'utilisateur doit taper, typographiés comme des
 * jetons — pas une phrase grise. Partagée entre le menu `@` et la recherche complète.
 */
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

/**
 * La recherche complète de références : le grand frère du menu `@`.
 *
 * Même moteur, même grammaire ; s'y ajoutent la liste entière, des filtres de catégorie
 * avec compteurs, et le rappel de la syntaxe. S'ouvre depuis la barre d'outils ou depuis
 * le pied du menu `@`, et insère la référence choisie là où l'on écrivait.
 */
export function ReferenceSearchDialog({
  initialQuery,
  mentionables,
  context,
  onPick,
  onClose,
}: {
  initialQuery: string;
  mentionables: Searchable[];
  context?: string;
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

  /* Une seule recherche non filtrée donne la liste ET les compteurs par catégorie. */
  const matches = useMemo(
    () => searchEntities(mentionables, query, { context }).results,
    [mentionables, query, context],
  );
  const counts = useMemo(() => {
    const byKind = new Map<ReferenceKind, number>();
    for (const item of matches) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    return byKind;
  }, [matches]);
  /* L'organisation qui fait sens est celle des dossiers : les pièces et sujets sont
     sectionnés par chemin ; ce qui n'a pas de dossier (membres, séances, délibérations)
     garde sa section d'espèce, après les dossiers. */
  const sections = useMemo(() => {
    const pool = kindFilter ? matches.filter((item) => item.kind === kindFilter) : matches;
    /* Les sections suivent l'ordre du classement (première apparition) : la proximité
       du dossier courant garde le dessus, l'alphabet ne reprend pas la main. */
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
      <DialogContent className="reference-search-dialog" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("editor.searchReferences")}</DialogTitle>
        </DialogHeader>
        <Input
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
            className={cn("reference-search-filter", kindFilter === null && "is-active")}
            onClick={() => setKindFilter(null)}
          >
            {t("editor.allTypes")} · {matches.length}
          </button>
          {kindOrder.map((kind) => (
            <button
              key={kind}
              type="button"
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
  /** La plage `@requête` à remplacer quand on vient du menu ; absente depuis la barre d'outils. */
  range?: { from: number; to: number };
}

/** Le pont entre un éditeur et la recherche complète : ouvre, insère au bon endroit, referme. */
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
        chain
          .insertContent([
            { type: "reference", attrs: { kind: item.kind, id: item.id, label: item.label } },
            { type: "text", text: " " },
          ])
          .run();
        onClose();
      }}
    />
  );
}
