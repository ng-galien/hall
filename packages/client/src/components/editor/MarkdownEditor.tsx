import { imageWidthRange } from "@hall/templating";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import {
  BoldIcon,
  CardViewIcon,
  CodeIcon,
  FullscreenIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  RedoIcon,
  ReferenceIcon,
  TableIcon,
  UndoIcon,
} from "../icons";
import { editorExtensions } from "./extensions";
import type { ResourceImageAttributes } from "./images";
import { EditorReferenceSearch, type FullSearchRequest } from "./ReferenceSearchDialog";
import { referenceKindPresentations } from "./referenceKindPresentation";
import type { Mentionable } from "./references";
import { EditorResourceEmbedSearch } from "./resourceEmbeds";
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
    <button
      type="button"
      data-testid={testId}
      className={cn("markdown-toolbar-button", active && "is-active")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
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

function BlockTypeSelect({ editor, value }: { editor: Editor; value: string }) {
  const { t } = useI18n();
  const apply = (next: string) => {
    const chain = editor.chain().focus();
    if (editor.isActive("blockquote") && next !== "quote") chain.unsetBlockquote();
    if (next === "p") chain.setParagraph();
    if (next === "h2") chain.setHeading({ level: 2 });
    if (next === "h3") chain.setHeading({ level: 3 });
    if (next === "quote") chain.setBlockquote();
    chain.run();
  };
  return (
    <Select value={value} onValueChange={apply}>
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

function LinkControl({ editor, active }: { editor: Editor; active: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setOpen(false);
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="editor-link"
          className={cn("markdown-toolbar-button", active && "is-active")}
          title={t("editor.link")}
          aria-label={t("editor.link")}
          aria-pressed={active}
        >
          <LinkIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="markdown-link-popover">
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
        label={t("editor.code")}
        testId="editor-code"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon />
      </ToolbarButton>
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

/** Markdown editor with a compact inline mode and an enriched overlay, both editing the same markdown. */
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
  const inlineCanvas = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  const members = useRef<Mentionable[]>([]);
  members.current = mentionables ?? [];
  const context = useRef<string | undefined>(searchContext);
  context.current = searchContext;
  const groupLabels = useMentionGroupLabels();
  const facetLabels = useMentionFacetLabels();
  const [fullSearch, setFullSearch] = useState<FullSearchRequest | null>(null);

  const inline = useEditor({
    extensions: editorExtensions({
      imageControls: true,
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionFacetLabels: facetLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionContext: () => context.current,
      mentionOpenFull: (query, range) => setFullSearch({ query, range }),
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
        onChange={(next) => {
          latest.current = next;
          callbacks.current.onChange(next);
        }}
      />
    );
  }

  return (
    <>
      <div className="markdown-editor markdown-editor-compact" data-testid={testId ?? "markdown-editor-compact"}>
        <div role="toolbar" aria-orientation="vertical" aria-label={t("editor.writeArea")}>
          {inline && state ? <MarksButtons editor={inline} state={state} /> : null}
          {inline && state ? (
            <ToolbarButton
              label={t("editor.bulletList")}
              testId="editor-bullet-list"
              active={state.bulletList}
              onClick={() => inline.chain().focus().toggleBulletList().run()}
            >
              <ListBulletedIcon />
            </ToolbarButton>
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
            <span className="markdown-toolbar-end">
              <ToolbarButton label={t("editor.enrich")} testId="editor-open-enriched" onClick={() => setEnriched(true)}>
                <FullscreenIcon />
              </ToolbarButton>
            </span>
          )}
        </div>
        <div className="markdown-editor-canvas" ref={inlineCanvas}>
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
  onChange(markdown: string): void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const groupLabels = useMentionGroupLabels();
  const facetLabels = useMentionFacetLabels();
  const [fullSearch, setFullSearch] = useState<FullSearchRequest | null>(null);
  const [embedSearch, setEmbedSearch] = useState<FullSearchRequest | null>(null);
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
      mentionOpenFull: (query, range) => setFullSearch({ query, range }),
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
    onUpdate: ({ editor: current }) => callback.current(current.getMarkdown()),
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
            <ToolbarButton
              label={t("editor.embedResource")}
              testId="editor-insert-resource-embed"
              onClick={() => setEmbedSearch({ query: "" })}
            >
              <CardViewIcon />
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
      {embedSearch && editor ? (
        <EditorResourceEmbedSearch
          editor={editor}
          request={embedSearch}
          mentionables={members}
          context={context}
          onClose={() => setEmbedSearch(null)}
        />
      ) : null}
    </div>
  );
}
