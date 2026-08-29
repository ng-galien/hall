import { isReferenceKind, type ReferenceKind } from "@hall/templating";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, type ReactNode, useImperativeHandle, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities } from "../../lib/search";
import { CalendarIcon, FileIcon, GavelIcon, MemberIcon, SearchIcon, TextDocumentIcon } from "../icons";
import { type ResourceTone, toneIcons } from "../ResourceGlyph";
import { ResourcePreview } from "../ResourcePreview";

/**
 * Les références métier du contrat `@hall/templating`, dans l'éditeur.
 *
 * Une référence est un atome insécable : `:member[Jean Dupont]{#uuid}` dans le markdown,
 * une puce dans le texte. Le nœud est unique pour les cinq espèces — c'est la grammaire
 * partagée qui fait foi, pas une liste locale.
 */

export const referenceIcons: Record<ReferenceKind, typeof MemberIcon> = {
  member: MemberIcon,
  resource: FileIcon,
  topic: TextDocumentIcon,
  decision: GavelIcon,
  meeting: CalendarIcon,
};

/**
 * La puce d'une référence — la même dans l'éditeur et dans le rendu, c'est le même document.
 * Sobre : pas d'icône dans le texte ; le survol dit ce qu'elle est, le clic ouvre une pièce.
 */
export function ReferenceBadge({
  kind,
  id,
  children,
}: {
  kind: ReferenceKind;
  id: string | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [previewing, setPreviewing] = useState(false);
  const kindLabels: Record<ReferenceKind, string> = {
    member: t("editor.kind.member"),
    resource: t("editor.kind.resource"),
    topic: t("editor.kind.topic"),
    meeting: t("editor.kind.meeting"),
    decision: t("editor.kind.decision"),
  };
  const openable = kind === "resource" && id !== null;
  const className = `editor-reference editor-reference-${kind}`;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {openable ? (
            <button type="button" className={`${className} is-openable`} onClick={() => setPreviewing(true)}>
              {children}
            </button>
          ) : (
            <span className={className}>{children}</span>
          )}
        </TooltipTrigger>
        <TooltipContent>
          {kindLabels[kind]}
          {openable ? ` · ${t("editor.openHint")}` : null}
        </TooltipContent>
      </Tooltip>
      {previewing && id !== null ? <ResourcePreview slug={id} onClose={() => setPreviewing(false)} /> : null}
    </>
  );
}

function ReferenceChip({ node }: NodeViewProps) {
  const kind = node.attrs.kind as ReferenceKind;
  return (
    <NodeViewWrapper as="span" className="editor-reference-wrapper">
      <ReferenceBadge kind={kind} id={node.attrs.id as string | null}>
        {node.attrs.label as string}
      </ReferenceBadge>
    </NodeViewWrapper>
  );
}

export const Reference = Node.create({
  name: "reference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: "member" },
      id: { default: null },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-reference]",
        getAttrs: (element) => ({
          kind: element.getAttribute("data-kind"),
          id: element.getAttribute("data-id"),
          label: element.getAttribute("data-label") ?? element.textContent,
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-reference": "",
        "data-kind": node.attrs.kind,
        "data-id": node.attrs.id,
        "data-label": node.attrs.label,
        class: `editor-reference editor-reference-${node.attrs.kind}`,
      }),
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return node.attrs.label as string;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceChip);
  },

  markdownTokenizer: {
    name: "reference",
    level: "inline",
    start: (src: string) => src.indexOf(":"),
    tokenize: (src: string) => {
      const match = /^:([a-z]+)\[([^\]]*)\]\{([^}]*)\}/.exec(src);
      if (!match || !isReferenceKind(match[1])) return undefined;
      const id = /#([^\s}]+)/.exec(match[3])?.[1] ?? /id="([^"]*)"/.exec(match[3])?.[1];
      if (!id) return undefined;
      return { type: "reference", raw: match[0], kind: match[1], label: match[2], id };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("reference", { kind: token.kind, id: token.id, label: token.label }),
  renderMarkdown: (node) => `:${node.attrs?.kind}[${node.attrs?.label}]{#${node.attrs?.id}}`,
});

/**
 * Ce que la recherche `@` propose : une entité du moteur commun (`lib/search`), prête à
 * devenir une référence. La grammaire, la normalisation sans accents et le classement
 * viennent de là — le menu ne fait qu'afficher. Une pièce porte en plus son type
 * (texte, PDF, image, fichier), la nomenclature commune de l'application.
 */
export interface Mentionable extends Searchable {
  tone?: ResourceTone;
}

/** L'icône d'une entité : le type précis pour une pièce, l'espèce pour le reste. */
export function mentionableIcon(item: Mentionable) {
  if (item.kind === "resource" && item.tone) return toneIcons[item.tone];
  return referenceIcons[item.kind];
}

const kindOrder: readonly ReferenceKind[] = ["member", "resource", "topic", "meeting", "decision"];

interface MentionListHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

/** Certains claviers synthétiques (tests, outils d'accessibilité) n'envoient que `keyCode`. */
function keyOf(event: KeyboardEvent): string {
  if (event.key) return event.key;
  if (event.keyCode === 13) return "Enter";
  if (event.keyCode === 27) return "Escape";
  if (event.keyCode === 38) return "ArrowUp";
  if (event.keyCode === 40) return "ArrowDown";
  return "";
}

