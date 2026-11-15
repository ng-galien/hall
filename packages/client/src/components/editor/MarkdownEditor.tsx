import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListRow, ListRows } from "@/components/ui/list-row";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import {
  BoldIcon,
  BoxedTextIcon,
  ChecklistIcon,
  EditIcon,
  FormattingIcon,
  FullscreenIcon,
  HeadingIcon,
  HeadingThreeIcon,
  HeadingTwoIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  OutdentIcon,
  ParagraphIcon,
  QuoteIcon,
  RedoIcon,
  ReferenceIcon,
  TableIcon,
  UnderlineIcon,
  UndoIcon,
} from "../icons";
import { editorExtensions } from "./extensions";
import { ImageMenuButton, PhotoSheetButton, useImageFiles } from "./ImageFileControls";
import {
  type ChooseSpreadsheetDrop,
  type EditorDocumentUpload,
  type EditorImageUpload,
  ImageDropZone,
  type ImageUploadStatus,
  ImageUploadStatusLine,
  idleUploadStatus,
  imageTransferHandlers,
  useImageDropZone,
  useSpreadsheetDropChoice,
} from "./imageTransfer";
import { focusesText, usePhoneKeyboard, writingChain } from "./phoneKeyboard";
import { keepCaretBelowWritingTools } from "./phoneWritingScroll";
import { useReadablePhotoUpload } from "./photoName";
import { EditorReferenceSearch, type FullSearchRequest } from "./ReferenceSearchDialog";
import { referenceKindPresentations } from "./referenceKindPresentation";
import type { Mentionable } from "./references";
import { insertMentionedResource } from "./resourceEmbeds";
import { TableControls } from "./TableControls";

export interface MarkdownEditorProps {
  testId?: string;
  markdown: string;
  /** Heading shown by the enriched overlay. */
  title?: string;
  placeholder?: string;
  onChange(markdown: string): void;
  onBlur?(): void;
  /** Entities offered by the `@` search. */
  mentionables?: Mentionable[];
  /** Folder used to rank nearby entries first. */
  searchContext?: string;
  /** Enables image upload; resolves to the archived resource id and label. */
  onUploadImage?(image: File): Promise<{ id: string; label: string }>;
  /** Imports the photos of the Take a photo and Choose a photo buttons as files; Upload an image, dropped and pasted images keep onUploadImage. */
  onUploadPhoto?: EditorImageUpload;
  /** Enables the upload of dropped files as documents cited by a reference at the drop point. */
  onUploadDocument?: EditorDocumentUpload;
  readOnly?: boolean;
  /** Renders the enriched body directly when an outer surface already provides the extended envelope. */
  variant?: "compact" | "enriched";
  /** The enriched body takes the focus when it opens, unless the surface leads elsewhere first. */
  autoFocus?: boolean;
  /**
   * The text written on its own phone screen (a text of Documents, the report of an affaire): it fills the screen under
   * the header, without frame, and does not offer the full-screen editor. Every editor on a phone has the same writing bar.
   */
  phoneWriting?: boolean;
}

const compactFormattingMenuHoldDelay = 1000;

