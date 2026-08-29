import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "../../i18n/I18nProvider";
import {
  AddIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ColumnAfterIcon,
  ColumnBeforeIcon,
  DeleteIcon,
  MergeCellsIcon,
  MoreIcon,
  MoreVerticalIcon,
  RowAfterIcon,
  RowBeforeIcon,
  SplitCellIcon,
  SumIcon,
} from "../icons";

/** Où poser les poignées : géométrie de la cellule courante, en coordonnées du canevas. */
interface TableTarget {
  tableTop: number;
  tableLeft: number;
  tableRight: number;
  tableBottom: number;
  columnCenter: number;
  rowCenter: number;
  /** Position du nœud cellule dans le document, pour bâtir les sélections de colonne. */
  cellPos: number;
  columnAlign: string | null;
  /** Plusieurs cellules sélectionnées : on propose la fusion, sous la sélection. */
  canMerge: boolean;
  /** La cellule courante est fusionnée : on propose de la scinder. */
  canSplit: boolean;
  selectionCenterX: number;
  selectionBottom: number;
}

function findTarget(editor: Editor, canvas: HTMLElement): TableTarget | null {
  const { selection } = editor.state;
  const $pos = selection instanceof CellSelection ? selection.$anchorCell : selection.$anchor;
  let cellPos = selection instanceof CellSelection ? selection.$anchorCell.pos : -1;
  let inTable = false;
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (cellPos < 0 && (name === "tableCell" || name === "tableHeader")) cellPos = $pos.before(depth);
    if (name === "table") {
      inTable = true;
      break;
    }
  }
  if (!inTable || cellPos < 0) return null;

  const cellDom = editor.view.nodeDOM(cellPos);
  if (!(cellDom instanceof HTMLElement)) return null;
  const tableDom = cellDom.closest("table");
  if (!tableDom) return null;

  const canvasRect = canvas.getBoundingClientRect();
  const tableRect = tableDom.getBoundingClientRect();
  const cellRect = cellDom.getBoundingClientRect();
  const toX = (x: number) => x - canvasRect.left + canvas.scrollLeft;
  const toY = (y: number) => y - canvasRect.top + canvas.scrollTop;

  const cellNode = editor.state.doc.nodeAt(cellPos);
  const canSplit = cellNode !== null && (cellNode.attrs.colspan > 1 || cellNode.attrs.rowspan > 1);
  let canMerge = false;
  let selectionLeft = cellRect.left;
  let selectionRight = cellRect.right;
  let selectionBottom = cellRect.bottom;
  if (selection instanceof CellSelection && selection.$anchorCell.pos !== selection.$headCell.pos) {
    canMerge = true;
    const headDom = editor.view.nodeDOM(selection.$headCell.pos);
    if (headDom instanceof HTMLElement) {
      const headRect = headDom.getBoundingClientRect();
      selectionLeft = Math.min(selectionLeft, headRect.left);
      selectionRight = Math.max(selectionRight, headRect.right);
      selectionBottom = Math.max(selectionBottom, headRect.bottom);
    }
  }

  return {
    tableTop: toY(tableRect.top),
    tableLeft: toX(tableRect.left),
    tableRight: toX(tableRect.right),
    tableBottom: toY(tableRect.bottom),
    columnCenter: toX(cellRect.left + cellRect.width / 2),
    rowCenter: toY(cellRect.top + cellRect.height / 2),
    cellPos,
    columnAlign: (cellNode?.attrs.align as string | undefined) ?? null,
    canMerge,
    canSplit,
    selectionCenterX: toX((selectionLeft + selectionRight) / 2),
    selectionBottom: toY(selectionBottom),
  };
}

