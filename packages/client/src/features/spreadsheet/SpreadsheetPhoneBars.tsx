import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { usePhoneEditorCommands } from "../../components/editor/phoneEditorCommands";
import {
  ArrowDownIcon,
  BoldIcon,
  CheckIcon,
  ColumnAfterIcon,
  DeleteIcon,
  ForwardIcon,
  ItalicIcon,
  RedoIcon,
  RowAfterIcon,
  UndoIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import type { SpreadsheetCell, SpreadsheetCells, SpreadsheetCommand } from "./spreadsheetCells";

/** The library takes the focus back at the end of a double touch: the cell field takes it after this delay. */
const FIELD_FOCUS_DELAY_MS = 0;

/** Height the visible window loses when the keyboard of a phone opens; smaller changes are the address bar. */
const KEYBOARD_MIN_HEIGHT = 120;

/** True while the keyboard of the phone covers part of the window, measured by the visible window. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const visible = window.visualViewport;
    if (!visible) return;
    let tallest = visible.height;
    const update = () => {
      tallest = Math.max(tallest, visible.height);
      setOpen(tallest - visible.height > KEYBOARD_MIN_HEIGHT);
    };
    visible.addEventListener("resize", update);
    return () => visible.removeEventListener("resize", update);
  }, []);
  return open;
}

function Tool({
  label,
  testId,
  active,
  command,
  onRun,
  children,
}: {
  label: string;
  testId: string;
  active?: boolean;
  command: SpreadsheetCommand;
  onRun(command: SpreadsheetCommand): void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="plain"
      size="icon"
      className="spreadsheet-phone-tool"
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onRun(command)}
    >
      {children}
    </Button>
  );
}

/**
 * The bars of a spreadsheet on a phone. Reading: one line under the grid names the designated cell and gives its whole
 * value. Writing: the tools of the spreadsheet in one row above the grid, and under the grid the field of the
 * designated cell, named by the cell, which stays above the keyboard with the keys that confirm it and go to the next
 * row or column without closing the keyboard. Removing a row or a column waits in the « ⋯ » menu of the header.
 * @implements-requirement HALL-FR-LAY-180
 */
export function SpreadsheetPhoneBars({
  cells,
  cell,
  writing,
  editRequest,
  onTypingChange,
  grid,
}: {
  cells: SpreadsheetCells | null;
  /** The designated cell, read again after every change of the workbook. */
  cell: SpreadsheetCell | null;
  writing: boolean;
  /** Changes when a double touch on a cell asks to write it. */
  editRequest: number;
  onTypingChange(typing: boolean): void;
  grid: ReactNode;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);
  const target = useRef<SpreadsheetCell | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const keyboardOpen = useKeyboardOpen();
  const setCommands = usePhoneEditorCommands((store) => store.set);

  useEffect(() => {
    const sameCell =
      cell &&
      target.current &&
      cell.sheetId === target.current.sheetId &&
      cell.row === target.current.row &&
      cell.column === target.current.column;
    if (sameCell && typingRef.current) return;
    target.current = cell;
    setDraft(cell?.input ?? "");
  }, [cell]);

  const commit = useCallback(() => {
    const written = target.current;
    if (!cells || !written || draftRef.current === written.input) return;
    cells.write(written, draftRef.current);
    target.current = { ...written, input: draftRef.current };
  }, [cells]);

  const move = (rows: number, columns: number) => {
    commit();
    cells?.move(rows, columns);
  };

  useEffect(() => {
    if (editRequest === 0 || !writing) return;
    const timer = window.setTimeout(() => field.current?.focus(), FIELD_FOCUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [editRequest, writing]);

  useEffect(() => {
    onTypingChange(typing);
  }, [onTypingChange, typing]);

  const keyboardWasOpen = useRef(false);
  useEffect(() => {
    const closed = keyboardWasOpen.current && !keyboardOpen;
    keyboardWasOpen.current = keyboardOpen;
    if (closed) field.current?.blur();
    if (!keyboardOpen) return;
    const frame = window.requestAnimationFrame(() => cells?.reveal());
    return () => window.cancelAnimationFrame(frame);
  }, [cells, keyboardOpen]);

  useEffect(() => {
    if (!writing || !cells) return;
    setCommands([
      {
        id: "spreadsheet-delete-row",
        label: t("editor.table.deleteRow"),
        icon: <DeleteIcon />,
        onSelect: () => cells.run("deleteRow"),
      },
      {
        id: "spreadsheet-delete-column",
        label: t("editor.table.deleteColumn"),
        icon: <DeleteIcon />,
        onSelect: () => cells.run("deleteColumn"),
      },
    ]);
    return () => setCommands([]);
  }, [cells, setCommands, t, writing]);

  const run = (command: SpreadsheetCommand) => {
    commit();
    cells?.run(command);
  };

  return (
    <>
      {writing && !typing ? (
        <div
          role="toolbar"
          aria-label={t("spreadsheet.tools")}
          className="spreadsheet-phone-toolbar"
          data-testid="spreadsheet-phone-toolbar"
        >
          <Tool label={t("editor.undo")} testId="spreadsheet-undo" command="undo" onRun={run}>
            <UndoIcon />
          </Tool>
          <Tool label={t("editor.redo")} testId="spreadsheet-redo" command="redo" onRun={run}>
            <RedoIcon />
          </Tool>
          <Tool label={t("editor.bold")} testId="spreadsheet-bold" active={cell?.bold} command="bold" onRun={run}>
            <BoldIcon />
          </Tool>
          <Tool
            label={t("editor.italic")}
            testId="spreadsheet-italic"
            active={cell?.italic}
            command="italic"
            onRun={run}
          >
            <ItalicIcon />
          </Tool>
          <Tool
            label={t("editor.table.insertRowBelow")}
            testId="spreadsheet-insert-row"
            command="insertRow"
            onRun={run}
          >
            <RowAfterIcon />
          </Tool>
          <Tool
            label={t("editor.table.insertColumnRight")}
            testId="spreadsheet-insert-column"
            command="insertColumn"
            onRun={run}
          >
            <ColumnAfterIcon />
          </Tool>
        </div>
      ) : null}
      {grid}
      {writing ? (
        <div className="spreadsheet-cell-bar" data-testid="spreadsheet-cell-bar" data-typing={typing || undefined}>
          <Field label={cell?.name ?? ""} className="spreadsheet-cell-field" testId="spreadsheet-cell-field">
            <Input
              ref={field}
              data-testid="spreadsheet-cell-input"
              value={draft}
              disabled={!cell}
              enterKeyHint="next"
              autoComplete="off"
              autoCapitalize="sentences"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => {
                commit();
                setTyping(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  move(1, 0);
                } else if (event.key === "Tab") {
                  event.preventDefault();
                  move(0, event.shiftKey ? -1 : 1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft(target.current?.input ?? "");
                  draftRef.current = target.current?.input ?? "";
                  field.current?.blur();
                }
              }}
            />
          </Field>
          <Button
            variant="plain"
            size="icon"
            data-testid="spreadsheet-cell-next-row"
            aria-label={t("spreadsheet.nextRow")}
            disabled={!cell}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => move(1, 0)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="plain"
            size="icon"
            data-testid="spreadsheet-cell-next-column"
            aria-label={t("spreadsheet.nextColumn")}
            disabled={!cell}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => move(0, 1)}
          >
            <ForwardIcon />
          </Button>
          {typing ? (
            <Button
              variant="plain"
              size="icon"
              data-testid="spreadsheet-cell-confirm"
              aria-label={t("spreadsheet.validateCell")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => field.current?.blur()}
            >
              <CheckIcon />
            </Button>
          ) : null}
        </div>
      ) : (
        <output
          className="spreadsheet-cell-line"
          data-testid="spreadsheet-cell-line"
          aria-label={t("spreadsheet.currentCell")}
        >
          <span className="spreadsheet-cell-line-name">{cell?.name ?? ""}</span>
          <span className="spreadsheet-cell-line-value">{cell?.display ?? ""}</span>
        </output>
      )}
    </>
  );
}