function ToolbarButton({
  label,
  testId,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="plain"
          size="icon"
          data-testid={testId}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ListStructureButtons({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const state = useToolbarState(editor);
  const itemType = editor.isActive("taskItem") ? "taskItem" : "listItem";
  return (
    <>
      <ToolbarButton
        label={t("editor.checklist")}
        testId="editor-checklist"
        active={state?.taskList}
        onClick={() => writingChain(editor).toggleTaskList().run()}
      >
        <ChecklistIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.indent")}
        testId="editor-indent"
        disabled={!state?.canIndent}
        onClick={() => writingChain(editor).sinkListItem(itemType).run()}
      >
        <IndentIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.outdent")}
        testId="editor-outdent"
        disabled={!state?.canOutdent}
        onClick={() => writingChain(editor).liftListItem(itemType).run()}
      >
        <OutdentIcon />
      </ToolbarButton>
    </>
  );
}

function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: (context) => {
      const current = context.editor;
      if (!current) return null;
      return {
        bold: current.isActive("bold"),
        code: current.isActive("code"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        taskList: current.isActive("taskList"),
        canIndent: current.can().sinkListItem(current.isActive("taskItem") ? "taskItem" : "listItem"),
        canOutdent: current.can().liftListItem(current.isActive("taskItem") ? "taskItem" : "listItem"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        link: current.isActive("link"),
        blockType: current.isActive("heading", { level: 2 })
          ? "h2"
          : current.isActive("heading", { level: 3 })
            ? "h3"
            : current.isActive("blockquote")
              ? "quote"
              : "p",
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });
}

function applyBlockType(editor: Editor, next: string) {
  const chain = writingChain(editor);
  if (editor.isActive("blockquote") && next !== "quote") chain.unsetBlockquote();
  if (next === "p") chain.setParagraph();
  if (next === "h2") chain.setHeading({ level: 2 });
  if (next === "h3") chain.setHeading({ level: 3 });
  if (next === "quote") chain.setBlockquote();
  chain.run();
}

function BlockTypeSelect({ editor, value }: { editor: Editor; value: string }) {
  const { t } = useI18n();
  return (
    <Select value={value} onValueChange={(next) => applyBlockType(editor, next)}>
      <SelectTrigger data-testid="editor-block-style" aria-label={t("editor.blockType")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem data-testid="editor-block-p" value="p">
          {t("editor.paragraph")}
        </SelectItem>
        <SelectItem data-testid="editor-block-h2" value="h2">
          {t("editor.heading2")}
        </SelectItem>
        <SelectItem data-testid="editor-block-h3" value="h3">
          {t("editor.heading3")}
        </SelectItem>
        <SelectItem data-testid="editor-block-quote" value="quote">
          {t("editor.quote")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function LinkEditorForm({ editor, active, onDone }: { editor: Editor; active: boolean; onDone(): void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (trimmed) {
      writingChain(editor).extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      writingChain(editor).extendMarkRange("link").unsetLink().run();
    }
    onDone();
  };
  const remove = () => {
    writingChain(editor).extendMarkRange("link").unsetLink().run();
    onDone();
  };

  return (
    <form onSubmit={apply}>
      <Field label={t("editor.linkUrl")}>
        <Input
          type="url"
          value={url}
          placeholder="https://…"
          autoFocus
          onChange={(event) => setUrl(event.target.value)}
        />
      </Field>
      <div className="markdown-link-popover-actions">
        {active ? (
          <Button variant="secondary" onClick={remove}>
            {t("editor.linkRemove")}
          </Button>
        ) : null}
        <Button type="submit">{t("editor.linkApply")}</Button>
      </div>
    </form>
  );
}

function LinkControl({ editor, active }: { editor: Editor; active: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="plain"
              size="icon"
              data-testid="editor-link"
              aria-label={t("editor.link")}
              aria-pressed={active}
            >
              <LinkIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {t("editor.link")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="markdown-link-popover">
        {open ? <LinkEditorForm editor={editor} active={active} onDone={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function MarksButtons({ editor, state }: { editor: Editor; state: NonNullable<ReturnType<typeof useToolbarState>> }) {
  const { t } = useI18n();
  return (
    <>
      <ToolbarButton
        label={t("editor.bold")}
        testId="editor-bold"
        active={state.bold}
        onClick={() => writingChain(editor).toggleBold().run()}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.italic")}
        testId="editor-italic"
        active={state.italic}
        onClick={() => writingChain(editor).toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.underline")}
        testId="editor-underline"
        active={state.underline}
        onClick={() => writingChain(editor).toggleUnderline().run()}
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.code")}
        testId="editor-code"
        active={state.code}
        onClick={() => writingChain(editor).toggleCode().run()}
      >
        <BoxedTextIcon />
      </ToolbarButton>
    </>
  );
}

/** The window that writes the address of a link, opened from a menu or a sheet of the editor. */
function LinkDialog({
  editor,
  active,
  open,
  onOpenChange,
}: {
  editor: Editor;
  active: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="editor-formatting-link-dialog"
        closeLabel={t("common.close")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (focusesText(editor.view)) editor.commands.focus();
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("editor.link")}</DialogTitle>
        </DialogHeader>
        {open ? <LinkEditorForm editor={editor} active={active} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CompactFormattingMenu({
  editor,
  state,
}: {
  editor: Editor;
  state: NonNullable<ReturnType<typeof useToolbarState>>;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const controlHoldTimer = useRef<number | null>(null);

  useEffect(() => {
    let controlPressed = false;
    const cancelHold = () => {
      if (controlHoldTimer.current !== null) window.clearTimeout(controlHoldTimer.current);
      controlHoldTimer.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Control") {
        if (event.ctrlKey) cancelHold();
        return;
      }
      if (event.repeat || controlPressed || !editor.isFocused) return;
      controlPressed = true;
      controlHoldTimer.current = window.setTimeout(() => {
        controlHoldTimer.current = null;
        if (controlPressed && editor.isFocused) setMenuOpen(true);
      }, compactFormattingMenuHoldDelay);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control") return;
      controlPressed = false;
      cancelHold();
    };
    const handleWindowBlur = () => {
      controlPressed = false;
      cancelHold();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      cancelHold();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [editor]);

  const restoreEditorFocus = () => {
    requestAnimationFrame(() => {
      if (focusesText(editor.view)) editor.commands.focus();
    });
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="plain"
                size="icon"
                data-testid="editor-formatting-menu"
                aria-label={t("editor.formatting")}
                onMouseDown={(event) => event.preventDefault()}
              >
                <EditIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {t("editor.formatting")}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="bottom"
          align="start"
          className="markdown-formatting-menu w-max"
          data-testid="editor-formatting-menu-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onEscapeKeyDown={restoreEditorFocus}
        >
          <DropdownMenuItem
            className="whitespace-nowrap"
            disabled={!state.canUndo}
            data-testid="editor-formatting-undo"
            onSelect={() => writingChain(editor).undo().run()}
          >
            <UndoIcon />
            {t("editor.undo")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="whitespace-nowrap"
            disabled={!state.canRedo}
            data-testid="editor-formatting-redo"
            onSelect={() => writingChain(editor).redo().run()}
          >
            <RedoIcon />
            {t("editor.redo")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(["p", "h2", "h3", "quote"] as const).map((blockType) => (
            <DropdownMenuCheckboxItem
              key={blockType}
              className="whitespace-nowrap"
              checked={state.blockType === blockType}
              data-testid={`editor-formatting-block-${blockType}`}
              onSelect={() => applyBlockType(editor, blockType)}
            >
              {t(
                blockType === "p"
                  ? "editor.paragraph"
                  : blockType === "h2"
                    ? "editor.heading2"
                    : blockType === "h3"
                      ? "editor.heading3"
                      : "editor.quote",
              )}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.bold}
            data-testid="editor-formatting-bold"
            onSelect={() => writingChain(editor).toggleBold().run()}
          >
            <BoldIcon />
            {t("editor.bold")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.italic}
            data-testid="editor-formatting-italic"
            onSelect={() => writingChain(editor).toggleItalic().run()}
          >
            <ItalicIcon />
            {t("editor.italic")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.underline}
            data-testid="editor-formatting-underline"
            onSelect={() => writingChain(editor).toggleUnderline().run()}
          >
            <UnderlineIcon />
            {t("editor.underline")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.code}
            data-testid="editor-formatting-code"
            onSelect={() => writingChain(editor).toggleCode().run()}
          >
            <BoxedTextIcon />
            {t("editor.code")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.bulletList}
            data-testid="editor-formatting-bullet-list"
            onSelect={() => writingChain(editor).toggleBulletList().run()}
          >
            <ListBulletedIcon />
            {t("editor.bulletList")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.orderedList}
            data-testid="editor-formatting-numbered-list"
            onSelect={() => writingChain(editor).toggleOrderedList().run()}
          >
            <ListNumberedIcon />
            {t("editor.numberedList")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.taskList}
            data-testid="editor-formatting-checklist"
            onSelect={() => writingChain(editor).toggleTaskList().run()}
          >
            <ChecklistIcon />
            {t("editor.checklist")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="whitespace-nowrap"
            disabled={!state.canIndent}
            data-testid="editor-formatting-indent"
            onSelect={() =>
              writingChain(editor)
                .sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem")
                .run()
            }
          >
            <IndentIcon />
            {t("editor.indent")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="whitespace-nowrap"
            disabled={!state.canOutdent}
            data-testid="editor-formatting-outdent"
            onSelect={() =>
              writingChain(editor)
                .liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem")
                .run()
            }
          >
            <OutdentIcon />
            {t("editor.outdent")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="whitespace-nowrap"
            data-testid="editor-formatting-link"
            onSelect={() => setLinkOpen(true)}
          >
            <LinkIcon />
            {t("editor.link")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="whitespace-nowrap"
            data-testid="editor-formatting-insert-table"
            onSelect={() => writingChain(editor).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon />
            {t("editor.insertTable")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LinkDialog editor={editor} active={state.link} open={linkOpen} onOpenChange={setLinkOpen} />
    </>
  );
}

const narrowLayoutQuery = "(max-width: 1000px)";

/** True on a phone or a tablet, where the photo choices of the editor are offered. */
function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(narrowLayoutQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(narrowLayoutQuery);
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

/** One text tool of the phone writing bar: the icon of the tool, named by its label. */
function PhoneTool({
  label,
  testId,
  active,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="plain"
      size="icon"
      type="button"
      className="markdown-phone-tool"
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

type BlockType = "p" | "h2" | "h3" | "quote";

const blockLevels: { type: BlockType; label: TranslationKey; icon: ReactNode }[] = [
  { type: "p", label: "editor.paragraph", icon: <ParagraphIcon /> },
  { type: "h2", label: "editor.heading2", icon: <HeadingTwoIcon /> },
  { type: "h3", label: "editor.heading3", icon: <HeadingThreeIcon /> },
  { type: "quote", label: "editor.quote", icon: <QuoteIcon /> },
];

/**
 * The heading icon of the phone writing bar: it opens the levels of the block (paragraph, heading 2, heading 3,
 * quotation) under the bar. The text keeps the focus, so an open keyboard stays open while a level is chosen.
 */
function PhoneBlockLevels({ editor, value }: { editor: Editor; value: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="plain"
          size="icon"
          type="button"
          className="markdown-phone-tool"
          data-testid="editor-heading"
          aria-label={t("editor.blockType")}
          aria-pressed={value !== "p"}
          onMouseDown={(event) => event.preventDefault()}
        >
          <HeadingIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="markdown-phone-levels"
        data-testid="editor-block-levels"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {blockLevels.map((level) => (
          <Button
            key={level.type}
            variant="plain"
            type="button"
            className="markdown-phone-level"
            data-testid={`editor-block-${level.type}`}
            aria-pressed={value === level.type}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              applyBlockType(editor, level.type);
            }}
          >
            {level.icon}
            {t(level.label)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** One command of the other writing commands of a phone, listed in their sheet. */
interface PhoneMoreCommand {
  id: string;
  label: string;
  icon: ReactNode;
  testId: string;
  active?: boolean;
  disabled?: boolean;
  run(): void;
}

/**
 * « Mise en forme » at the right of the phone writing bar: a bottom sheet with every other command of the editor. The chosen command runs
 * once the sheet is closed, so the text takes the focus back and the keyboard reopens where the person was writing.
 */
function PhoneMoreCommands({ editor, commands }: { editor: Editor; commands: PhoneMoreCommand[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const chosen = useRef<PhoneMoreCommand | null>(null);
  return (
    <>
      <Button
        variant="plain"
        size="icon"
        type="button"
        className="markdown-phone-tool"
        data-testid="editor-formatting-menu"
        aria-label={t("editor.formatting")}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(true)}
      >
        <FormattingIcon />
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        title={t("editor.formatting")}
        testId="editor-formatting-menu-content"
        list
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const command = chosen.current;
          chosen.current = null;
          if (command) command.run();
          else if (focusesText(editor.view)) editor.commands.focus();
        }}
      >
        <ListRows>
          {commands.map((command) => (
            <ListRow
              key={command.id}
              onOpen={() => {
                chosen.current = command;
                setOpen(false);
              }}
              openTestId={command.testId}
              openProps={{ disabled: command.disabled, "aria-pressed": command.active }}
              selected={command.active}
              head={
                <span className="type-icon" aria-hidden="true">
                  {command.icon}
                </span>
              }
              title={command.label}
            />
          ))}
        </ListRows>
      </Sheet>
    </>
  );
}

// @implements-requirement HALL-FR-DOC-270
/**
 * The single writing bar of a phone (choice 8B), wherever a text is written: one row fixed above the text while it
 * scrolls, with the icons of bold, italic, the levels of heading and the bulleted list, then « Photo » and « Mise en forme »,
 * which gives every other command of the editor in a bottom sheet.
 */
function PhoneWritingBar({
  editor,
  state,
  photo,
  onReference,
  onEnrich,
}: {
  editor: Editor;
  state: NonNullable<ReturnType<typeof useToolbarState>>;
  photo: ReactNode;
  onReference(): void;
  /** The full-screen editor, offered only where the text does not already fill the screen. */
  onEnrich?(): void;
}) {
  const { t } = useI18n();
  const [linkOpen, setLinkOpen] = useState(false);
  const itemType = editor.isActive("taskItem") ? "taskItem" : "listItem";
  const commands: PhoneMoreCommand[] = [
    {
      id: "undo",
      label: t("editor.undo"),
      icon: <UndoIcon />,
      testId: "editor-formatting-undo",
      disabled: !state.canUndo,
      run: () => writingChain(editor).undo().run(),
    },
    {
      id: "redo",
      label: t("editor.redo"),
      icon: <RedoIcon />,
      testId: "editor-formatting-redo",
      disabled: !state.canRedo,
      run: () => writingChain(editor).redo().run(),
    },
    {
      id: "underline",
      label: t("editor.underline"),
      icon: <UnderlineIcon />,
      testId: "editor-formatting-underline",
      active: state.underline,
      run: () => writingChain(editor).toggleUnderline().run(),
    },
    {
      id: "code",
      label: t("editor.code"),
      icon: <BoxedTextIcon />,
      testId: "editor-formatting-code",
      active: state.code,
      run: () => writingChain(editor).toggleCode().run(),
    },
    {
      id: "numbered-list",
      label: t("editor.numberedList"),
      icon: <ListNumberedIcon />,
      testId: "editor-formatting-numbered-list",
      active: state.orderedList,
      run: () => writingChain(editor).toggleOrderedList().run(),
    },
    {
      id: "checklist",
      label: t("editor.checklist"),
      icon: <ChecklistIcon />,
      testId: "editor-formatting-checklist",
      active: state.taskList,
      run: () => writingChain(editor).toggleTaskList().run(),
    },
    {
      id: "indent",
      label: t("editor.indent"),
      icon: <IndentIcon />,
      testId: "editor-formatting-indent",
      disabled: !state.canIndent,
      run: () => writingChain(editor).sinkListItem(itemType).run(),
    },
    {
      id: "outdent",
      label: t("editor.outdent"),
      icon: <OutdentIcon />,
      testId: "editor-formatting-outdent",
      disabled: !state.canOutdent,
      run: () => writingChain(editor).liftListItem(itemType).run(),
    },
    {
      id: "link",
      label: t("editor.link"),
      icon: <LinkIcon />,
      testId: "editor-formatting-link",
      active: state.link,
      run: () => setLinkOpen(true),
    },
    {
      id: "table",
      label: t("editor.insertTable"),
      icon: <TableIcon />,
      testId: "editor-formatting-insert-table",
      run: () => writingChain(editor).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: "reference",
      label: t("editor.searchReferences"),
      icon: <ReferenceIcon />,
      testId: "editor-insert-reference",
      run: onReference,
    },
    ...(onEnrich
      ? [
          {
            id: "enrich",
            label: t("editor.enrich"),
            icon: <FullscreenIcon />,
            testId: "editor-open-enriched",
            run: onEnrich,
          },
        ]
      : []),
  ];
  return (
    <div
      role="toolbar"
      aria-label={t("editor.formatting")}
      className="markdown-phone-toolbar"
      data-testid="editor-phone-toolbar"
    >
      <PhoneTool
        label={t("editor.bold")}
        testId="editor-bold"
        active={state.bold}
        onClick={() => writingChain(editor).toggleBold().run()}
      >
        <BoldIcon />
      </PhoneTool>
      <PhoneTool
        label={t("editor.italic")}
        testId="editor-italic"
        active={state.italic}
        onClick={() => writingChain(editor).toggleItalic().run()}
      >
        <ItalicIcon />
      </PhoneTool>
      <PhoneBlockLevels editor={editor} value={state.blockType} />
      <PhoneTool
        label={t("editor.bulletList")}
        testId="editor-bullet-list"
        active={state.bulletList}
        onClick={() => writingChain(editor).toggleBulletList().run()}
      >
        <ListBulletedIcon />
      </PhoneTool>
      <span className="markdown-phone-toolbar-end">
        {photo}
        <PhoneMoreCommands editor={editor} commands={commands} />
      </span>
      <LinkDialog editor={editor} active={state.link} open={linkOpen} onOpenChange={setLinkOpen} />
    </div>
  );
}

function useMentionGroupLabels() {
  const { t } = useI18n();
  return {
    member: t(referenceKindPresentations.member.groupLabelKey),
    contact: t(referenceKindPresentations.contact.groupLabelKey),
    resource: t(referenceKindPresentations.resource.groupLabelKey),
    councilBusiness: t(referenceKindPresentations.councilBusiness.groupLabelKey),
    meeting: t(referenceKindPresentations.meeting.groupLabelKey),
    decision: t(referenceKindPresentations.decision.groupLabelKey),
  };
}

function useMentionFacetLabels() {
  const { t } = useI18n();
  return {
    type: t("workspace.facetType"),
    folder: t("workspace.facetFolder"),
    tag: t("search.facetTag"),
    state: t("workspace.facetState"),
  };
}

// @implements-requirement HALL-FR-DOC-270
/** Markdown editor with compact inline and full-screen modes editing the same markdown. */
export function MarkdownEditor({
  testId,
  markdown,
  title,
  placeholder,
  onChange,
  onBlur,
  mentionables,
  searchContext,
  onUploadImage,
  onUploadPhoto,
  onUploadDocument,
  readOnly = false,
  variant = "compact",
  autoFocus = true,
  phoneWriting: phoneWritingScreen = false,
}: MarkdownEditorProps) {
  const { t } = useI18n();
  const [enriched, setEnriched] = useState(false);
  const [imageStatus, setImageStatus] = useState<ImageUploadStatus>(idleUploadStatus);
  const imageUpload = useRef<EditorImageUpload | undefined>(onUploadImage);
  const inlineEditor = useRef<Editor | null>(null);
  const uploadImage = useReadablePhotoUpload(onUploadImage, () => inlineEditor.current?.state.doc);
  imageUpload.current = uploadImage;
  const documentUpload = useRef<EditorDocumentUpload | undefined>(onUploadDocument);
  documentUpload.current = onUploadDocument;
  const spreadsheetDrop = useSpreadsheetDropChoice();
  const spreadsheetChoice = useRef<ChooseSpreadsheetDrop | undefined>(spreadsheetDrop.choose);
  const imageStatusChange = useRef(setImageStatus);
  const inlineDropZone = useImageDropZone(!readOnly);
  const latest = useRef(markdown);
  const compactEditor = useRef<HTMLDivElement>(null);
  const inlineCanvas = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  const members = useRef<Mentionable[]>([]);
  const canonicalMentionables = useReferenceMentionables();
  members.current = mentionables ?? canonicalMentionables;
  const context = useRef<string | undefined>(searchContext);
  context.current = searchContext;
  const groupLabels = useMentionGroupLabels();
  const facetLabels = useMentionFacetLabels();
  const [fullSearch, setFullSearch] = useState<FullSearchRequest | null>(null);
  const phone = usePhoneLayout();
  const narrow = useNarrowLayout();
  const phoneWriting = phoneWritingScreen && phone && !readOnly && variant === "compact";

  const inline = useEditor({
    extensions: editorExtensions({
      imageControls: true,
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionFacetLabels: facetLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionContext: () => context.current,
      mentionOpenFull: (mentionEditor, query, range, selected) =>
        setFullSearch(insertMentionedResource(mentionEditor, { query, range, selected })),
    }),
    content: markdown,
    contentType: "markdown",
    editable: !readOnly,
    editorProps: {
      attributes: {
        "data-testid": "editor-writing-area",
        class: "markdown-content",
        "aria-label": t("editor.writeArea"),
      },
      ...imageTransferHandlers(imageUpload, imageStatusChange, documentUpload, spreadsheetChoice),
    },
    onUpdate: ({ editor }) => {
      latest.current = editor.getMarkdown();
      callbacks.current.onChange(latest.current);
    },
    onBlur: () => callbacks.current.onBlur?.(),
  });

  useEffect(() => {
    if (!inline || markdown === latest.current) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      latest.current = markdown;
      if (inline.getMarkdown() !== markdown) {
        inline.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inline, markdown]);

  useEffect(() => {
    inline?.setEditable(!readOnly);
  }, [inline, readOnly]);

  inlineEditor.current = inline;
  const state = useToolbarState(inline);
  usePhoneKeyboard(inline, phone && !readOnly);
  const images = useImageFiles({
    editor: inline && !readOnly ? inline : null,
    upload: uploadImage,
    uploadPhoto: onUploadPhoto,
    onStatus: setImageStatus,
  });
  const imageBusy = imageStatus.kind === "uploading";
  const phoneTools = Boolean(phone && !readOnly && inline && state);
  useEffect(() => {
    const tools = compactEditor.current?.querySelector<HTMLElement>(".markdown-phone-toolbar");
    if (!phoneTools || !inline || !tools) return;
    return keepCaretBelowWritingTools(inline.view, tools);
  }, [phoneTools, inline]);

  if (variant === "enriched" && !readOnly) {
    return (
      <EnrichedEditor
        autoFocus={autoFocus}
        testId={testId}
        initial={latest.current}
        placeholder={placeholder}
        members={members}
        context={context}
        onUploadImage={onUploadImage}
        onUploadPhoto={onUploadPhoto}
        onUploadDocument={onUploadDocument}
        imageStatus={imageStatus}
        onImageStatus={setImageStatus}
        onBlur={() => callbacks.current.onBlur?.()}
        onChange={(next) => {
          latest.current = next;
          callbacks.current.onChange(next);
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={compactEditor}
        className={cn("markdown-editor markdown-editor-compact", phoneWriting && "markdown-editor-phone")}
        data-testid={testId ?? "markdown-editor-compact"}
      >
        {images.inputs}
        {phoneTools && inline && state ? (
          <PhoneWritingBar
            editor={inline}
            state={state}
            photo={<PhotoSheetButton choices={[...images.photos, ...images.uploads]} busy={imageBusy} />}
            onReference={() => setFullSearch({ query: "" })}
            onEnrich={phoneWriting ? undefined : () => setEnriched(true)}
          />
        ) : null}
        {phoneTools ? null : (
          <div role="toolbar" aria-label={t("editor.writeArea")} className="markdown-editor-compact-toolbar">
            {inline && state && !readOnly ? <CompactFormattingMenu editor={inline} state={state} /> : null}
            {inline && !readOnly ? (
              <ToolbarButton
                label={t("editor.searchReferences")}
                testId="editor-insert-reference"
                onClick={() => setFullSearch({ query: "" })}
              >
                <ReferenceIcon />
              </ToolbarButton>
            ) : null}
            {readOnly ? null : (
              <ToolbarButton label={t("editor.enrich")} testId="editor-open-enriched" onClick={() => setEnriched(true)}>
                <FullscreenIcon />
              </ToolbarButton>
            )}
            {readOnly ? null : (
              <ImageMenuButton
                choices={narrow ? [...images.photos, ...images.uploads] : images.uploads}
                busy={imageBusy}
              />
            )}
          </div>
        )}
        <div className="markdown-editor-canvas" ref={inlineCanvas} {...inlineDropZone.handlers}>
          <EditorContent editor={inline} className="markdown-editor-content" />
          {inline ? <TableControls editor={inline} canvasRef={inlineCanvas} /> : null}
          <ImageDropZone active={inlineDropZone.active} documents={Boolean(onUploadDocument)} />
          {enriched ? null : <ImageUploadStatusLine status={imageStatus} />}
          {spreadsheetDrop.dialog}
        </div>
      </div>
      {fullSearch && inline ? (
        <EditorReferenceSearch
          editor={inline}
          request={fullSearch}
          mentionables={members}
          context={context}
          onClose={() => setFullSearch(null)}
        />
      ) : null}
      <Dialog
        open={enriched}
        onOpenChange={(open) => {
          setEnriched(open);
          if (!open) inline?.commands.setContent(latest.current, { contentType: "markdown" });
        }}
      >
        <DialogContent
          data-testid="editor-enriched-dialog"
          className="markdown-editor-dialog"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{title ?? t("editor.enrich")}</DialogTitle>
          </DialogHeader>
          {enriched ? (
            <EnrichedEditor
              testId={testId}
              initial={latest.current}
              placeholder={placeholder}
              members={members}
              context={context}
              onUploadImage={onUploadImage}
              onUploadPhoto={onUploadPhoto}
              onUploadDocument={onUploadDocument}
              imageStatus={imageStatus}
              onImageStatus={setImageStatus}
              onBlur={() => callbacks.current.onBlur?.()}
              onChange={(next) => {
                latest.current = next;
                callbacks.current.onChange(next);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EnrichedEditor({
  autoFocus = true,
  testId,
  initial,
  placeholder,
  members,
  context,
  onUploadImage,
  onUploadPhoto,
  onUploadDocument,
  imageStatus,
  onImageStatus,
  onBlur,
  onChange,
}: {
  autoFocus?: boolean;
  testId?: string;
  initial: string;
  placeholder?: string;
  members: RefObject<Mentionable[]>;
  context: RefObject<string | undefined>;
  onUploadImage?: EditorImageUpload;
  onUploadPhoto?: EditorImageUpload;
  onUploadDocument?: EditorDocumentUpload;
  imageStatus: ImageUploadStatus;
  onImageStatus(status: ImageUploadStatus): void;
  onBlur?(): void;
  onChange(markdown: string): void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onBlur, onChange });
  callbacks.current = { onBlur, onChange };
  const groupLabels = useMentionGroupLabels();
  const facetLabels = useMentionFacetLabels();
  const [fullSearch, setFullSearch] = useState<FullSearchRequest | null>(null);
  const imageUpload = useRef<EditorImageUpload | undefined>(onUploadImage);
  const enrichedEditor = useRef<Editor | null>(null);
  const uploadImage = useReadablePhotoUpload(onUploadImage, () => enrichedEditor.current?.state.doc);
  imageUpload.current = uploadImage;
  const documentUpload = useRef<EditorDocumentUpload | undefined>(onUploadDocument);
  documentUpload.current = onUploadDocument;
  const spreadsheetDrop = useSpreadsheetDropChoice();
  const spreadsheetChoice = useRef<ChooseSpreadsheetDrop | undefined>(spreadsheetDrop.choose);
  const imageStatusChange = useRef(onImageStatus);
  imageStatusChange.current = onImageStatus;
  const dropZone = useImageDropZone(true);

  const editor = useEditor({
    extensions: editorExtensions({
      imageControls: true,
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionFacetLabels: facetLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionContext: () => context.current,
      mentionOpenFull: (mentionEditor, query, range, selected) =>
        setFullSearch(insertMentionedResource(mentionEditor, { query, range, selected })),
    }),
    content: initial,
    contentType: "markdown",
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        "data-testid": "editor-writing-area",
        class: "markdown-content",
        "aria-label": t("editor.writeArea"),
      },
      ...imageTransferHandlers(imageUpload, imageStatusChange, documentUpload, spreadsheetChoice),
    },
    onUpdate: ({ editor: current }) => callbacks.current.onChange(current.getMarkdown()),
    onBlur: () => callbacks.current.onBlur?.(),
  });

  const state = useToolbarState(editor);
  const narrow = useNarrowLayout();
  const phone = usePhoneLayout();
  enrichedEditor.current = editor;
  usePhoneKeyboard(editor, phone);
  const images = useImageFiles({ editor, upload: uploadImage, uploadPhoto: onUploadPhoto, onStatus: onImageStatus });
  const frame = useRef<HTMLDivElement>(null);
  const phoneTools = Boolean(phone && editor && state);
  useEffect(() => {
    const tools = frame.current?.querySelector<HTMLElement>(".markdown-phone-toolbar");
    if (!phoneTools || !editor || !tools) return;
    return keepCaretBelowWritingTools(editor.view, tools);
  }, [phoneTools, editor]);

  return (
    <div
      ref={frame}
      className={cn("markdown-editor markdown-editor-large", phone && "markdown-editor-phone")}
      data-testid={testId ?? "markdown-editor-enriched"}
    >
      {images.inputs}
      {phone && editor && state ? (
        <PhoneWritingBar
          editor={editor}
          state={state}
          photo={
            <PhotoSheetButton choices={[...images.photos, ...images.uploads]} busy={imageStatus.kind === "uploading"} />
          }
          onReference={() => setFullSearch({ query: "" })}
        />
      ) : null}
      <div role="toolbar" aria-label={t("editor.enrich")} data-layout-flow hidden={phone}>
        {editor && state && !phone ? (
          <>
            <ToolbarButton
              label={t("editor.undo")}
              testId="editor-undo"
              disabled={!state.canUndo}
              onClick={() => writingChain(editor).undo().run()}
            >
              <UndoIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.redo")}
              testId="editor-redo"
              disabled={!state.canRedo}
              onClick={() => writingChain(editor).redo().run()}
            >
              <RedoIcon />
            </ToolbarButton>
            <span className="markdown-toolbar-separator" />
            <BlockTypeSelect editor={editor} value={state.blockType} />
            <span className="markdown-toolbar-separator" />
            <MarksButtons editor={editor} state={state} />
            <span className="markdown-toolbar-separator" />
            <ToolbarButton
              label={t("editor.bulletList")}
              testId="editor-bullet-list"
              active={state.bulletList}
              onClick={() => writingChain(editor).toggleBulletList().run()}
            >
              <ListBulletedIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.numberedList")}
              testId="editor-numbered-list"
              active={state.orderedList}
              onClick={() => writingChain(editor).toggleOrderedList().run()}
            >
              <ListNumberedIcon />
            </ToolbarButton>
            <span className="markdown-toolbar-separator" />
            <ListStructureButtons editor={editor} />
            <LinkControl editor={editor} active={state.link} />
            <ToolbarButton
              label={t("editor.insertTable")}
              testId="editor-insert-table"
              onClick={() => writingChain(editor).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.searchReferences")}
              testId="editor-insert-reference"
              onClick={() => setFullSearch({ query: "" })}
            >
              <ReferenceIcon />
            </ToolbarButton>
            <ImageMenuButton
              choices={narrow ? [...images.photos, ...images.uploads] : images.uploads}
              busy={imageStatus.kind === "uploading"}
            />
          </>
        ) : null}
      </div>
      <div className="markdown-editor-canvas" ref={canvas} {...dropZone.handlers}>
        <EditorContent editor={editor} className="markdown-editor-content" />
        {editor ? <TableControls editor={editor} canvasRef={canvas} /> : null}
        <ImageDropZone active={dropZone.active} documents={Boolean(onUploadDocument)} />
      </div>
      <ImageUploadStatusLine status={imageStatus} />
      {spreadsheetDrop.dialog}
      {fullSearch && editor ? (
        <EditorReferenceSearch
          editor={editor}
          request={fullSearch}
          mentionables={members}
          context={context}
          onClose={() => setFullSearch(null)}
        />
      ) : null}
    </div>
  );
}
