import {
  type ImageAlignment,
  imageWidthRange,
  isImageAlignment,
  isImageDirective,
  isImageWidth,
} from "@hall/templating";
import { mergeAttributes, Node } from "@tiptap/core";
import { type Editor, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from "@tiptap/react";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useState,
} from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { AlignCenterIcon, AlignLeftIcon, FullscreenIcon } from "../icons";

export interface ResourceImageAttributes {
  id: string;
  alt: string;
  align: ImageAlignment;
  width: number;
}

/** Inserts the image as an atomic block and selects it. */
export function insertResourceImage(editor: Editor, attributes: ResourceImageAttributes) {
  editor.chain().focus().insertContent({ type: "resourceImage", attrs: attributes }).run();
  const cursor = editor.state.selection.from;
  let position: number | null = null;
  editor.state.doc.nodesBetween(0, cursor, (node, nodePosition) => {
    if (node.type.name === "resourceImage" && node.attrs.id === attributes.id) position = nodePosition;
  });
  if (position !== null) editor.commands.setNodeSelection(position);
}

type ResourceImageResolver = (resourceId: string) => Promise<string>;
type ResourceImagePreviewRenderer = (resourceId: string, onClose: () => void) => ReactNode;

const ResourceImageResolverContext = createContext<ResourceImageResolver | null>(null);
const ResourceImagePreviewContext = createContext<ResourceImagePreviewRenderer | null>(null);

export function ResourceImagePresentationProvider({
  resolveContentHref,
  renderResourcePreview,
  children,
}: {
  resolveContentHref: ResourceImageResolver;
  renderResourcePreview: ResourceImagePreviewRenderer;
  children: ReactNode;
}) {
  return (
    <ResourceImageResolverContext.Provider value={resolveContentHref}>
      <ResourceImagePreviewContext.Provider value={renderResourcePreview}>
        {children}
      </ResourceImagePreviewContext.Provider>
    </ResourceImageResolverContext.Provider>
  );
}

function unescapeLabel(value: string): string {
  return value.replace(/\\([\\\]])/g, "$1");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").trim();
}

function attribute(source: string, name: string): string | undefined {
  if (name === "id") return /(?:^|\s)#([^\s}]+)/.exec(source)?.[1];
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|([^\\s}]+))`).exec(source);
  return match?.[1] ?? match?.[2];
}

export function parseImageDirective(source: string): (ResourceImageAttributes & { raw: string }) | null {
  const match = /^::image\[((?:\\.|[^\]])*)\]\{([^}]*)\}/.exec(source);
  if (!match || !isImageDirective("image")) return null;
  const id = attribute(match[2], "id");
  if (!id) return null;
  const rawAlign = attribute(match[2], "align") ?? "left";
  const rawWidth = attribute(match[2], "width") ?? String(imageWidthRange.default);
  return {
    raw: match[0],
    id,
    alt: unescapeLabel(match[1]),
    align: isImageAlignment(rawAlign) ? rawAlign : "left",
    width: isImageWidth(rawWidth) ? Number(rawWidth) : imageWidthRange.default,
  };
}

export function serializeImageDirective(attributes: ResourceImageAttributes): string {
  const align = isImageAlignment(attributes.align) ? attributes.align : "left";
  const width = Math.round(
    Math.min(imageWidthRange.max, Math.max(imageWidthRange.min, attributes.width || imageWidthRange.default)),
  );
  return `::image[${escapeLabel(attributes.alt)}]{#${attributes.id} align="${align}" width="${width}"}`;
}

function useResourceImageHref(resourceId: string) {
  const resolve = useContext(ResourceImageResolverContext);
  const [state, setState] = useState<{ href: string | null; failed: boolean }>({ href: null, failed: false });
  useEffect(() => {
    let active = true;
    setState({ href: null, failed: false });
    if (!resolve) {
      setState({ href: null, failed: true });
      return () => {
        active = false;
      };
    }
    void resolve(resourceId).then(
      (href) => active && setState({ href, failed: false }),
      () => active && setState({ href: null, failed: true }),
    );
    return () => {
      active = false;
    };
  }, [resolve, resourceId]);
  return state;
}

function imageClass(align: ImageAlignment): string {
  return `hall-template-image hall-template-image-${align}`;
}

