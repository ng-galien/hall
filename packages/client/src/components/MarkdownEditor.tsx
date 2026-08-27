import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  headingsPlugin,
  ListsToggle,
  listsPlugin,
  MDXEditor,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useI18n } from "../i18n/I18nProvider";

const frenchToolbar: Record<string, string> = {
  "toolbar.undo": "Annuler",
  "toolbar.redo": "Rétablir",
  "toolbar.bold": "Gras",
  "toolbar.removeBold": "Retirer le gras",
  "toolbar.italic": "Italique",
  "toolbar.removeItalic": "Retirer l’italique",
  "toolbar.underline": "Souligné",
  "toolbar.removeUnderline": "Retirer le souligné",
  "toolbar.bulletedList": "Liste à puces",
  "toolbar.numberedList": "Liste numérotée",
  "toolbar.checkList": "Liste de cases",
  "toolbar.blockTypeSelect.placeholder": "Style",
  "toolbar.blockTypeSelect.selectBlockTypeTooltip": "Choisir le style du bloc",
  "toolbar.blockTypes.paragraph": "Paragraphe",
  "toolbar.blockTypes.quote": "Citation",
  "toolbar.blockTypes.heading": "Titre {{level}}",
};

function interpolate(template: string, interpolations?: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(interpolations?.[name] ?? ""));
}

export function MarkdownEditor({
  markdown,
  placeholder,
  onChange,
  onBlur,
}: {
  markdown: string;
  placeholder?: string;
  onChange(markdown: string): void;
  onBlur?(): void;
}) {
  const { locale } = useI18n();
  return (
    <MDXEditor
      className="markdown-editor"
      translation={
        locale === "fr"
          ? (key, defaultValue, interpolations) =>
              interpolate(frenchToolbar[key] ?? defaultValue, interpolations as Record<string, unknown>)
          : undefined
      }
      contentEditableClassName="markdown-content"
      markdown={markdown}
      placeholder={placeholder}
      onChange={(value, initialMarkdownNormalize) => {
        if (!initialMarkdownNormalize) onChange(value);
      }}
      onBlur={onBlur ? () => onBlur() : undefined}
      plugins={[
        headingsPlugin({ allowedHeadingLevels: [2, 3] }),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BoldItalicUnderlineToggles />
              <Separator />
              <ListsToggle options={["bullet", "number"]} />
              <Separator />
              <BlockTypeSelect />
            </>
          ),
        }),
      ]}
    />
  );
}