/** Lit « 2 400 € », « 1 234,56 » ou « -12 » ; refuse tout le reste. */
function parseAmount(text: string): { value: number; decimals: number; euro: boolean } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const euro = /€\s*$/.test(trimmed);
  const cleaned = trimmed.replace(/[€\s  ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return {
    value: Number.parseFloat(cleaned),
    decimals: cleaned.includes(".") ? cleaned.split(".")[1].length : 0,
    euro,
  };
}

/**
 * Contrôles de tableau discrets, à la sélection.
 *
 * Rien n'est affiché tant qu'on n'écrit pas dans un tableau. Le curseur posé dans une cellule
 * fait apparaître deux poignées — au-dessus de la colonne, à gauche de la ligne — qui portent
 * chacune leur menu, et deux boutons « + » en bordure pour étendre le tableau. Tout le reste
 * (naviguer au Tab, taper, sélectionner des plages de cellules) est du texte ordinaire.
 */
export function TableControls({ editor, canvasRef }: { editor: Editor; canvasRef: RefObject<HTMLDivElement | null> }) {
  const { locale, t } = useI18n();
  const [target, setTarget] = useState<TableTarget | null>(null);

  useEffect(() => {
    const update = () => {
      const canvas = canvasRef.current;
      setTarget(canvas && editor.isEditable ? findTarget(editor, canvas) : null);
    };
    update();
    editor.on("transaction", update);
    window.addEventListener("resize", update);
    return () => {
      editor.off("transaction", update);
      window.removeEventListener("resize", update);
    };
  }, [editor, canvasRef]);

  if (!target) return null;

  /** Étend la sélection à la colonne courante avant une commande de colonne entière. */
  const selectColumn = () => {
    const { state, view } = editor;
    view.dispatch(state.tr.setSelection(CellSelection.colSelection(state.doc.resolve(target.cellPos))));
  };
  const alignColumn = (align: "left" | "center" | "right") => {
    selectColumn();
    editor
      .chain()
      .focus()
      .setCellAttribute("align", align === "left" ? null : align)
      .run();
  };

  /** Pose la sélection sur la dernière cellule de la ligne ou de la colonne, puis étend. */
  const extend = (direction: "column" | "row") => {
    const { state, view } = editor;
    const $cell = state.doc.resolve(target.cellPos);
    const table = $cell.node(-1);
    const tableStart = $cell.start(-1);
    const map = TableMap.get(table);
    const rect = map.findCell(target.cellPos - tableStart);
    const lastPos =
      direction === "column"
        ? map.positionAt(rect.top, map.width - 1, table)
        : map.positionAt(map.height - 1, rect.left, table);
    view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, tableStart + lastPos)));
    if (direction === "column") editor.chain().focus().addColumnAfter().run();
    else editor.chain().focus().addRowAfter().run();
  };

  const run = (command: () => void) => () => command();

  /**
   * Somme la colonne courante et l'écrit dans une ligne « Total » en bas du tableau —
   * une valeur posée, pas une formule : le markdown transporte des données, l'auteur
   * reclique pour recalculer. Une ligne de total existante est remplacée.
   */
  const insertTotalRow = () => {
    const { state, view } = editor;
    const $cell = state.doc.resolve(target.cellPos);
    const table = $cell.node(-1);
    const tableStart = $cell.start(-1);
    const map = TableMap.get(table);
    const column = map.findCell(target.cellPos - tableStart).left;

    const rows: { node: ProseMirrorNode; pos: number }[] = [];
    table.forEach((rowNode, offset) => {
      rows.push({ node: rowNode, pos: tableStart + offset });
    });
    const totalLabel = t("editor.table.totalLabel");
    const lastRow = rows.at(-1);
    const existingTotal =
      lastRow && lastRow.node.child(0).textContent.trim().toLowerCase() === totalLabel.toLowerCase() ? lastRow : null;

    let sum = 0;
    let decimals = 0;
    let counted = 0;
    let euro = true;
    for (let row = 0; row < map.height; row++) {
      if (existingTotal && row === map.height - 1) continue;
      const cell = table.nodeAt(map.map[row * map.width + column]);
      if (!cell || cell.type.name === "tableHeader") continue;
      const amount = parseAmount(cell.textContent);
      if (!amount) continue;
      sum += amount.value;
      decimals = Math.max(decimals, amount.decimals);
      counted += 1;
      euro = euro && amount.euro;
    }
    if (counted === 0) return;
    const formatted =
      new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(sum) + (euro ? " €" : "");

    const nodes = state.schema.nodes;
    const bold = state.schema.marks.bold.create();
    const alignOf = (columnIndex: number) => {
      for (let row = 0; row < map.height; row++) {
        const align = table.nodeAt(map.map[row * map.width + columnIndex])?.attrs.align;
        if (align) return align as string;
      }
      return null;
    };
    const cells = [];
    for (let columnIndex = 0; columnIndex < map.width; columnIndex++) {
      const text = columnIndex === column ? formatted : columnIndex === 0 ? totalLabel : null;
      const paragraph = text ? nodes.paragraph.create(null, state.schema.text(text, [bold])) : nodes.paragraph.create();
      const align = alignOf(columnIndex);
      cells.push(nodes.tableCell.create(align ? { align } : null, paragraph));
    }
    const transaction = state.tr;
    if (existingTotal) {
      transaction.delete(existingTotal.pos, existingTotal.pos + existingTotal.node.nodeSize);
    }
    transaction.insert(transaction.mapping.map(tableStart + table.content.size), nodes.tableRow.create(null, cells));
    view.dispatch(transaction);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="table-handle table-handle-column"
            style={{ left: target.columnCenter, top: target.tableTop }}
            aria-label={t("editor.table.columnMenu")}
            title={t("editor.table.columnMenu")}
          >
            <MoreIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={run(() => editor.chain().focus().addColumnBefore().run())}>
            <ColumnBeforeIcon /> {t("editor.table.insertColumnLeft")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(() => editor.chain().focus().addColumnAfter().run())}>
            <ColumnAfterIcon /> {t("editor.table.insertColumnRight")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={run(() => alignColumn("left"))}>
            <AlignLeftIcon /> {t("editor.table.alignLeft")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(() => alignColumn("center"))}>
            <AlignCenterIcon /> {t("editor.table.alignCenter")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(() => alignColumn("right"))}>
            <AlignRightIcon /> {t("editor.table.alignRight")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={run(insertTotalRow)}>
            <SumIcon /> {t("editor.table.totalRow")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={run(() => editor.chain().focus().deleteColumn().run())}>
            <DeleteIcon /> {t("editor.table.deleteColumn")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="table-handle table-handle-row"
            style={{ left: target.tableLeft, top: target.rowCenter }}
            aria-label={t("editor.table.rowMenu")}
            title={t("editor.table.rowMenu")}
          >
            <MoreVerticalIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={run(() => editor.chain().focus().addRowBefore().run())}>
            <RowBeforeIcon /> {t("editor.table.insertRowAbove")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={run(() => editor.chain().focus().addRowAfter().run())}>
            <RowAfterIcon /> {t("editor.table.insertRowBelow")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={run(() => editor.chain().focus().deleteRow().run())}>
            <DeleteIcon /> {t("editor.table.deleteRow")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={run(() => editor.chain().focus().deleteTable().run())}>
            <DeleteIcon /> {t("editor.table.deleteTable")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {target.canMerge || target.canSplit ? (
        <button
          type="button"
          className="table-action-pill"
          style={{ left: target.selectionCenterX, top: target.selectionBottom }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            target.canMerge ? editor.chain().focus().mergeCells().run() : editor.chain().focus().splitCell().run()
          }
        >
          {target.canMerge ? (
            <>
              <MergeCellsIcon /> {t("editor.table.merge")}
            </>
          ) : (
            <>
              <SplitCellIcon /> {t("editor.table.split")}
            </>
          )}
        </button>
      ) : null}

      <button
        type="button"
        className="table-extend table-extend-column"
        style={{ left: target.tableRight, top: (target.tableTop + target.tableBottom) / 2 }}
        aria-label={t("editor.table.addColumn")}
        title={t("editor.table.addColumn")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => extend("column")}
      >
        <AddIcon />
      </button>
      <button
        type="button"
        className="table-extend table-extend-row"
        style={{ left: (target.tableLeft + target.tableRight) / 2, top: target.tableBottom }}
        aria-label={t("editor.table.addRow")}
        title={t("editor.table.addRow")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => extend("row")}
      >
        <AddIcon />
      </button>
    </>
  );
}
