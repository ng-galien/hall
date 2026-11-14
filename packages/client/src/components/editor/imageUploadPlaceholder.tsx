import { imageWidthRange } from "@hall/templating";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { insertPoint } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { createRoot, type Root } from "react-dom/client";
import { LoadingIndicator } from "../ui/loading-indicator";

/** An image being sent: where it will be placed in the text, and its proportions once the photo is decoded. */
interface PendingImage {
  id: string;
  anchor: number;
  ratio: number | null;
}

type PlaceholderChange =
  | { kind: "start"; id: string; anchor: number }
  | { kind: "size"; id: string; ratio: number }
  | { kind: "end"; id: string };

const placeholderKey = new PluginKey<PendingImage[]>("imageUploadPlaceholders");

/** Proportions (width over height) of the images sent in this session, so that a placed image keeps its place. */
const sentImageRatios = new Map<string, number>();

export function rememberImageRatio(resourceId: string, ratio: number) {
  sentImageRatios.set(resourceId, ratio);
}

export function sentImageRatio(resourceId: string): number | undefined {
  return sentImageRatios.get(resourceId);
}

const roots = new WeakMap<HTMLElement, Root>();

/** The place of an image being sent: a box at the width and the proportions of the image, with the loading indicator. */
function placeholderElement(ratio: number): HTMLElement {
  const element = document.createElement("span");
  element.className = "editor-image-placeholder hall-template-image-left";
  element.contentEditable = "false";
  element.dataset.testid = "editor-image-placeholder";
  element.style.width = `${imageWidthRange.default}%`;
  element.style.aspectRatio = String(ratio);
  const root = createRoot(element);
  root.render(<LoadingIndicator aria-hidden="true" />);
  roots.set(element, root);
  return element;
}

function destroyPlaceholder(element: Node) {
  const root = element instanceof HTMLElement ? roots.get(element) : undefined;
  if (root) queueMicrotask(() => root.unmount());
}

// @implements-requirement HALL-FR-LAY-010
/** Shows in the text the place of each image being sent, at the position where it will be placed. */
export function imageUploadPlaceholders() {
  return new Plugin<PendingImage[]>({
    key: placeholderKey,
    state: {
      init: () => [],
      apply(transaction, pending) {
        const mapped = transaction.docChanged
          ? pending.map((image) => ({ ...image, anchor: transaction.mapping.map(image.anchor, 1) }))
          : pending;
        const change = transaction.getMeta(placeholderKey) as PlaceholderChange | undefined;
        if (!change) return mapped;
        if (change.kind === "start") return [...mapped, { id: change.id, anchor: change.anchor, ratio: null }];
        if (change.kind === "size")
          return mapped.map((image) => (image.id === change.id ? { ...image, ratio: change.ratio } : image));
        return mapped.filter((image) => image.id !== change.id);
      },
    },
    props: {
      decorations(state) {
        const pending = placeholderKey.getState(state) ?? [];
        const imageType = state.schema.nodes.resourceImage;
        const widgets = pending.flatMap(({ id, anchor, ratio }) => {
          if (ratio === null || !imageType) return [];
          const position = insertPoint(state.doc, anchor, imageType) ?? anchor;
          return [
            Decoration.widget(position, () => placeholderElement(ratio), {
              key: `${id}:${ratio}`,
              side: 1,
              ignoreSelection: true,
              destroy: destroyPlaceholder,
            }),
          ];
        });
        return widgets.length ? DecorationSet.create(state.doc, widgets) : DecorationSet.empty;
      },
    },
  });
}

let nextPlaceholder = 0;

function dispatchChange(view: EditorView, change: PlaceholderChange) {
  if (view.isDestroyed || !placeholderKey.getState(view.state)) return;
  view.dispatch(view.state.tr.setMeta(placeholderKey, change).setMeta("addToHistory", false));
}

/** Records the position of an image about to be sent; its place shows once its proportions are known. */
export function startImagePlaceholder(view: EditorView, anchor: number): string {
  nextPlaceholder += 1;
  const id = `image-upload-${nextPlaceholder}`;
  dispatchChange(view, { kind: "start", id, anchor });
  return id;
}

export function sizeImagePlaceholder(view: EditorView, id: string, ratio: number) {
  dispatchChange(view, { kind: "size", id, ratio });
}

/** The position of the image in the text as it is now, after what was written meanwhile. */
export function imagePlaceholderAnchor(state: EditorState, id: string): number | undefined {
  return placeholderKey.getState(state)?.find((image) => image.id === id)?.anchor;
}

/** Removes the place of the image in the transaction that places the image. */
export function endImagePlaceholder(transaction: Transaction, id: string): Transaction {
  return transaction.setMeta(placeholderKey, { kind: "end", id } satisfies PlaceholderChange);
}

/** Removes the place of an image that was not placed. */
export function removeImagePlaceholder(view: EditorView, id: string) {
  if (imagePlaceholderAnchor(view.state, id) !== undefined) dispatchChange(view, { kind: "end", id });
}