export function ResourceImageFigure({
  id,
  alt,
  align,
  width,
  className,
}: ResourceImageAttributes & { className?: string }) {
  const { t } = useI18n();
  const { href, failed } = useResourceImageHref(id);
  const style = { width: `${width}%` } satisfies CSSProperties;
  if (failed) {
    return (
      <span
        className={`hall-template-image-fallback hall-template-image-${align} ${className ?? ""}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        {t("editor.imageUnavailable")}
      </span>
    );
  }
  if (!href) {
    return (
      <span
        className={`hall-template-image-loading hall-template-image-${align} ${className ?? ""}`}
        style={style}
        aria-hidden="true"
      />
    );
  }
  return <img className={`${imageClass(align)} ${className ?? ""}`} src={href} alt={alt} style={style} />;
}

function ResourceImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  controls,
}: NodeViewProps & { controls: boolean }) {
  const { t } = useI18n();
  const attributes = node.attrs as ResourceImageAttributes;
  const [previewing, setPreviewing] = useState(false);
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isEditable ?? false,
  });
  const renderResourcePreview = useContext(ResourceImagePreviewContext);
  const updateWidth = (width: number) =>
    updateAttributes({ width: Math.round(Math.min(imageWidthRange.max, Math.max(imageWidthRange.min, width))) });
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = attributes.width;
    const canvasWidth = event.currentTarget.closest(".markdown-editor-canvas")?.clientWidth ?? 1;
    const move = (next: PointerEvent) => updateWidth(startWidth + ((next.clientX - startX) / canvasWidth) * 100);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  return (
    <NodeViewWrapper
      className="editor-image-node"
      data-resource-id={attributes.id}
      data-selected={(controls && selected) || undefined}
    >
      <figure
        className={`editor-image-frame hall-template-image-${attributes.align}`}
        style={{ width: `${attributes.width}%` }}
      >
        <ResourceImageFigure {...attributes} width={100} />
        {controls && selected && editable ? (
          <div className="editor-image-controls" data-testid="editor-image-controls" contentEditable={false}>
            <fieldset className="editor-image-alignment">
              <legend className="sr-only">{t("editor.imageAlignment")}</legend>
              <button
                type="button"
                data-testid="editor-image-align-left"
                aria-label={t("editor.imageAlignLeft")}
                aria-pressed={attributes.align === "left"}
                onClick={() => updateAttributes({ align: "left" })}
              >
                <AlignLeftIcon />
                <span className="sr-only">{t("editor.imageAlignLeft")}</span>
              </button>
              <button
                type="button"
                data-testid="editor-image-align-center"
                aria-label={t("editor.imageAlignCenter")}
                aria-pressed={attributes.align === "center"}
                onClick={() => updateAttributes({ align: "center" })}
              >
                <AlignCenterIcon />
                <span className="sr-only">{t("editor.imageAlignCenter")}</span>
              </button>
            </fieldset>
            {renderResourcePreview ? (
              <button
                type="button"
                data-testid="editor-image-open"
                className="editor-image-open"
                aria-label={t("editor.imageOpen")}
                title={t("editor.imageOpen")}
                onClick={() => setPreviewing(true)}
              >
                <FullscreenIcon />
                <span className="sr-only">{t("editor.imageOpen")}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {controls && selected && editable ? (
          <button
            type="button"
            data-testid="editor-image-width"
            className="editor-image-resize"
            role="slider"
            aria-label={t("editor.imageResize")}
            aria-valuemin={imageWidthRange.min}
            aria-valuemax={imageWidthRange.max}
            aria-valuenow={attributes.width}
            onPointerDown={startResize}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              event.stopPropagation();
              updateWidth(attributes.width + (event.key === "ArrowRight" ? 5 : -5));
            }}
          />
        ) : null}
      </figure>
      {controls && previewing ? renderResourcePreview?.(attributes.id, () => setPreviewing(false)) : null}
    </NodeViewWrapper>
  );
}

export const ResourceImage = Node.create<{ controls: boolean }>({
  name: "resourceImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { controls: false };
  },

  addAttributes() {
    return {
      id: { default: null },
      alt: { default: "" },
      align: { default: "left" },
      width: { default: imageWidthRange.default },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-resource-image]",
        getAttrs: (element) => ({
          id: element.getAttribute("data-resource-id"),
          alt: element.getAttribute("data-alt") ?? "",
          align: element.getAttribute("data-align") ?? "left",
          width: Number(element.getAttribute("data-width") ?? imageWidthRange.default),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-resource-image": "",
        "data-resource-id": node.attrs.id,
        "data-alt": node.attrs.alt,
        "data-align": node.attrs.align,
        "data-width": node.attrs.width,
      }),
    ];
  },

  addNodeView() {
    const controls = this.options.controls;
    return ReactNodeViewRenderer((props) => <ResourceImageNodeView {...props} controls={controls} />);
  },

  markdownTokenizer: {
    name: "resourceImage",
    level: "block",
    start: (source: string) => source.indexOf("::image["),
    tokenize: (source: string) => {
      const parsed = parseImageDirective(source);
      return parsed ? { type: "resourceImage", ...parsed } : undefined;
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("resourceImage", {
      id: token.id,
      alt: token.alt,
      align: token.align,
      width: token.width,
    }),
  renderMarkdown: (node) => serializeImageDirective(node.attrs as ResourceImageAttributes),
});
