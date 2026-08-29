import { imageWidthRange, isReferenceKind, type ReferenceKind } from "@hall/templating";
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer } from "@tiptap/react";
import { exitSuggestion, Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { createContext, forwardRef, type ReactNode, useContext, useImperativeHandle, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "../../i18n/I18nProvider";
import { type Searchable, searchEntities } from "../../lib/search";
import { CalendarIcon, FileIcon, GavelIcon, MemberIcon, SearchIcon, TextDocumentIcon } from "../icons";

type ResourcePreviewRenderer = (id: string, onClose: () => void) => ReactNode;

const ResourcePreviewContext = createContext<ResourcePreviewRenderer | null>(null);

export function useResourcePreviewRenderer() {
  return useContext(ResourcePreviewContext);
}

/** Supplies the resource preview renderer used by reference badges. */
export function ReferencePresentationProvider({
  renderResourcePreview,
  children,
}: {
  renderResourcePreview: ResourcePreviewRenderer;
  children: ReactNode;
}) {
  return <ResourcePreviewContext.Provider value={renderResourcePreview}>{children}</ResourcePreviewContext.Provider>;
}

export const referenceIcons: Record<ReferenceKind, typeof MemberIcon> = {
  member: MemberIcon,
  resource: FileIcon,
  councilBusiness: TextDocumentIcon,
  decision: GavelIcon,
  meeting: CalendarIcon,
};

/** Renders a reference inline; resource references open a preview on click. */
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
  const renderResourcePreview = useContext(ResourcePreviewContext);
  const kindLabels: Record<ReferenceKind, string> = {
    member: t("editor.kind.member"),
    resource: t("editor.kind.resource"),
    councilBusiness: t("editor.kind.councilBusiness"),
    meeting: t("editor.kind.meeting"),
    decision: t("editor.kind.decision"),
  };
  const openable = kind === "resource" && id !== null && renderResourcePreview !== null;
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
      {previewing && id !== null ? renderResourcePreview?.(id, () => setPreviewing(false)) : null}
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

/** A searchable entity that can be inserted as a reference. */
export interface Mentionable extends Searchable {
  icon?: typeof MemberIcon;
  metaLabel?: string;
}

/** Returns the item icon, falling back to the icon for its reference kind. */
export function mentionableIcon(item: Mentionable) {
  return item.icon ?? referenceIcons[item.kind];
}

const kindOrder: readonly ReferenceKind[] = ["member", "resource", "councilBusiness", "meeting", "decision"];

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
  groupLabels: Record<ReferenceKind, string>;
  /** Total match count before truncation. */
  total: number;
  searchAllLabel: string;
  hint: ReactNode;
  /** Opens the full search, prefilled with the current query. */
  onOpenFull(): void;
};

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command, groupLabels, total, searchAllLabel, hint, onOpenFull },
  ref,
) {
  const [rawActive, setActive] = useState(0);
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
  element.style.zIndex = "60";
}

export interface ReferenceMentionOptions {
  /** Accessor: sources may arrive after the editor mounts. */
  mentionables(): Mentionable[];
  groupLabels: Record<ReferenceKind, string>;
  /** Folder used to rank nearby entries first. */
  context?(): string | undefined;
  searchAllLabel: string;
  searchHint?: ReactNode;
  /** Opens the full search with the query and the `@` range to replace. */
  onOpenFull?(query: string, range: { from: number; to: number }): void;
}

/** `@` mention menu: `@term` searches every kind, `@kind:term` narrows to one. */
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
      searchAllLabel: "Browse all",
      searchHint: null,
    };
  },

  addProseMirrorPlugins() {
    const lastTotal = { value: 0 };
    return [
      Suggestion<Mentionable>({
        editor: this.editor,
        char: "@",
        decorationClass: "mention-query",
        items: ({ query }) => {
          const outcome = searchEntities(this.options.mentionables(), query, {
            context: this.options.context?.(),
            limit: query.trim() ? 12 : undefined,
          });
          lastTotal.value = outcome.total;
          const results = query.trim()
            ? outcome.results
            : kindOrder.flatMap((kind) => outcome.results.filter((entry) => entry.kind === kind).slice(0, 3));
          return [...results].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
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
          const searchAllLabel = this.options.searchAllLabel;
          const hint = this.options.searchHint;
          const openFull = this.options.onOpenFull;
          const extras = (props: SuggestionProps<Mentionable>) => ({
            groupLabels,
            total: lastTotal.value,
            searchAllLabel,
            hint,
            onOpenFull: () => {
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
