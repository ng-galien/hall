import { imageWidthRange } from "@hall/templating";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { type FormEvent, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
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
import type { ResourceImageAttributes } from "./images";
import { EditorReferenceSearch, type FullSearchRequest } from "./ReferenceSearchDialog";
import { referenceKindPresentations } from "./referenceKindPresentation";
import type { Mentionable } from "./references";
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
  readOnly?: boolean;
  /** Renders the enriched body directly when an outer surface already provides the extended envelope. */
  variant?: "compact" | "enriched";
}

const acceptedImageTypes = new Set(["image/jpeg", "image/png"]);
const compactFormattingMenuHoldDelay = 1000;
const compactToolbarIdleDelay = 2400;
const compactToolbarLeaveDelay = 900;

function imageAttributes(image: { id: string; label: string }): ResourceImageAttributes {
  return { id: image.id, alt: image.label, align: "left", width: imageWidthRange.default };
}

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
        <button
          type="button"
          data-testid={testId}
          className={cn("markdown-toolbar-button", active && "is-active")}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="markdown-editor-toolbar-tooltip">{label}</TooltipContent>
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
      <SelectTrigger data-testid="editor-block-style" size="sm" aria-label={t("editor.blockType")}>
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
      <label htmlFor="markdown-link-url">
        {t("editor.linkUrl")}
        <Input
          id="markdown-link-url"
          type="url"
          value={url}
          placeholder="https://…"
          autoFocus
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <div className="markdown-link-popover-actions">
        {active ? (
          <button type="button" className="markdown-toolbar-text-button" onClick={remove}>
            {t("editor.linkRemove")}
          </button>
        ) : null}
        <button type="submit" className="markdown-toolbar-text-button is-primary">
          {t("editor.linkApply")}
        </button>
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
            <button
              type="button"
              data-testid="editor-link"
              className={cn("markdown-toolbar-button", active && "is-active")}
              aria-label={t("editor.link")}
              aria-pressed={active}
            >
              <LinkIcon />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="markdown-editor-toolbar-tooltip">{t("editor.link")}</TooltipContent>
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
  onOpenChange,
}: {
  editor: Editor;
  state: NonNullable<ReturnType<typeof useToolbarState>>;
  onOpenChange(open: boolean): void;
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
        if (controlPressed && editor.isFocused) {
          setMenuOpen(true);
          onOpenChange(true);
        }
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
  }, [editor, onOpenChange]);

  const restoreEditorFocus = () => {
    requestAnimationFrame(() => editor.commands.focus());
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          onOpenChange(open);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="markdown-toolbar-button"
                data-testid="editor-formatting-menu"
                aria-label={t("editor.formatting")}
                onMouseDown={(event) => event.preventDefault()}
              >
                <EditIcon />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className="markdown-editor-toolbar-tooltip">{t("editor.formatting")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="right"
          align="start"
          className="markdown-formatting-menu z-[var(--hall-z-editor-popup)] w-max"
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
  readOnly = false,
  variant = "compact",
}: MarkdownEditorProps) {
  const { t } = useI18n();
  const [enriched, setEnriched] = useState(false);
  const [imageStatus, setImageStatus] = useState<"idle" | "uploading" | "failed">("idle");
  const latest = useRef(markdown);
  const compactEditor = useRef<HTMLDivElement>(null);
  const compactToolbar = useRef<HTMLDivElement>(null);
  const inlineCanvas = useRef<HTMLDivElement>(null);
  const [compactToolbarTop, setCompactToolbarTop] = useState<number | null>(null);
  const [compactToolbarVisible, setCompactToolbarVisible] = useState(false);
  const compactToolbarHideTimer = useRef<number | null>(null);
  const compactToolbarInteractionOpen = useRef(false);
  const compactToolbarHasFocus = useRef(false);
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

  const cancelCompactToolbarHide = useCallback(() => {
    if (compactToolbarHideTimer.current !== null) window.clearTimeout(compactToolbarHideTimer.current);
    compactToolbarHideTimer.current = null;
  }, []);

  const hideCompactToolbar = useCallback(() => {
    cancelCompactToolbarHide();
    if (!compactToolbarInteractionOpen.current && !compactToolbarHasFocus.current) setCompactToolbarVisible(false);
  }, [cancelCompactToolbarHide]);

  const revealCompactToolbar = useCallback(
    (hideAfter: number | null = compactToolbarIdleDelay) => {
      if (readOnly || variant !== "compact") return;
      cancelCompactToolbarHide();
      setCompactToolbarVisible(true);
      if (hideAfter !== null) {
        compactToolbarHideTimer.current = window.setTimeout(() => {
          compactToolbarHideTimer.current = null;
          if (!compactToolbarInteractionOpen.current && !compactToolbarHasFocus.current) {
            setCompactToolbarVisible(false);
          }
        }, hideAfter);
      }
    },
    [cancelCompactToolbarHide, readOnly, variant],
  );

  const handleCompactMenuOpenChange = useCallback(
    (open: boolean) => {
      compactToolbarInteractionOpen.current = open;
      revealCompactToolbar(open ? null : compactToolbarLeaveDelay);
    },
    [revealCompactToolbar],
  );

  useEffect(() => cancelCompactToolbarHide, [cancelCompactToolbarHide]);

  const inline = useEditor({
    extensions: editorExtensions({
      imageControls: true,
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionFacetLabels: facetLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionContext: () => context.current,
      mentionOpenFull: (query, range, selected) => setFullSearch({ query, range, selected }),
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
    },
    onUpdate: ({ editor }) => {
      hideCompactToolbar();
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

  useEffect(() => {
    const container = compactEditor.current;
    const toolbar = compactToolbar.current;
    if (!inline || !container || !toolbar || readOnly || variant !== "compact") return;
    let frame: number | null = null;
    const updatePosition = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const coordinates = inline.view.coordsAtPos(inline.state.selection.head);
        const containerBounds = container.getBoundingClientRect();
        const toolbarBounds = toolbar.getBoundingClientRect();
        const firstControlBounds = toolbar.querySelector("button")?.getBoundingClientRect();
        const caretCenter = coordinates.top + (coordinates.bottom - coordinates.top) / 2;
        const firstControlCenter = firstControlBounds
          ? firstControlBounds.top - toolbarBounds.top + firstControlBounds.height / 2
          : 0;
        const requestedTop = caretCenter - containerBounds.top - firstControlCenter;
        const inset = Number.parseFloat(getComputedStyle(container).getPropertyValue("--hall-space-1")) || 4;
        const maximumTop = Math.max(inset, containerBounds.height - toolbarBounds.height - inset);
        setCompactToolbarTop(Math.min(maximumTop, Math.max(inset, requestedTop)));
      });
    };
    const observer = new ResizeObserver(updatePosition);
    const handleFocus = () => revealCompactToolbar();
    observer.observe(container);
    observer.observe(toolbar);
    inline.on("selectionUpdate", updatePosition);
    inline.on("update", updatePosition);
    inline.on("focus", handleFocus);
    updatePosition();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      inline.off("selectionUpdate", updatePosition);
      inline.off("update", updatePosition);
      inline.off("focus", handleFocus);
    };
  }, [inline, readOnly, revealCompactToolbar, variant]);

  const state = useToolbarState(inline);

  if (variant === "enriched" && !readOnly) {
    return (
      <EnrichedEditor
        testId={testId}
        initial={latest.current}
        placeholder={placeholder}
        members={members}
        context={context}
        onUploadImage={onUploadImage}
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
        className="markdown-editor markdown-editor-compact"
        data-testid={testId ?? "markdown-editor-compact"}
      >
        <div
          ref={compactToolbar}
          role="toolbar"
          aria-orientation="vertical"
          aria-label={t("editor.writeArea")}
          aria-hidden={!compactToolbarVisible}
          className={cn("markdown-editor-compact-toolbar", compactToolbarVisible && "is-visible")}
          data-visible={compactToolbarVisible ? "true" : "false"}
          style={compactToolbarTop === null ? undefined : { top: compactToolbarTop }}
          onPointerEnter={() => revealCompactToolbar(null)}
          onPointerLeave={() => revealCompactToolbar(compactToolbarLeaveDelay)}
          onFocusCapture={() => {
            compactToolbarHasFocus.current = true;
            revealCompactToolbar(null);
          }}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            compactToolbarHasFocus.current = false;
            revealCompactToolbar(compactToolbarInteractionOpen.current ? null : compactToolbarLeaveDelay);
          }}
        >
          {inline && state && !readOnly ? (
            <CompactFormattingMenu editor={inline} state={state} onOpenChange={handleCompactMenuOpenChange} />
          ) : null}
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
        </div>
        <div
          className="markdown-editor-canvas"
          ref={inlineCanvas}
          onClickCapture={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("[data-editor-table-control], .column-resize-handle"))
              return;
            revealCompactToolbar();
          }}
        >
          <EditorContent editor={inline} className="markdown-editor-content" />
          {inline ? <TableControls editor={inline} canvasRef={inlineCanvas} /> : null}
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
  testId,
  initial,
  placeholder,
  members,
  context,
  onUploadImage,
  imageStatus,
  onImageStatus,
  onBlur,
  onChange,
}: {
  testId?: string;
  initial: string;
  placeholder?: string;
  members: RefObject<Mentionable[]>;
  context: RefObject<string | undefined>;
  onUploadImage?: (image: File) => Promise<{ id: string; label: string }>;
  imageStatus: "idle" | "uploading" | "failed";
  onImageStatus(status: "idle" | "uploading" | "failed"): void;
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
  const imageUpload = useRef(onUploadImage);
  imageUpload.current = onUploadImage;

  const editor = useEditor({
    extensions: editorExtensions({
      imageControls: true,
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionFacetLabels: facetLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionContext: () => context.current,
      mentionOpenFull: (query, range, selected) => setFullSearch({ query, range, selected }),
    }),
    content: initial,
    contentType: "markdown",
    autofocus: true,
    editorProps: {
      attributes: {
        "data-testid": "editor-writing-area",
        class: "markdown-content",
        "aria-label": t("editor.writeArea"),
      },
      handleDrop: (view, event) => {
        const file = event.dataTransfer
          ? [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith("image/"))
          : undefined;
        if (!file) return false;
        event.preventDefault();
        const upload = imageUpload.current;
        if (!upload || !acceptedImageTypes.has(file.type)) {
          onImageStatus("failed");
          return true;
        }
        const dropPosition = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        onImageStatus("uploading");
        void upload(file).then(
          (image) => {
            const position = Math.min(dropPosition ?? view.state.selection.from, view.state.doc.content.size);
            const node = view.state.schema.nodes.resourceImage.create(imageAttributes(image));
            const transaction = view.state.tr
              .setSelection(Selection.near(view.state.doc.resolve(position)))
              .replaceSelectionWith(node);
            let insertedPosition: number | null = null;
            transaction.doc.descendants((candidate, candidatePosition) => {
              if (candidate.type === node.type && candidate.attrs.id === image.id) {
                insertedPosition = candidatePosition;
                return false;
              }
              return true;
            });
            if (insertedPosition === null) {
              onImageStatus("failed");
              return;
            }
            transaction.setSelection(NodeSelection.create(transaction.doc, insertedPosition));
            view.dispatch(transaction);
            onImageStatus("idle");
          },
          () => onImageStatus("failed"),
        );
        return true;
      },
    },
    onUpdate: ({ editor: current }) => callbacks.current.onChange(current.getMarkdown()),
    onBlur: () => callbacks.current.onBlur?.(),
  });

  const state = useToolbarState(editor);

  return (
    <div className="markdown-editor markdown-editor-large" data-testid={testId ?? "markdown-editor-enriched"}>
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
          </>
        ) : null}
      </div>
      <div className="markdown-editor-canvas" ref={canvas}>
        <EditorContent editor={editor} className="markdown-editor-content" />
        {editor ? <TableControls editor={editor} canvasRef={canvas} /> : null}
      </div>
      {imageStatus !== "idle" ? (
        <p className="markdown-image-status" role={imageStatus === "failed" ? "alert" : "status"}>
          {t(imageStatus === "uploading" ? "editor.imageUploading" : "editor.imageUploadFailed")}
        </p>
      ) : null}
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
