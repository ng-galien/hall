import {
  imageWidthRange,
  mapPresentationDefaults,
  parseResourceEmbedDirective,
  type ResourceEmbedAttributes,
  serializeResourceEmbedDirective,
} from "@hall/templating";
import { mergeAttributes, Node } from "@tiptap/core";
import { type Editor, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import {
  type CSSProperties,
  createContext,
  type FormEvent,
  Fragment,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useContext,
  useRef,
  useState,
} from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "../../i18n/I18nProvider";
import { AlignCenterIcon, AlignLeftIcon, CheckIcon, CopyIcon } from "../icons";
import { EditorMediaOverlay } from "./EditorMediaOverlay";
import { type FullSearchRequest, ReferenceSearchDialog } from "./ReferenceSearchDialog";
import type { Mentionable } from "./references";
import { useResourceAppearance, useResourcePreviewRenderer } from "./references";
import "./resourceEmbeds.css";

export type { ResourceEmbedAttributes } from "@hall/templating";

export interface ResourceEmbedTableSheet {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  defaultRange: string;
}

type ResourceEmbedRenderer = (attributes: ResourceEmbedAttributes) => ReactNode;
type ResourceEmbedTableOptionsResolver = (resourceId: string) => Promise<ResourceEmbedTableSheet[]>;

const ResourceEmbedPresentationContext = createContext<{
  render: ResourceEmbedRenderer;
  loadTableOptions: ResourceEmbedTableOptionsResolver;
} | null>(null);

/** Injects resource-specific rendering and data access into the technical editor nodes. */
export function ResourceEmbedPresentationProvider({
  renderResourceEmbed,
  loadTableOptions,
  children,
}: {
  renderResourceEmbed: ResourceEmbedRenderer;
  loadTableOptions: ResourceEmbedTableOptionsResolver;
  children: ReactNode;
}) {
  return (
    <ResourceEmbedPresentationContext.Provider value={{ render: renderResourceEmbed, loadTableOptions }}>
      {children}
    </ResourceEmbedPresentationContext.Provider>
  );
}

function ResourceEmbedBlock({
  attributes,
  testId,
  editable = false,
  updateAttributes,
  onDelete,
}: {
  attributes: ResourceEmbedAttributes;
  testId: string;
  editable?: boolean;
  updateAttributes?(attributes: Partial<ResourceEmbedAttributes>): void;
  onDelete?(): void;
}) {
  const { t } = useI18n();
  const presentation = useContext(ResourceEmbedPresentationContext);
  const renderResourcePreview = useResourcePreviewRenderer();
  const resourceAppearance = useResourceAppearance(attributes.id);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [presentationRevision, setPresentationRevision] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef({ x: 0, y: 0 });
  const open = () => {
    if (!renderResourcePreview) return;
    scrollRef.current = { x: window.scrollX, y: window.scrollY };
    setPreviewing(true);
  };
  const hasFloatingInfo =
    attributes.presentation === "legal-citation" ||
    attributes.presentation === "map" ||
    attributes.presentation === "table";
  const hasInlineOverlay = attributes.presentation === "legal-citation" || attributes.presentation === "table";
  const isResizableMap = attributes.presentation === "map";
  const mapWidth = attributes.width ?? mapPresentationDefaults.width;
  const mapAlign = attributes.align ?? mapPresentationDefaults.align;
  const updateMapWidth = (width: number) =>
    updateAttributes?.({ width: Math.round(Math.min(imageWidthRange.max, Math.max(imageWidthRange.min, width))) });
  const startMapResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const canvasWidth = event.currentTarget.closest(".markdown-editor-canvas")?.clientWidth ?? 1;
    const move = (next: PointerEvent) => updateMapWidth(mapWidth + ((next.clientX - startX) / canvasWidth) * 100);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const copyLegalText = async () => {
    const legal = containerRef.current?.querySelector<HTMLElement>(".resource-embed-legal");
    const citation = legal?.querySelector("strong")?.textContent?.trim();
    const body = legal?.querySelector("p")?.textContent?.trim();
    const text = [citation, body].filter(Boolean).join("\n\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <>
      <div
        className={
          isResizableMap
            ? `editor-resource-embed-map-frame editor-media-overlay-host hall-template-image-${mapAlign}`
            : undefined
        }
        style={isResizableMap ? ({ width: `${mapWidth}%` } satisfies CSSProperties) : undefined}
      >
        <div
          ref={containerRef}
          className={`editor-resource-embed-trigger${hasFloatingInfo ? " has-floating-info" : ""}${hasInlineOverlay ? " editor-media-overlay-host" : ""}`}
        >
          {!hasFloatingInfo ? (
            <button
              ref={triggerRef}
              type="button"
              className="editor-resource-embed-open"
              data-testid={testId}
              aria-label={`${attributes.label} · ${t("editor.openHint")}`}
              onClick={open}
            />
          ) : null}
          <Fragment key={presentationRevision}>
            {presentation?.render(attributes) ?? (
              <div className="editor-resource-embed-fallback">{attributes.label}</div>
            )}
          </Fragment>
          {hasInlineOverlay ? (
            <EditorMediaOverlay
              icon={resourceAppearance?.glyph ?? null}
              title={attributes.label}
              testId={`${testId}-info`}
              titleTestId={testId}
              titleAriaLabel={`${t("workspace.open")} · ${attributes.label}`}
              titleRef={triggerRef}
              onTitleClick={open}
              onDelete={editable ? onDelete : undefined}
              deleteLabel={t("common.delete")}
              deleteTestId={`${testId}-delete`}
            >
              {attributes.presentation === "legal-citation" ? (
                <button
                  type="button"
                  data-testid={`${testId}-copy`}
                  aria-label={t(copied ? "common.copied" : "common.copy")}
                  onClick={() => void copyLegalText()}
                >
                  {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                </button>
              ) : null}
            </EditorMediaOverlay>
          ) : null}
        </div>
        {isResizableMap ? (
          <EditorMediaOverlay
            icon={resourceAppearance?.glyph ?? null}
            title={attributes.label}
            testId={`${testId}-info`}
            titleTestId={testId}
            titleAriaLabel={`${t("workspace.open")} · ${attributes.label}`}
            titleRef={triggerRef}
            onTitleClick={open}
            onDelete={editable ? onDelete : undefined}
            deleteLabel={t("common.delete")}
            deleteTestId={`${testId}-delete`}
          >
            {editable ? (
              <>
                <button
                  type="button"
                  data-testid={`${testId}-align-left`}
                  aria-label={t("editor.imageAlignLeft")}
                  aria-pressed={mapAlign === "left"}
                  onClick={() => updateAttributes?.({ align: "left" })}
                >
                  <AlignLeftIcon />
                </button>
                <button
                  type="button"
                  data-testid={`${testId}-align-center`}
                  aria-label={t("editor.imageAlignCenter")}
                  aria-pressed={mapAlign === "center"}
                  onClick={() => updateAttributes?.({ align: "center" })}
                >
                  <AlignCenterIcon />
                </button>
              </>
            ) : null}
          </EditorMediaOverlay>
        ) : null}
        {isResizableMap && editable ? (
          <button
            type="button"
            className="editor-resource-embed-map-resize"
            data-testid={`${testId}-width`}
            role="slider"
            aria-label={t("editor.imageResize")}
            aria-valuemin={imageWidthRange.min}
            aria-valuemax={imageWidthRange.max}
            aria-valuenow={mapWidth}
            onPointerDown={startMapResize}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              event.stopPropagation();
              updateMapWidth(mapWidth + (event.key === "ArrowRight" ? 5 : -5));
            }}
          />
        ) : null}
      </div>
      {previewing
        ? renderResourcePreview?.(attributes.id, () => {
            setPreviewing(false);
            setPresentationRevision((revision) => revision + 1);
            window.requestAnimationFrame(() => {
              triggerRef.current?.focus({ preventScroll: true });
              window.scrollTo(scrollRef.current.x, scrollRef.current.y);
            });
          })
        : null}
    </>
  );
}

function ResourceEmbedNodeView({ node, selected, editor, updateAttributes, deleteNode }: NodeViewProps) {
  const attributes = node.attrs as ResourceEmbedAttributes;
  const isTextSelectable = attributes.presentation === "legal-citation" || attributes.presentation === "table";
  return (
    <NodeViewWrapper
      className={`resource-embed-block editor-resource-embed-node${isTextSelectable ? " is-text-selectable" : ""}`}
      data-selected={selected || undefined}
      data-resource-id={attributes.id}
      onMouseDown={(event: ReactMouseEvent) => {
        if (isTextSelectable) event.stopPropagation();
      }}
    >
      <ResourceEmbedBlock
        attributes={attributes}
        testId={`editor-resource-embed-${attributes.id}`}
        editable={editor.isEditable}
        updateAttributes={updateAttributes}
        onDelete={deleteNode}
      />
    </NodeViewWrapper>
  );
}

export function ResourceEmbedReadView({ attributes }: { attributes: ResourceEmbedAttributes }) {
  return (
    <div className="resource-embed-block">
      <ResourceEmbedBlock attributes={attributes} testId={`rendered-resource-embed-${attributes.id}`} />
    </div>
  );
}

export const ResourceEmbed = Node.create({
  name: "resourceEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: "" },
      presentation: { default: "document" },
      align: { default: null },
      width: { default: null },
      sheet: { default: null },
      range: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-resource-embed]",
        getAttrs: (element) => ({
          id: element.getAttribute("data-resource-id"),
          label: element.getAttribute("data-label") ?? "",
          presentation: element.getAttribute("data-presentation") ?? "document",
          align: element.getAttribute("data-align"),
          width: element.hasAttribute("data-width") ? Number(element.getAttribute("data-width")) : null,
          sheet: element.getAttribute("data-sheet"),
          range: element.getAttribute("data-range"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-resource-embed": "",
        "data-resource-id": node.attrs.id,
        "data-label": node.attrs.label,
        "data-presentation": node.attrs.presentation,
        ...(node.attrs.align ? { "data-align": node.attrs.align } : {}),
        ...(node.attrs.width ? { "data-width": node.attrs.width } : {}),
        ...(node.attrs.sheet ? { "data-sheet": node.attrs.sheet } : {}),
        ...(node.attrs.range ? { "data-range": node.attrs.range } : {}),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceEmbedNodeView);
  },

  markdownTokenizer: {
    name: "resourceEmbed",
    level: "block",
    start: (source: string) => source.indexOf("::resource-embed["),
    tokenize: (source: string) => {
      const parsed = parseResourceEmbedDirective(source);
      return parsed ? { type: "resourceEmbed", ...parsed } : undefined;
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("resourceEmbed", {
      id: token.id,
      label: token.label,
      presentation: token.presentation,
      align: token.align ?? null,
      width: token.width ?? null,
      sheet: token.sheet ?? null,
      range: token.range ?? null,
    }),
  renderMarkdown: (node) => serializeResourceEmbedDirective(node.attrs as ResourceEmbedAttributes),
});

export function insertResourceEmbed(editor: Editor, attributes: ResourceEmbedAttributes) {
  editor.chain().focus().insertContent({ type: "resourceEmbed", attrs: attributes }).run();
  const cursor = editor.state.selection.from;
  let position: number | null = null;
  editor.state.doc.nodesBetween(0, cursor, (node, nodePosition) => {
    if (node.type.name === "resourceEmbed" && node.attrs.id === attributes.id) position = nodePosition;
  });
  if (position !== null) editor.commands.setNodeSelection(position);
}

function columnNumber(column: string): number {
  let value = 0;
  for (const character of column.toUpperCase()) value = value * 26 + character.charCodeAt(0) - 64;
  return value;
}

export function isValidResourceEmbedTableRange(range: string, sheet: ResourceEmbedTableSheet): boolean {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*):\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(range.trim());
  if (!match) return false;
  const startColumn = columnNumber(match[1]);
  const startRow = Number(match[2]);
  const endColumn = columnNumber(match[3]);
  const endRow = Number(match[4]);
  if (startColumn > endColumn || startRow > endRow) return false;
  if (endColumn > sheet.columnCount || endRow > sheet.rowCount) return false;
  return (endColumn - startColumn + 1) * (endRow - startRow + 1) <= 500;
}

/** Resource-only search used by the enriched editor, with a bounded table range step when required. */
export function EditorResourceEmbedSearch({
  editor,
  request,
  mentionables,
  context,
  onClose,
}: {
  editor: Editor;
  request: FullSearchRequest;
  mentionables: RefObject<Mentionable[]>;
  context: RefObject<string | undefined>;
  onClose(): void;
}) {
  const { t } = useI18n();
  const provider = useContext(ResourceEmbedPresentationContext);
  const [candidate, setCandidate] = useState<Mentionable | null>(null);
  const [sheets, setSheets] = useState<ResourceEmbedTableSheet[] | null>(null);
  const [sheetId, setSheetId] = useState("");
  const [range, setRange] = useState("");
  const [failed, setFailed] = useState(false);
  const embeddables = mentionables.current.filter(
    (item) => item.kind === "resource" && item.resourcePresentation !== undefined,
  );

  const pick = (item: Mentionable) => {
    const presentation = item.resourcePresentation;
    if (!presentation) return;
    if (presentation !== "table") {
      insertResourceEmbed(editor, {
        id: item.id,
        label: item.label,
        presentation,
        ...(presentation === "image" ? { align: "left" as const, width: imageWidthRange.default } : {}),
      });
      onClose();
      return;
    }
    setCandidate(item);
    setFailed(false);
    void provider?.loadTableOptions(item.id).then(
      (options) => {
        if (options.length === 0) {
          setFailed(true);
          return;
        }
        setSheets(options);
        setSheetId(options[0].id);
        setRange(options[0].defaultRange);
      },
      () => setFailed(true),
    );
  };

  if (!candidate) {
    return (
      <ReferenceSearchDialog
        initialQuery={request.query}
        mentionables={embeddables}
        context={context.current}
        allowedKinds={["resource"]}
        title={t("editor.embedResource")}
        testId="resource-embed-search-dialog"
        onClose={onClose}
        onPick={(item) => pick(item as Mentionable)}
      />
    );
  }

  const selectedSheet = sheets?.find((sheet) => sheet.id === sheetId) ?? null;
  const valid = selectedSheet !== null && isValidResourceEmbedTableRange(range, selectedSheet);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || !selectedSheet) return;
    insertResourceEmbed(editor, {
      id: candidate.id,
      label: candidate.label,
      presentation: "table",
      sheet: selectedSheet.id,
      range: range.trim().toUpperCase(),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="resource-embed-table-options" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("editor.embedTableOptions")}</DialogTitle>
        </DialogHeader>
        {!sheets && !failed ? <p role="status">{t("common.loading")}</p> : null}
        {failed ? <p role="alert">{t("common.requestFailed")}</p> : null}
        {sheets ? (
          <form className="resource-embed-options" onSubmit={submit}>
            <Label htmlFor="resource-embed-sheet">{t("editor.embedTableSheet")}</Label>
            <Select
              value={sheetId}
              onValueChange={(next) => {
                setSheetId(next);
                setRange(sheets.find((sheet) => sheet.id === next)?.defaultRange ?? "A1:A1");
              }}
            >
              <SelectTrigger id="resource-embed-sheet" data-testid="resource-embed-table-sheet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheets.map((sheet) => (
                  <SelectItem key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="resource-embed-range">{t("editor.embedTableRange")}</Label>
            <Input
              id="resource-embed-range"
              data-testid="resource-embed-table-range"
              value={range}
              onChange={(event) => setRange(event.currentTarget.value)}
              aria-invalid={Boolean(range) && !valid}
              placeholder="A1:F20"
            />
            {!valid && range ? <p role="alert">{t("editor.embedTableRangeInvalid")}</p> : null}
            <button
              type="submit"
              className="markdown-toolbar-text-button is-primary"
              data-testid="resource-embed-table-submit"
              disabled={!valid}
            >
              {t("editor.embedResource")}
            </button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
