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
  FullscreenIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  RedoIcon,
  ReferenceIcon,
  TableIcon,
  UnderlineIcon,
  UndoIcon,
} from "../icons";
import { editorExtensions } from "./extensions";
import { EditorReferenceSearch, type FullSearchRequest, SearchSyntaxHint } from "./ReferenceSearchDialog";
import type { Mentionable } from "./references";
import { TableControls } from "./TableControls";

export interface MarkdownEditorProps {
  markdown: string;
  /** Ce qu'on est en train d'écrire. C'est ce que la surimpression annonce — pas le nom du mode. */
  title?: string;
  placeholder?: string;
  onChange(markdown: string): void;
  onBlur?(): void;
  /** Entités proposées par la recherche `@` — membres, pièces, sujets, séances, délibérations. */
  mentionables?: Mentionable[];
  /** Le dossier du document en cours d'écriture : ce qui en est proche remonte en premier. */
  searchContext?: string;
  /** Active le téléversement d'images ; retourne l'adresse de l'image stockée. */
  onUploadImage?(image: File): Promise<string>;
  readOnly?: boolean;
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn("markdown-toolbar-button", active && "is-active")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Garde le focus dans la zone de texte : un clic d'outil agit sur la sélection courante.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Ce que la barre d'outils reflète de la sélection courante. */
function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: (context) => {
      const current = context.editor;
      if (!current) return null;
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
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

/** Choix du style de bloc : paragraphe, titres autorisés, citation. */
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
      <SelectTrigger size="sm" aria-label={t("editor.blockType")} className="markdown-toolbar-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="p">{t("editor.paragraph")}</SelectItem>
        <SelectItem value="h2">{t("editor.heading2")}</SelectItem>
        <SelectItem value="h3">{t("editor.heading3")}</SelectItem>
        <SelectItem value="quote">{t("editor.quote")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Pose ou retire un lien sur la sélection, adresse saisie en survol du bouton. */
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
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label={t("editor.italic")}
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolbarButton>
    </>
  );
}

/** Les intitulés des groupes du menu `@`, dans la langue de l'interface. */
function useMentionGroupLabels() {
  const { t } = useI18n();
  return {
    member: t("editor.group.member"),
    resource: t("editor.group.resource"),
    councilBusiness: t("editor.group.councilBusiness"),
    meeting: t("editor.group.meeting"),
    decision: t("editor.group.decision"),
  };
}

/**
 * Deux modalités d'écriture, pour ne pas imposer une barre d'outils complète sur chaque champ :
 * en ligne on écrit vite, avec le strict minimum ; l'édition enrichie s'ouvre en surimpression.
 * Les deux modifient le même markdown et remontent leurs changements au même `onChange`.
 */
export function MarkdownEditor({
  markdown,
  title,
  placeholder,
  onChange,
  onBlur,
  mentionables,
  searchContext,
  readOnly = false,
}: MarkdownEditorProps) {
  const { t } = useI18n();
  const [enriched, setEnriched] = useState(false);
  /* L'appelant tient souvent sa prop `markdown` à la valeur persistée : la suivre après le
     montage effacerait la saisie en cours. On garde donc la dernière version écrite ici, et
     c'est elle qui circule entre les deux modalités. */
  const latest = useRef(markdown);
  const inlineCanvas = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  /* Les listes arrivent souvent après le montage : l'éditeur lit cet accesseur au moment
     du `@`, jamais une valeur figée à la création. */
  const members = useRef<Mentionable[]>([]);
  members.current = mentionables ?? [];
  const context = useRef<string | undefined>(searchContext);
  context.current = searchContext;
  const groupLabels = useMentionGroupLabels();
  const [fullSearch, setFullSearch] = useState<FullSearchRequest | null>(null);

  const inline = useEditor({
    extensions: editorExtensions({
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionSearchHint: <SearchSyntaxHint />,
      mentionContext: () => context.current,
      mentionOpenFull: (query, range) => setFullSearch({ query, range }),
    }),
    content: markdown,
    contentType: "markdown",
    editable: !readOnly,
    editorProps: {
      attributes: { class: "markdown-content", "aria-label": t("editor.writeArea") },
    },
    onUpdate: ({ editor }) => {
      latest.current = editor.getMarkdown();
      callbacks.current.onChange(latest.current);
    },
    onBlur: () => callbacks.current.onBlur?.(),
  });

  useEffect(() => {
    inline?.setEditable(!readOnly);
  }, [inline, readOnly]);

  const state = useToolbarState(inline);

  return (
    <>
      <div className="markdown-editor markdown-editor-compact">
        <div role="toolbar" aria-orientation="vertical" aria-label={t("editor.writeArea")}>
          {inline && state ? <MarksButtons editor={inline} state={state} /> : null}
          {inline && state ? (
            <ToolbarButton
              label={t("editor.bulletList")}
              active={state.bulletList}
              onClick={() => inline.chain().focus().toggleBulletList().run()}
            >
              <ListBulletedIcon />
            </ToolbarButton>
          ) : null}
          {inline && !readOnly ? (
            <ToolbarButton label={t("editor.searchReferences")} onClick={() => setFullSearch({ query: "" })}>
              <ReferenceIcon />
            </ToolbarButton>
          ) : null}
          {readOnly ? null : (
            <span className="markdown-toolbar-end">
              <ToolbarButton label={t("editor.enrich")} onClick={() => setEnriched(true)}>
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
          // Au retour, l'éditeur en ligne adopte le texte écrit en surimpression.
          if (!open) inline?.commands.setContent(latest.current, { contentType: "markdown" });
        }}
      >
        <DialogContent className="markdown-editor-dialog" closeLabel={t("common.close")}>
          <DialogHeader className="markdown-editor-dialog-header">
            <DialogTitle>{title ?? t("editor.enrich")}</DialogTitle>
          </DialogHeader>
          {enriched ? (
            <EnrichedEditor
              initial={latest.current}
              placeholder={placeholder}
              members={members}
              context={context}
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

/** L'éditeur de la surimpression : barre complète en haut, il naît et meurt avec elle. */
function EnrichedEditor({
  initial,
  placeholder,
  members,
  context,
  onChange,
}: {
  initial: string;
  placeholder?: string;
  members: RefObject<Mentionable[]>;
  context: RefObject<string | undefined>;
  onChange(markdown: string): void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const groupLabels = useMentionGroupLabels();
  const [fullSearch, setFullSearch] = useState<FullSearchRequest | null>(null);

  const editor = useEditor({
    extensions: editorExtensions({
      placeholder,
      mentionables: () => members.current,
      mentionGroupLabels: groupLabels,
      mentionSearchAllLabel: t("editor.searchAll"),
      mentionSearchHint: <SearchSyntaxHint />,
      mentionContext: () => context.current,
      mentionOpenFull: (query, range) => setFullSearch({ query, range }),
    }),
    content: initial,
    contentType: "markdown",
    autofocus: true,
    editorProps: {
      attributes: { class: "markdown-content", "aria-label": t("editor.writeArea") },
    },
    onUpdate: ({ editor: current }) => callback.current(current.getMarkdown()),
  });

  const state = useToolbarState(editor);

  return (
    <div className="markdown-editor markdown-editor-large">
      <div role="toolbar" aria-label={t("editor.enrich")}>
        {editor && state ? (
          <>
            <ToolbarButton
              label={t("editor.undo")}
              disabled={!state.canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <UndoIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.redo")}
              disabled={!state.canRedo}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <RedoIcon />
            </ToolbarButton>
            <span className="markdown-toolbar-separator" />
            <BlockTypeSelect editor={editor} value={state.blockType} />
            <span className="markdown-toolbar-separator" />
            <MarksButtons editor={editor} state={state} />
            <ToolbarButton
              label={t("editor.underline")}
              active={state.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon />
            </ToolbarButton>
            <span className="markdown-toolbar-separator" />
            <ToolbarButton
              label={t("editor.bulletList")}
              active={state.bulletList}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <ListBulletedIcon />
            </ToolbarButton>
            <ToolbarButton
              label={t("editor.numberedList")}
              active={state.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListNumberedIcon />
            </ToolbarButton>
            <span className="markdown-toolbar-separator" />
            <LinkControl editor={editor} active={state.link} />
            <ToolbarButton
              label={t("editor.insertTable")}
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon />
            </ToolbarButton>
            <ToolbarButton label={t("editor.searchReferences")} onClick={() => setFullSearch({ query: "" })}>
              <ReferenceIcon />
            </ToolbarButton>
          </>
        ) : null}
      </div>
      <div className="markdown-editor-canvas" ref={canvas}>
        <EditorContent editor={editor} className="markdown-editor-content" />
        {editor ? <TableControls editor={editor} canvasRef={canvas} /> : null}
      </div>
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
