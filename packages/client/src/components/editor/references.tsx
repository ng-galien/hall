import { matchDiscriminated, type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";
import { imageWidthRange, isReferenceKind, type ResourcePresentationKind } from "@hall/templating";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { createContext, forwardRef, type ReactNode, useContext, useImperativeHandle, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, type SearchableMedia, type SearchableState, searchEntities } from "../../lib/search";
import { FilterIcon, FolderIcon, ImageIcon, type MemberIcon, SearchIcon, TagIcon } from "../icons";
import {
  type FacetSuggestion,
  type FacetValueLabels,
  facetHashPattern,
  facetOptionsFrom,
  facetSuggestionsFor,
} from "../search/facetSuggestions";
import { isReferenceEntityKind, referenceKindPresentations } from "./referenceKindPresentation";

type ResourcePreviewRenderer = (id: string, onClose: () => void) => ReactNode;
export type ResourceReferenceAppearance = { tone: string; icon: ReactNode; glyph: ReactNode; tooltip: string };
export type ReferenceTarget = {
  label: string;
  tooltip: string;
  open: { kind: "resourcePreview" } | { kind: "route"; href: string } | null;
};

const ResourcePreviewContext = createContext<{
  renderResourcePreview: ResourcePreviewRenderer;
  resourceAppearance(id: string): ResourceReferenceAppearance | null;
  referenceTarget(kind: ReferenceEntityKind, id: string): ReferenceTarget | null;
} | null>(null);

export function useResourcePreviewRenderer() {
  return useContext(ResourcePreviewContext)?.renderResourcePreview ?? null;
}

export function useResourceAppearance(id: string): ResourceReferenceAppearance | null {
  return useContext(ResourcePreviewContext)?.resourceAppearance(id) ?? null;
}

/** Supplies the resource preview renderer used by reference badges. */
export function ReferencePresentationProvider({
  renderResourcePreview,
  resourceAppearance,
  referenceTarget,
  children,
}: {
  renderResourcePreview: ResourcePreviewRenderer;
  resourceAppearance(id: string): ResourceReferenceAppearance | null;
  referenceTarget(kind: ReferenceEntityKind, id: string): ReferenceTarget | null;
  children: ReactNode;
}) {
  return (
    <ResourcePreviewContext.Provider value={{ renderResourcePreview, resourceAppearance, referenceTarget }}>
      {children}
    </ResourcePreviewContext.Provider>
  );
}

/** Renders a reference inline; resource references open a preview on click. */
export function ReferenceBadge({
  kind,
  id,
  children,
}: {
  kind: ReferenceEntityKind;
  id: string | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [previewing, setPreviewing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef({ x: 0, y: 0 });
  const presentation = useContext(ResourcePreviewContext);
  const target = id ? presentation?.referenceTarget(kind, id) : null;
  const appearance = kind === "resource" && id ? presentation?.resourceAppearance(id) : null;
  const open = target?.open ?? null;
  const openable = open !== null;
  const className = `editor-reference editor-reference-${kind}${appearance ? ` editor-reference-tone-${appearance.tone}` : ""}`;
  const content = (
    <>
      {appearance?.icon}
      {target?.label ?? children}
    </>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {open?.kind === "resourcePreview" ? (
            <button
              ref={triggerRef}
              type="button"
              className={`${className} is-openable`}
              data-testid={`editor-resource-reference-${id}`}
              onClick={() => {
                scrollRef.current = { x: window.scrollX, y: window.scrollY };
                setPreviewing(true);
              }}
            >
              {content}
            </button>
          ) : open?.kind === "route" ? (
            <Link to={open.href} className={`${className} is-openable`} data-testid={`editor-${kind}-reference-${id}`}>
              {content}
            </Link>
          ) : (
            <span className={className}>{content}</span>
          )}
        </TooltipTrigger>
        <TooltipContent>
          {target?.tooltip ?? appearance?.tooltip ?? t(referenceKindPresentations[kind].labelKey)}
          {openable ? ` · ${t("editor.openHint")}` : null}
        </TooltipContent>
      </Tooltip>
      {previewing && id !== null && open?.kind === "resourcePreview"
        ? presentation?.renderResourcePreview(id, () => {
            setPreviewing(false);
            window.requestAnimationFrame(() => {
              triggerRef.current?.focus({ preventScroll: true });
              window.scrollTo(scrollRef.current.x, scrollRef.current.y);
            });
          })
        : null}
    </>
  );
}

function ReferenceChip({ node }: NodeViewProps) {
  const kind = node.attrs.kind;
  const id = typeof node.attrs.id === "string" ? node.attrs.id : null;
  const label = typeof node.attrs.label === "string" ? node.attrs.label : "";
  if (!isReferenceEntityKind(kind)) {
    return <NodeViewWrapper as="span">{label}</NodeViewWrapper>;
  }
  return (
    <NodeViewWrapper as="span" className="editor-reference-wrapper">
      <ReferenceBadge kind={kind} id={id}>
        {label}
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
        getAttrs: (element) => {
          const kind = element.getAttribute("data-kind");
          if (!isReferenceEntityKind(kind)) return false;
          return {
            kind,
            id: element.getAttribute("data-id"),
            label: element.getAttribute("data-label") ?? element.textContent,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind;
    const label = typeof node.attrs.label === "string" ? node.attrs.label : "";
    if (!isReferenceEntityKind(kind)) return ["span", mergeAttributes(HTMLAttributes), label];
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-reference": "",
        "data-kind": kind,
        "data-id": node.attrs.id,
        "data-label": node.attrs.label,
        class: `editor-reference editor-reference-${kind}`,
      }),
      label,
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
      const match = /^:([A-Za-z][A-Za-z0-9-]*)\[([^\]]*)\]\{([^}]*)\}/.exec(src);
      if (!match || !isReferenceKind(match[1])) return undefined;
      const id = /#([^\s}]+)/.exec(match[3])?.[1] ?? /id="([^"]*)"/.exec(match[3])?.[1];
      if (!id) return undefined;
      return { type: "reference", raw: match[0], kind: match[1], label: match[2], id };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("reference", { kind: token.kind, id: token.id, label: token.label }),
  renderMarkdown: (node) => {
    const kind = node.attrs?.kind;
    return isReferenceEntityKind(kind)
      ? `:${kind}[${node.attrs?.label}]{#${node.attrs?.id}}`
      : String(node.attrs?.label ?? "");
  },
});

/** A searchable entity that can be inserted as a reference. */
export interface Mentionable extends Searchable {
  icon?: typeof MemberIcon;
  metaLabel?: string;
  stateLabel?: string;
  mediaLabel?: string;
  /** Recommended block representation when this resource can be included. */
  resourcePresentation?: ResourcePresentationKind;
}

/** Returns the item icon, falling back to the icon for its reference kind. */
export function mentionableIcon(item: Mentionable) {
  return item.icon ?? referenceKindPresentations[item.kind].icon;
}

/** Facet value presentation is injected by mentionable producers, not reconstructed by the technical editor. */
export function mentionableFacetValueLabels(items: readonly Mentionable[]): FacetValueLabels {
  return {
    state: (value) => items.find((item) => item.state === value)?.stateLabel ?? value,
    media: (value) => items.find((item) => item.media === value)?.mediaLabel ?? value,
  };
}

interface MentionListHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

/** Reads the key name, falling back to `keyCode` for synthetic keyboards. */
function keyOf(event: KeyboardEvent): string {
  if (event.key) return event.key;
  if (event.keyCode === 13) return "Enter";
  if (event.keyCode === 27) return "Escape";
  if (event.keyCode === 38) return "ArrowUp";
  if (event.keyCode === 40) return "ArrowDown";
  return "";
}

type MentionListProps = SuggestionProps<Mentionable> & {
  groupLabels: Record<ReferenceEntityKind, string>;
  /** Total match count before truncation. */
  total: number;
  searchAllLabel: string;
  facetLabels: Record<FacetSuggestion["facet"], string>;
  /** `#` criteria for the fragment being typed; when present they replace the entity list. */
  facets: FacetSuggestion<ReferenceEntityKind>[];
  /** Facets already applied to this suggestion session. */
  activeFacets: FacetSuggestion<ReferenceEntityKind>[];
  onPickFacet(facet: FacetSuggestion<ReferenceEntityKind>): void;
  /** Opens the full search, prefilled with the current query. */
  onOpenFull(): void;
};

function facetIcon(facet: FacetSuggestion<ReferenceEntityKind>): ReactNode {
  return matchDiscriminated(facet, "facet", {
    type: () => null,
    folder: () => <FolderIcon aria-hidden="true" />,
    tag: () => <TagIcon aria-hidden="true" />,
    state: () => <FilterIcon aria-hidden="true" />,
    media: () => <ImageIcon aria-hidden="true" />,
  });
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command, groupLabels, total, searchAllLabel, facetLabels, facets, activeFacets, onPickFacet, onOpenFull },
  ref,
) {
  const [rawActive, setActive] = useState(0);
  const facetMode = facets.length > 0;
  const count = facetMode ? facets.length : items.length;
  const active = Math.min(rawActive, Math.max(count - 1, 0));
  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      const key = keyOf(event);
      if (key === "ArrowDown") {
        setActive((active + 1) % Math.max(count, 1));
        return true;
      }
      if (key === "ArrowUp") {
        setActive((active - 1 + Math.max(count, 1)) % Math.max(count, 1));
        return true;
      }
      if (key === "Enter" || (facetMode && event.key === "Tab")) {
        if (facetMode) {
          if (facets[active]) onPickFacet(facets[active]);
          return facets.length > 0;
        }
        if (items[active]) command(items[active]);
        return items.length > 0;
      }
      return false;
    },
  }));
  return (
    <div className="mention-suggestions">
      <button
        type="button"
        className="mention-suggestion-browse"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenFull}
      >
        <SearchIcon aria-hidden="true" /> {searchAllLabel}
        <span className="mention-suggestion-count">{total}</span>
      </button>
      {activeFacets.length > 0 ? (
        <div className="mention-suggestion-facets">
          {activeFacets.map((facet) => (
            <span className="wsearch-chip" key={`${facet.facet}:${facet.value}`}>
              {facetIcon(facet)}
              {facet.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mention-suggestion-list" role="listbox">
        {facetMode
          ? facets.map((facet, index) => (
              <button
                key={`${facet.facet}:${facet.value}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`searchbox-suggestion${index === active ? " is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => onPickFacet(facet)}
              >
                <span className="searchbox-suggestion-facet">
                  {facetIcon(facet)}
                  {facetLabels[facet.facet]}
                </span>
                <span className="searchbox-suggestion-label">{facet.label}</span>
                {facet.count !== undefined ? <span className="searchbox-suggestion-count">{facet.count}</span> : null}
                <kbd>Tab</kbd>
              </button>
            ))
          : items.map((item, index) => {
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
  element.style.zIndex = "60";
}

export interface ReferenceMentionOptions {
  /** Accessor: sources may arrive after the editor mounts. */
  mentionables(): Mentionable[];
  groupLabels: Record<ReferenceEntityKind, string>;
  facetLabels: Record<FacetSuggestion["facet"], string>;
  /** Folder used to rank nearby entries first. */
  context?(): string | undefined;
  searchAllLabel: string;
  /** Opens the full search with the query and the `@` range to replace. */
  onOpenFull?(query: string, range: { from: number; to: number }): void;
}

/** `@` mention menu: plain text searches every kind; `#` adds structured facets. */
export const ReferenceMention = Extension.create<ReferenceMentionOptions>({
  name: "referenceMention",

  addOptions() {
    return {
      mentionables: () => [],
      groupLabels: {
        member: "Members",
        resource: "Attachments",
        councilBusiness: "Subjects",
        meeting: "Meetings",
        decision: "Decisions",
      },
      facetLabels: { type: "Type", folder: "Folder", tag: "Tag", state: "State", media: "Media" },
      searchAllLabel: "Browse all",
    };
  },

  addProseMirrorPlugins() {
    const lastTotal = { value: 0 };
    const session: {
      types: Array<Extract<FacetSuggestion<ReferenceEntityKind>, { facet: "type" }>>;
      folders: string[];
      tags: string[];
      states: SearchableState[];
      media: SearchableMedia[];
    } = {
      types: [],
      folders: [],
      tags: [],
      states: [],
      media: [],
    };
    const resetSession = () => {
      session.types = [];
      session.folders = [];
      session.tags = [];
      session.states = [];
      session.media = [];
    };
    return [
      Suggestion<Mentionable>({
        editor: this.editor,
        char: "@",
        decorationClass: "mention-query",
        items: ({ query }) => {
          const outcome = searchEntities(this.options.mentionables(), query, {
            context: this.options.context?.(),
            kinds: session.types.map((facet) => facet.value),
            folders: session.folders,
            tags: session.tags,
            states: session.states,
            media: session.media,
            limit: query.trim() ? 12 : undefined,
          });
          lastTotal.value = outcome.total;
          const results = query.trim()
            ? outcome.results
            : referenceEntityKinds.flatMap((kind) =>
                outcome.results.filter((entry) => entry.kind === kind).slice(0, 3),
              );
          return [...results].sort(
            (a, b) => referenceEntityKinds.indexOf(a.kind) - referenceEntityKinds.indexOf(b.kind),
          );
        },
        command: ({ editor, range, props }) => {
          if (props.media === "image") {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "resourceImage",
                  attrs: { id: props.id, alt: props.label, align: "left", width: imageWidthRange.default },
                },
                { type: "paragraph" },
              ])
              .run();
            return;
          }
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
          const facetLabels = this.options.facetLabels;
          const searchAllLabel = this.options.searchAllLabel;
          const openFull = this.options.onOpenFull;
          const mentionables = this.options.mentionables;
          const extras = (props: SuggestionProps<Mentionable>) => {
            const candidates = mentionables();
            const hashMatch = facetHashPattern.exec(props.query);
            const selectedTypes = session.types.map((facet) => facet.value);
            const facets = hashMatch
              ? facetSuggestionsFor(
                  hashMatch[1],
                  facetOptionsFrom(
                    candidates,
                    (kind) => groupLabels[kind],
                    undefined,
                    mentionableFacetValueLabels(candidates),
                  ),
                ).filter(
                  (facet) =>
                    (facet.facet !== "type" || !selectedTypes.includes(facet.value)) &&
                    (facet.facet !== "folder" || !session.folders.includes(facet.value)) &&
                    (facet.facet !== "tag" || !session.tags.includes(facet.value)) &&
                    (facet.facet !== "state" || !session.states.includes(facet.value)) &&
                    (facet.facet !== "media" || !session.media.includes(facet.value)),
                )
              : [];
            const activeFacets = [
              ...session.types,
              ...session.folders.map((value) => ({ facet: "folder" as const, value, label: value })),
              ...session.tags.map((value) => ({ facet: "tag" as const, value, label: value })),
              ...session.states.map((value) => ({ facet: "state" as const, value, label: value })),
              ...session.media.map((value) => ({ facet: "media" as const, value, label: value })),
            ];
            return {
              groupLabels,
              facetLabels,
              total: lastTotal.value,
              searchAllLabel,
              facets,
              activeFacets,
              onPickFacet: (facet: FacetSuggestion<ReferenceEntityKind>) => {
                matchDiscriminated(facet, "facet", {
                  type: (entry) => {
                    session.types = [...session.types, entry];
                  },
                  folder: (entry) => {
                    session.folders = [...session.folders, entry.value];
                  },
                  tag: (entry) => {
                    session.tags = [...session.tags, entry.value];
                  },
                  state: (entry) => {
                    session.states = [...session.states, entry.value];
                  },
                  media: (entry) => {
                    session.media = [...session.media, entry.value];
                  },
                });
                const fragmentIndex = props.query.lastIndexOf("#");
                const from = props.range.from + 1 + fragmentIndex;
                const to = props.range.from + 1 + props.query.length;
                props.editor.chain().focus().deleteRange({ from, to }).run();
              },
              onOpenFull: () => {
                exitSuggestion(props.editor.view);
                openFull?.(props.query, props.range);
              },
            };
          };
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
              resetSession();
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
