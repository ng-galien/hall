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
  useRef,
  useState,
} from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { AlignCenterIcon, AlignLeftIcon, BothDirectionsIcon } from "../icons";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { LoadingIndicator } from "../ui/loading-indicator";
import { EditorMediaOverlay } from "./EditorMediaOverlay";
import { imageUploadPlaceholders, sentImageRatio } from "./imageUploadPlaceholder";
import { useResourceAppearance } from "./references";

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
  testId,
}: ResourceImageAttributes & { className?: string; testId?: string }) {
  const { t } = useI18n();
  const { href, failed } = useResourceImageHref(id);
  const ratio = sentImageRatio(id);
  const style = { width: `${width}%`, ...(ratio ? { aspectRatio: String(ratio) } : {}) } satisfies CSSProperties;
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
  if (!href && ratio) {
    return (
      <span
        className={`editor-image-placeholder hall-template-image-${align} ${className ?? ""}`}
        style={{ width: `${width}%` }}
        data-testid="editor-image-placeholder"
      >
        <LoadingIndicator aria-hidden="true" />
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
  return (
    <img
      data-testid={testId}
      className={`${imageClass(align)} ${className ?? ""}`}
      src={href}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={style}
    />
  );
}

/** Widths, in percent of the text, offered on a phone in place of the resize handle. */
const phoneImageWidths = [
  { width: 33, labelKey: "editor.imageWidthSmall", testId: "editor-image-width-small" },
  { width: 66, labelKey: "editor.imageWidthMedium", testId: "editor-image-width-medium" },
  { width: 100, labelKey: "editor.imageWidthFull", testId: "editor-image-width-full" },
] as const;

// @implements-requirement HALL-FR-LAY-010
/** On a phone, the width of an image of a text is chosen among a few widths in the commands of the image. */
function PhoneImageWidthMenu({ width, onChange }: { width: number; onChange(width: number): void }) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="plain" size="icon" data-testid="editor-image-width-menu" aria-label={t("editor.imageResize")}>
          <BothDirectionsIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max">
        <DropdownMenuRadioGroup value={String(width)} onValueChange={(value) => onChange(Number(value))}>
          {phoneImageWidths.map((choice) => (
            <DropdownMenuRadioItem key={choice.width} value={String(choice.width)} data-testid={choice.testId}>
              {t(choice.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResourceImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  controls,
  deleteNode,
}: NodeViewProps & { controls: boolean }) {
  const { t } = useI18n();
  const attributes = node.attrs as ResourceImageAttributes;
  const [previewing, setPreviewing] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewScrollRef = useRef({ x: 0, y: 0 });
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isEditable ?? false,
  });
  const renderResourcePreview = useContext(ResourceImagePreviewContext);
  const phone = usePhoneLayout();
  const resourceAppearance = useResourceAppearance(attributes.id);
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
        className={`editor-image-frame editor-media-overlay-host hall-template-image-${attributes.align}`}
        style={{ width: `${attributes.width}%` }}
      >
        <ResourceImageFigure {...attributes} width={100} testId={`editor-image-${attributes.id}`} />
        {controls && editable ? (
          <EditorMediaOverlay
            icon={resourceAppearance?.glyph ?? null}
            title={attributes.alt}
            testId="editor-image-controls"
            titleTestId={renderResourcePreview ? "editor-image-open" : undefined}
            titleAriaLabel={t("editor.imageOpen")}
            titleRef={previewTriggerRef}
            onTitleClick={
              renderResourcePreview
                ? () => {
                    previewScrollRef.current = { x: window.scrollX, y: window.scrollY };
                    setPreviewing(true);
                  }
                : undefined
            }
            onDelete={deleteNode}
            deleteLabel={t("common.delete")}
            deleteTestId="editor-image-delete"
          >
            <Button
              variant="plain"
              size="icon"
              data-testid="editor-image-align-left"
              aria-label={t("editor.imageAlignLeft")}
              aria-pressed={attributes.align === "left"}
              onClick={() => updateAttributes({ align: "left" })}
            >
              <AlignLeftIcon />
            </Button>
            <Button
              variant="plain"
              size="icon"
              data-testid="editor-image-align-center"
              aria-label={t("editor.imageAlignCenter")}
              aria-pressed={attributes.align === "center"}
              onClick={() => updateAttributes({ align: "center" })}
            >
              <AlignCenterIcon />
            </Button>
            {phone ? <PhoneImageWidthMenu width={attributes.width} onChange={updateWidth} /> : null}
          </EditorMediaOverlay>
        ) : null}
        {controls && selected && editable && !phone ? (
          <span
            data-testid="editor-image-width"
            className="editor-image-resize"
            role="slider"
            tabIndex={0}
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
      {controls && previewing
        ? renderResourcePreview?.(attributes.id, () => {
            setPreviewing(false);
            window.requestAnimationFrame(() => {
              previewTriggerRef.current?.focus({ preventScroll: true });
              window.scrollTo(previewScrollRef.current.x, previewScrollRef.current.y);
            });
          })
        : null}
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

  addProseMirrorPlugins() {
    return [imageUploadPlaceholders()];
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
