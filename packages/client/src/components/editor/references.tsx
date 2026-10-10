import type { ReferenceEntityKind } from "@hall/domain";
import { imageWidthRange, isReferenceKind, type ResourcePresentationKind } from "@hall/templating";
import { type Editor, Extension, mergeAttributes, Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { createContext, forwardRef, type ReactNode, useContext, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import type { Searchable } from "../../lib/search";
import type { MemberIcon } from "../icons";
import { type FacetSuggestion, type FacetValueLabels, facetHashPattern } from "../search/facetSuggestions";
import { ResourceSearch, type ResourceSearchHandle } from "../search/ResourceSearch";
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

type MentionListProps = SuggestionProps<Mentionable> & { context?: string; candidates: Mentionable[] };

// The inline host only adapts the editor range. Search and interactions belong to ResourceSearch.
// @implements-requirement HALL-FR-SRC-030
const MentionList = forwardRef<ResourceSearchHandle, MentionListProps>(function MentionList(props, ref) {
  return (
    <div className={`shared-search-inline${facetHashPattern.test(props.query) ? " is-filtering" : ""}`}>
      <ResourceSearch
        ref={ref}
        inline
        testId="editor-mention"
        items={props.candidates}
        scope={{ context: props.context }}
        autoFocus={false}
        externalQuery={props.query}
        onQueryChange={(query) =>
          props.editor
            .chain()
            .insertContentAt({ from: props.range.from + 1, to: props.range.to }, query)
            .run()
        }
        onPick={props.command}
        onClose={() => {
          exitSuggestion(props.editor.view);
          props.editor.commands.focus();
        }}
      />
    </div>
  );
});

function placeSuggestions(element: HTMLElement, clientRect: (() => DOMRect | null) | null | undefined) {
  const rect = clientRect?.();
  if (!rect) return;
  const margin = 8;
  element.style.position = "fixed";
  element.style.zIndex = "var(--hall-z-popover)";
  const width = element.getBoundingClientRect().width;
  const height = element.getBoundingClientRect().height;
  element.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
  if (element.querySelector(".shared-search-filter-overlay")) {
    const center = (rect.top + rect.bottom) / 2;
    const wheel = element.querySelector<HTMLElement>(".shared-search-filter-wheel");
    const row = wheel?.querySelector<HTMLElement>("[data-active='true']");
    if (!wheel || !row) return;
    const rowHeight = row.offsetHeight;
    const index = Array.from(wheel.children).indexOf(row);
    const before = Math.max(0, Math.min(index, 3, Math.floor((center - margin - rowHeight / 2) / rowHeight)));
    const after = Math.max(
      0,
      Math.min(
        wheel.children.length - index - 1,
        3,
        Math.floor((window.innerHeight - margin - center - rowHeight / 2) / rowHeight),
      ),
    );
    element.style.setProperty("--hall-search-filter-height", `${(before + after + 1) * rowHeight}px`);
    wheel.scrollTop = row.offsetTop - before * rowHeight;
    element.style.left = `${Math.max(margin, Math.min(rect.right + 8, window.innerWidth - width - margin))}px`;
    element.style.top = `${Math.max(margin, center - (before + 0.5) * rowHeight - 1)}px`;
    return;
  }
  const below = window.innerHeight - rect.bottom - margin;
  element.style.top = `${Math.max(margin, below >= height ? rect.bottom + 4 : rect.top - height - 4)}px`;
}

export interface ReferenceMentionOptions {
  /** Accessor: sources may arrive after the editor mounts. */
  mentionables(): Mentionable[];
  groupLabels: Record<ReferenceEntityKind, string>;
  facetLabels: Record<FacetSuggestion["facet"], string>;
  /** Folder used to rank nearby entries first. */
  context?(): string | undefined;
  searchAllLabel: string;
  /** Handles a resource picked in the `@` menu, with the `@` range to replace. */
  onOpenFull?(editor: Editor, query: string, range: { from: number; to: number }, selected?: Mentionable): void;
}

/** `@` mention menu: plain text searches every kind; `#` adds structured facets. */
export const ReferenceMention = Extension.create<ReferenceMentionOptions>({
  name: "referenceMention",

  addOptions() {
    return {
      mentionables: () => [],
      groupLabels: {
        member: "Members",
        contact: "Contacts",
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
    return [
      Suggestion<Mentionable>({
        editor: this.editor,
        char: "@",
        allowSpaces: true,
        decorationClass: "mention-query",
        items: () => [],
        command: ({ editor, range, props }) => {
          if (props.kind === "resource" && this.options.onOpenFull) {
            this.options.onOpenFull(editor, props.label, range, props);
            return;
          }
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
          let component: ReactRenderer<ResourceSearchHandle, MentionListProps> | null = null;
          let rect: SuggestionProps<Mentionable>["clientRect"];
          let observer: ResizeObserver | undefined;
          let selectionObserver: MutationObserver | undefined;
          let frame = 0;
          const reposition = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (component) placeSuggestions(component.element as HTMLElement, rect);
            });
          };
          const adapted = (props: SuggestionProps<Mentionable>) => ({
            ...props,
            candidates: this.options.mentionables(),
            context: this.options.context?.(),
          });
          let live = true,
            queued = false;
          let latest: SuggestionProps<Mentionable> | undefined;
          const render = (props: SuggestionProps<Mentionable>) => {
            latest = props;
            rect = facetHashPattern.test(props.query)
              ? () => {
                  const position = props.range.from + 1 + props.query.lastIndexOf("#");
                  const start = props.editor.view.coordsAtPos(position);
                  const end = props.editor.view.coordsAtPos(position + 1);
                  return new DOMRect(start.left, start.top, end.left - start.left, start.bottom - start.top);
                }
              : props.clientRect;
            if (queued) return;
            queued = true;
            queueMicrotask(() => {
              queued = false;
              if (!live || !latest) return;
              if (component) component.updateProps(adapted(latest));
              else {
                component = new ReactRenderer(MentionList, { props: adapted(latest), editor: latest.editor });
                document.body.appendChild(component.element);
                observer = new ResizeObserver(reposition);
                observer.observe(component.element);
                selectionObserver = new MutationObserver(reposition);
                selectionObserver.observe(component.element, {
                  subtree: true,
                  attributes: true,
                  attributeFilter: ["data-active"],
                  childList: true,
                });
                window.addEventListener("resize", reposition);
                window.addEventListener("scroll", reposition, true);
              }
              reposition();
            });
          };
          return {
            onStart: (props) => {
              live = true;
              render(props);
            },
            onUpdate: render,
            onKeyDown: (props) => component?.ref?.onKeyDown(props.event) ?? false,
            onExit: () => {
              live = false;
              cancelAnimationFrame(frame);
              observer?.disconnect();
              selectionObserver?.disconnect();
              window.removeEventListener("resize", reposition);
              window.removeEventListener("scroll", reposition, true);
              const exiting = component;
              component = null;
              exiting?.element.remove();
              queueMicrotask(() => exiting?.destroy());
            },
          };
        },
      }),
    ];
  },
});
