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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import {
  BoldIcon,
  BoxedTextIcon,
  ChecklistIcon,
  EditIcon,
  FullscreenIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  OutdentIcon,
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
import { usePhoneEditorCommands } from "./phoneEditorCommands";
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
   * The text written on its own phone screen (a text of Documents, the report of an affaire): its tools stay fixed
   * under the header and its other commands join the « … » menu of the screen. Every other editor keeps its own tools.
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
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ChecklistIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.indent")}
        testId="editor-indent"
        disabled={!state?.canIndent}
        onClick={() => editor.chain().focus().sinkListItem(itemType).run()}
      >
        <IndentIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.outdent")}
        testId="editor-outdent"
        disabled={!state?.canOutdent}
        onClick={() => editor.chain().focus().liftListItem(itemType).run()}
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
  const chain = editor.chain().focus();
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
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    onDone();
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
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
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.italic")}
        testId="editor-italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.underline")}
        testId="editor-underline"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.code")}
        testId="editor-code"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <BoxedTextIcon />
      </ToolbarButton>
    </>
  );
}

function CompactFormattingMenu({
  editor,
  state,
  control,
}: {
  editor: Editor;
  state: NonNullable<ReturnType<typeof useToolbarState>>;
  /** On a phone the menu is opened from the « ⋯ » menu of the screen header and shows under the writing tools. */
  control?: { open: boolean; setOpen(open: boolean): void };
}) {
  const { t } = useI18n();
  const [ownOpen, setOwnOpen] = useState(false);
  const menuOpen = control ? control.open : ownOpen;
  const setMenuOpen = control ? control.setOpen : setOwnOpen;
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
  }, [editor, setMenuOpen]);

  const restoreEditorFocus = () => {
    requestAnimationFrame(() => editor.commands.focus());
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {control ? (
          <DropdownMenuTrigger asChild>
            <span className="markdown-phone-toolbar-anchor" aria-hidden="true" tabIndex={-1} />
          </DropdownMenuTrigger>
        ) : (
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
        )}
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
            onSelect={() => editor.chain().focus().undo().run()}
          >
            <UndoIcon />
            {t("editor.undo")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="whitespace-nowrap"
            disabled={!state.canRedo}
            data-testid="editor-formatting-redo"
            onSelect={() => editor.chain().focus().redo().run()}
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
            onSelect={() => editor.chain().focus().toggleBold().run()}
          >
            <BoldIcon />
            {t("editor.bold")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.italic}
            data-testid="editor-formatting-italic"
            onSelect={() => editor.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon />
            {t("editor.italic")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.underline}
            data-testid="editor-formatting-underline"
            onSelect={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon />
            {t("editor.underline")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.code}
            data-testid="editor-formatting-code"
            onSelect={() => editor.chain().focus().toggleCode().run()}
          >
            <BoxedTextIcon />
            {t("editor.code")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.bulletList}
            data-testid="editor-formatting-bullet-list"
            onSelect={() => editor.chain().focus().toggleBulletList().run()}
          >
            <ListBulletedIcon />
            {t("editor.bulletList")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.orderedList}
            data-testid="editor-formatting-numbered-list"
            onSelect={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListNumberedIcon />
            {t("editor.numberedList")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="whitespace-nowrap"
            checked={state.taskList}
            data-testid="editor-formatting-checklist"
            onSelect={() => editor.chain().focus().toggleTaskList().run()}
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
              editor
                .chain()
                .focus()
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
              editor
                .chain()
                .focus()
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
            onSelect={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon />
            {t("editor.insertTable")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent
          data-testid="editor-formatting-link-dialog"
          closeLabel={t("common.close")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreEditorFocus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("editor.link")}</DialogTitle>
          </DialogHeader>
          {linkOpen ? <LinkEditorForm editor={editor} active={state.link} onDone={() => setLinkOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
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

/** One text tool of the phone writing bar: a short word drawn as the tool does, such as a bold « G ». */
function PhoneTool({
  label,
  testId,
  active,
  className,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  active: boolean;
  className: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="plain"
      type="button"
      className={cn("markdown-phone-tool", className)}
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

// @implements-requirement HALL-FR-DOC-270
/**
 * The writing tools of a phone (choice 8B), fixed under the screen header while the text scrolls: bold, italic,
 * heading, bulleted list, then « Photo » at the right. The other formatting and the search of references are in the
 * « ⋯ » menu of the screen header; the full-screen editor is not offered, the text already fills the screen.
 */
function PhoneWritingBar({
  editor,
  state,
  photo,
  formatting,
}: {
  editor: Editor;
  state: NonNullable<ReturnType<typeof useToolbarState>>;
  photo: ReactNode;
  formatting: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div
      role="toolbar"
      aria-label={t("editor.formatting")}
      className="markdown-phone-toolbar"
      data-testid="editor-phone-toolbar"
    >
      {formatting}
      <PhoneTool
        label={t("editor.bold")}
        testId="editor-bold"
        active={state.bold}
        className="markdown-phone-tool-bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        {t("editor.boldShort")}
      </PhoneTool>
      <PhoneTool
        label={t("editor.italic")}
        testId="editor-italic"
        active={state.italic}
        className="markdown-phone-tool-italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        {t("editor.italicShort")}
      </PhoneTool>
      <PhoneTool
        label={t("editor.heading2")}
        testId="editor-heading"
        active={state.blockType === "h2"}
        className="markdown-phone-tool-heading"
        onClick={() => applyBlockType(editor, state.blockType === "h2" ? "p" : "h2")}
      >
        {t("editor.headingShort")}
      </PhoneTool>
      <PhoneTool
        label={t("editor.bulletList")}
        testId="editor-bullet-list"
        active={state.bulletList}
        className="markdown-phone-tool-list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        {`• ${t("editor.listShort")}`}
      </PhoneTool>
      {photo}
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
    media: t("search.facetMedia"),
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
  imageUpload.current = onUploadImage;
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
  const [formattingOpen, setFormattingOpen] = useState(false);

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

  const state = useToolbarState(inline);
  const images = useImageFiles({
    editor: inline && !readOnly ? inline : null,
    upload: onUploadImage,
    uploadPhoto: onUploadPhoto,
    onStatus: setImageStatus,
  });
  const imageBusy = imageStatus.kind === "uploading";
  const setCommands = usePhoneEditorCommands((store) => store.set);

  useEffect(() => {
    if (!phoneWriting || !inline) return;
    setCommands([
      {
        id: "editor-formatting",
        label: t("editor.formatting"),
        icon: <EditIcon />,
        onSelect: () => window.setTimeout(() => setFormattingOpen(true), 0),
      },
      {
        id: "editor-reference",
        label: t("editor.searchReferences"),
        icon: <ReferenceIcon />,
        onSelect: () => setFullSearch({ query: "" }),
      },
    ]);
    return () => setCommands([]);
  }, [phoneWriting, inline, setCommands, t]);

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
        {phoneWriting && inline && state ? (
          <PhoneWritingBar
            editor={inline}
            state={state}
            photo={<PhotoSheetButton choices={[...images.photos, ...images.uploads]} busy={imageBusy} />}
            formatting={
              <CompactFormattingMenu
                editor={inline}
                state={state}
                control={{ open: formattingOpen, setOpen: setFormattingOpen }}
              />
            }
          />
        ) : null}
        <div
          hidden={phoneWriting}
          role="toolbar"
          aria-label={t("editor.writeArea")}
          className="markdown-editor-compact-toolbar"
        >
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
  imageUpload.current = onUploadImage;
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
  const images = useImageFiles({ editor, upload: onUploadImage, uploadPhoto: onUploadPhoto, onStatus: onImageStatus });

  return (
    <div className="markdown-editor markdown-editor-large" data-testid={testId ?? "markdown-editor-enriched"}>
      {images.inputs}
      <div role="toolbar" aria-label={t("editor.enrich")}>
        {editor && state ? (
          <>
            <ToolbarButton
              label={t("editor.undo")}
              testId="editor-undo"
              disabled={!state.canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <UndoIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.redo")}
              testId="editor-redo"
              disabled={!state.canRedo}
              onClick={() => editor.chain().focus().redo().run()}
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
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <ListBulletedIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.numberedList")}
              testId="editor-numbered-list"
              active={state.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListNumberedIcon />
            </ToolbarButton>
            <span className="markdown-toolbar-separator" />
            <ListStructureButtons editor={editor} />
            <LinkControl editor={editor} active={state.link} />
            <ToolbarButton
              label={t("editor.insertTable")}
              testId="editor-insert-table"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
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
