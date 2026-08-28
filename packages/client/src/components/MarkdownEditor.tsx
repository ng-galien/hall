import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  InsertImage,
  imagePlugin,
  insertMarkdown$,
  ListsToggle,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  usePublisher,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import type { Resource } from "@mairie/domain";
import { useI18n } from "../i18n/I18nProvider";
import { resourceContentHref } from "../services/resourcesApi";

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
  "toolbar.link": "Insérer un lien",
  "toolbar.image": "Insérer une image",
  "uploadImage.uploadInstructions": "Téléverser une image :",
  "uploadImage.addViaUrlInstructions": "Ou depuis une adresse :",
  "uploadImage.autoCompletePlaceholder": "Adresse de l’image",
  "uploadImage.alt": "Texte alternatif :",
  "uploadImage.title": "Titre :",
  "dialogControls.save": "Enregistrer",
  "dialogControls.cancel": "Annuler",
  "createLink.url": "Adresse",
  "createLink.title": "Titre",
  "createLink.saveTooltip": "Enregistrer le lien",
  "createLink.cancelTooltip": "Annuler",
  "linkPreview.open": "Ouvrir {{url}} dans un nouvel onglet",
  "linkPreview.edit": "Modifier le lien",
  "linkPreview.copyToClipboard": "Copier l’adresse",
  "linkPreview.copied": "Copiée",
  "linkPreview.remove": "Supprimer le lien",
};

function interpolate(template: string, interpolations?: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(interpolations?.[name] ?? ""));
}

function InsertResourceLink({ resources }: { resources: Resource[] }) {
  const insertMarkdown = usePublisher(insertMarkdown$);
  const { t } = useI18n();
  const documents = resources.filter((resource) => resource.kind === "document");
  if (documents.length === 0) return null;
  return (
    <select
      className="markdown-toolbar-attach"
      aria-label={t("editor.insertResource")}
      value=""
      onChange={async (event) => {
        const resource = documents.find((candidate) => candidate.id === event.target.value);
        if (!resource) return;
        const url = await resourceContentHref(resource.id);
        insertMarkdown(
          resource.mediaType.startsWith("image/") ? `![${resource.title}](${url})` : `[${resource.title}](${url})`,
        );
      }}
    >
      <option value="">{t("editor.insertResource")}</option>
      {documents.map((resource) => (
        <option key={resource.id} value={resource.id}>
          {resource.title}
        </option>
      ))}
    </select>
  );
}

export function MarkdownEditor({
  markdown,
  placeholder,
  onChange,
  onBlur,
  attachableResources,
  onUploadImage,
  readOnly = false,
}: {
  markdown: string;
  placeholder?: string;
  onChange(markdown: string): void;
  onBlur?(): void;
  /** Documents proposés par le bouton « Insérer une pièce » de la barre d'outils. */
  attachableResources?: Resource[];
  /** Active le téléversement d'images depuis l'éditeur ; retourne l'adresse de l'image stockée. */
  onUploadImage?(image: File): Promise<string>;
  readOnly?: boolean;
}) {
  const { locale } = useI18n();
  const plugins = [
    headingsPlugin({ allowedHeadingLevels: [2, 3] }),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    markdownShortcutPlugin(),
  ];
  if (onUploadImage) {
    plugins.push(
      imagePlugin({
        imageUploadHandler: onUploadImage,
        disableImageSettingsButton: true,
      }),
    );
  }
  plugins.push(
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
          <Separator />
          <CreateLink />
          {onUploadImage ? <InsertImage /> : null}
          {attachableResources ? <InsertResourceLink resources={attachableResources} /> : null}
        </>
      ),
    }),
  );
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
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(value, initialMarkdownNormalize) => {
        if (!initialMarkdownNormalize) onChange(value);
      }}
      onBlur={onBlur ? () => onBlur() : undefined}
      plugins={plugins}
    />
  );
}
