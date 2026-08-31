import { Extension, generateHTML, type JSONContent } from "@tiptap/core";
import { renderTableToMarkdown, Table, TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Plugin } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import { ResourceImage } from "./images";
import { type Mentionable, Reference, ReferenceMention, type ReferenceMentionOptions } from "./references";
import { ResourceEmbed } from "./resourceEmbeds";

/** True when the table exceeds GFM: merged cells, column widths, extra header rows, or multi-block cells. */
function tableExceedsGfm(table: JSONContent): boolean {
  return (table.content ?? []).some((row, rowIndex) =>
    (row.content ?? []).some((cell) => {
      const attributes = cell.attrs ?? {};
      if ((attributes.colspan ?? 1) > 1 || (attributes.rowspan ?? 1) > 1) return true;
      if (attributes.colwidth) return true;
      if (rowIndex > 0 && cell.type === "tableHeader") return true;
      const blocks = cell.content ?? [];
      return blocks.length > 1 || (blocks[0] !== undefined && blocks[0].type !== "paragraph");
    }),
  );
}

/** Schema used only to render tables to HTML, never mounted in an editor. */
let tableHtmlSchema: (Extension | typeof StarterKit)[] | undefined;
function schemaForTableHtml() {
  tableHtmlSchema ??= [StarterKit, TableKit];
  return tableHtmlSchema;
}

const markdownTable = Table.extend({
  renderMarkdown(node, helpers) {
    if (!tableExceedsGfm(node)) return renderTableToMarkdown(node, helpers);
    return generateHTML({ type: "doc", content: [node] }, schemaForTableHtml());
  },
});

/** Propagates each column's alignment to its unaligned cells, since GFM aligns by column. */
const columnAlignment = Extension.create({
  name: "columnAlignment",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const transaction = newState.tr;
          let changed = false;
          newState.doc.descendants((node, position) => {
            if (node.type.name !== "table") return true;
            const map = TableMap.get(node);
            const start = position + 1;
            for (let column = 0; column < map.width; column++) {
              let alignment: string | null = null;
              for (let row = 0; row < map.height; row++) {
                const align = newState.doc.nodeAt(start + map.map[row * map.width + column])?.attrs.align;
                if (align) {
                  alignment = align as string;
                  break;
                }
              }
              if (!alignment) continue;
              for (let row = 0; row < map.height; row++) {
                const cellPosition = start + map.map[row * map.width + column];
                const cell = newState.doc.nodeAt(cellPosition);
                if (!cell || cell.attrs.colspan > 1 || cell.attrs.align === alignment) continue;
                transaction.setNodeAttribute(cellPosition, "align", alignment);
                changed = true;
              }
            }
            return false;
          });
          return changed ? transaction : null;
        },
      }),
    ];
  },
});

/** Extension set shared by both editing modes; content round-trips through markdown. */
export function editorExtensions({
  placeholder,
  mentionables,
  mentionGroupLabels,
  mentionFacetLabels,
  mentionSearchAllLabel,
  mentionContext,
  mentionOpenFull,
  imageControls = false,
}: {
  placeholder?: string;
  /** Accessor: sources may arrive after the editor mounts. */
  mentionables?: () => Mentionable[];
  mentionGroupLabels?: ReferenceMentionOptions["groupLabels"];
  mentionFacetLabels?: ReferenceMentionOptions["facetLabels"];
  mentionSearchAllLabel?: string;
  /** Folder used to rank nearby entries first. */
  mentionContext?: () => string | undefined;
  mentionOpenFull?: ReferenceMentionOptions["onOpenFull"];
  imageControls?: boolean;
}) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: { openOnClick: false },
    }),
    Markdown,
    TableKit.configure({ table: false }),
    markdownTable.configure({ resizable: true }),
    columnAlignment,
    ResourceImage.configure({ controls: imageControls }),
    ResourceEmbed,
    Reference,
    ReferenceMention.configure({
      mentionables: mentionables ?? (() => []),
      ...(mentionGroupLabels ? { groupLabels: mentionGroupLabels } : {}),
      ...(mentionFacetLabels ? { facetLabels: mentionFacetLabels } : {}),
      ...(mentionSearchAllLabel ? { searchAllLabel: mentionSearchAllLabel } : {}),
      ...(mentionContext ? { context: mentionContext } : {}),
      ...(mentionOpenFull ? { onOpenFull: mentionOpenFull } : {}),
    }),
    Placeholder.configure({ placeholder: placeholder ?? "" }),
  ];
}
