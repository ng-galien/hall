import { Extension, generateHTML, type JSONContent } from "@tiptap/core";
import { renderTableToMarkdown, Table, TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Plugin } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { type Mentionable, Reference, ReferenceMention, type ReferenceMentionOptions } from "./references";

/**
 * Une table GFM ne transporte qu'une grille régulière de cellules d'une ligne de texte,
 * avec une seule ligne d'en-tête. Tout ce qui déborde — fusion, largeurs de colonnes,
 * en-tête latérale, cellule à plusieurs blocs — fait basculer la table entière en HTML
 * embarqué dans le markdown, que la chaîne remark/rehype du contrat sait transporter.
 */
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

/** Schéma servant uniquement à produire le HTML d'une table riche — jamais monté dans un éditeur. */
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

/**
 * En GFM, l'alignement est une propriété de colonne ; dans l'éditeur, il vit sur chaque
 * cellule. Sans entretien, une cellule née après coup (nouvelle ligne, Tab en fin de
 * tableau, collage) s'affiche à gauche alors que le rendu final l'alignera : l'éditeur
 * mentirait. Cette extension rétablit l'invariant après chaque changement de document,
 * en propageant l'alignement de la colonne — sa première cellule alignée — aux cellules
 * qui n'en ont pas.
 */
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
                // Une cellule fusionnée couvre plusieurs colonnes : alignement ambigu, on la laisse.
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

/**
 * Jeu d'extensions commun aux deux modalités d'écriture.
 *
 * Le contenu vit en markdown : l'extension Markdown officielle assure l'aller-retour
 * (GFM, tableaux compris) et c'est elle qui garantit que ce qu'on édite ici reste
 * conforme au contrat @hall/templating partagé avec le serveur.
 */
export function editorExtensions({
  placeholder,
  mentionables,
  mentionGroupLabels,
  mentionSearchAllLabel,
  mentionSearchHint,
  mentionContext,
  mentionOpenFull,
}: {
  placeholder?: string;
  /** Accesseur vers les entités référençables — les listes peuvent arriver après le montage. */
  mentionables?: () => Mentionable[];
  mentionGroupLabels?: ReferenceMentionOptions["groupLabels"];
  mentionSearchAllLabel?: string;
  mentionSearchHint?: ReactNode;
  /** Le dossier d'où l'on écrit, pour la proximité du classement. */
  mentionContext?: () => string | undefined;
  /** Ouvre la recherche complète depuis le pied du menu `@`. */
  mentionOpenFull?: ReferenceMentionOptions["onOpenFull"];
}) {
  return [
    StarterKit.configure({
      // Le titre de page appartient à l'écran, pas au texte : on n'offre que deux niveaux.
      heading: { levels: [2, 3] },
      // Cliquer un lien en édition doit poser le curseur, pas naviguer.
      link: { openOnClick: false },
    }),
    Markdown,
    // Notre table remplace celle du kit : même nœud, mais sa sérialisation choisit
    // entre GFM et HTML embarqué selon la richesse de la table.
    TableKit.configure({ table: false }),
    markdownTable.configure({ resizable: true }),
    columnAlignment,
    Reference,
    ReferenceMention.configure({
      mentionables: mentionables ?? (() => []),
      ...(mentionGroupLabels ? { groupLabels: mentionGroupLabels } : {}),
      ...(mentionSearchAllLabel ? { searchAllLabel: mentionSearchAllLabel } : {}),
      ...(mentionSearchHint ? { searchHint: mentionSearchHint } : {}),
      ...(mentionContext ? { context: mentionContext } : {}),
      ...(mentionOpenFull ? { onOpenFull: mentionOpenFull } : {}),
    }),
    Placeholder.configure({ placeholder: placeholder ?? "" }),
  ];
}