type MentionListProps = SuggestionProps<Mentionable> & {
  groupLabels: Record<ReferenceKind, string>;
  /** Correspondances au-delà de la coupe — la liste doit annoncer ce qu'elle ne montre pas. */
  total: number;
  searchAllLabel: string;
  hint: ReactNode;
  /** Ouvre la recherche complète, pré-remplie avec la requête courante. */
  onOpenFull(): void;
};

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command, groupLabels, total, searchAllLabel, hint, onOpenFull },
  ref,
) {
  const [rawActive, setActive] = useState(0);
  // La liste change à chaque frappe : l'index actif reste borné plutôt que réinitialisé par effet.
  const active = Math.min(rawActive, Math.max(items.length - 1, 0));
  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      const key = keyOf(event);
      if (key === "ArrowDown") {
        setActive((active + 1) % Math.max(items.length, 1));
        return true;
      }
      if (key === "ArrowUp") {
        setActive((active - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
        return true;
      }
      if (key === "Enter") {
        if (items[active]) command(items[active]);
        return items.length > 0;
      }
      return false;
    },
  }));
  return (
    <div className="mention-suggestions">
      {/* En tête, toujours visibles : la porte vers la recherche complète, puis la syntaxe. */}
      <button
        type="button"
        className="mention-suggestion-browse"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenFull}
      >
        <SearchIcon aria-hidden="true" /> {searchAllLabel}
        <span className="mention-suggestion-count">{total}</span>
      </button>
      <div className="mention-suggestion-hint">{hint}</div>
      <div className="mention-suggestion-list" role="listbox">
        {items.map((item, index) => {
          const Icon = mentionableIcon(item);
          const firstOfKind = index === 0 || items[index - 1].kind !== item.kind;
          return (
            <div key={`${item.kind}:${item.id}`}>
              {firstOfKind ? <div className="mention-suggestion-group">{groupLabels[item.kind]}</div> : null}
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "mention-suggestion-item is-active" : "mention-suggestion-item"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => command(item)}
              >
                <Icon aria-hidden="true" /> {item.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function placeSuggestions(element: HTMLElement, clientRect: (() => DOMRect | null) | null | undefined) {
  const rect = clientRect?.();
  if (!rect) return;
  element.style.position = "fixed";
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.bottom + 4}px`;
  // Au-dessus de la surimpression d'édition enrichie, elle-même à z-50.
  element.style.zIndex = "60";
}

export interface ReferenceMentionOptions {
  /** Un accesseur, pas une liste : les sources peuvent arriver après le montage de l'éditeur. */
  mentionables(): Mentionable[];
  /** Intitulés des groupes du menu, fournis par l'appelant — la surcouche i18n est à lui. */
  groupLabels: Record<ReferenceKind, string>;
  /** Le dossier « d'où l'on écrit » : la proximité fait remonter ce qui en est proche. */
  context?(): string | undefined;
  searchAllLabel: string;
  /** Le rappel de la syntaxe de recherche, affiché sous l'en-tête du menu. */
  searchHint?: ReactNode;
  /** Ouvre la recherche complète — la requête et la plage `@…` à remplacer sont fournies. */
  onOpenFull?(query: string, range: { from: number; to: number }): void;
}

/**
 * `@` cherche parmi toutes les entités référençables et insère la référence typée.
 * `@terme` cherche partout ; `@catégorie:terme` restreint (`@doc:budget`, `@membre:dup`).
 */
export const ReferenceMention = Extension.create<ReferenceMentionOptions>({
  name: "referenceMention",

  addOptions() {
    return {
      mentionables: () => [],
      groupLabels: {
        member: "Membres",
        resource: "Pièces",
        topic: "Sujets",
        meeting: "Séances",
        decision: "Délibérations",
      },
      searchAllLabel: "Tout parcourir",
      searchHint: null,
    };
  },

  addProseMirrorPlugins() {
    /* Le total de la dernière recherche voyage de `items` vers le rendu : la liste
       annonce ce qu'elle ne montre pas au lieu de couper en silence. */
    const lastTotal = { value: 0 };
    return [
      Suggestion<Mentionable>({
        editor: this.editor,
        char: "@",
        // La plage `@requête` se teinte comme une puce naissante : on voit qu'on cherche.
        decorationClass: "mention-query",
        items: ({ query }) => {
          const outcome = searchEntities(this.options.mentionables(), query, {
            context: this.options.context?.(),
            // Sans requête, une coupe globale ne montrerait que le début de l'alphabet :
            // on échantillonne chaque catégorie. Dès qu'on tape, le classement tranche.
            limit: query.trim() ? 12 : undefined,
          });
          lastTotal.value = outcome.total;
          const results = query.trim()
            ? outcome.results
            : kindOrder.flatMap((kind) => outcome.results.filter((entry) => entry.kind === kind).slice(0, 3));
          // Le classement décide de qui entre dans la coupe ; l'affichage regroupe par type.
          return [...results].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "reference", attrs: { kind: props.kind, id: props.id, label: props.label } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
          const groupLabels = this.options.groupLabels;
          const searchAllLabel = this.options.searchAllLabel;
          const hint = this.options.searchHint;
          const openFull = this.options.onOpenFull;
          const extras = (props: SuggestionProps<Mentionable>) => ({
            groupLabels,
            total: lastTotal.value,
            searchAllLabel,
            hint,
            onOpenFull: () => {
              // Le menu se retire avant que la recherche complète prenne la main.
              exitSuggestion(props.editor.view);
              openFull?.(props.query, props.range);
            },
          });
          return {
            onStart: (props) => {
              component = new ReactRenderer(MentionList, {
                props: { ...props, ...extras(props) },
                editor: props.editor,
              });
              document.body.appendChild(component.element);
              placeSuggestions(component.element as HTMLElement, props.clientRect);
            },
            onUpdate: (props) => {
              component?.updateProps({ ...props, ...extras(props) });
              if (component) placeSuggestions(component.element as HTMLElement, props.clientRect);
            },
            onKeyDown: (props) => {
              if (keyOf(props.event) === "Escape") return false;
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              component?.element.remove();
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
