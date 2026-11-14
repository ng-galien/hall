import { imageWidthRange } from "@hall/templating";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { insertPoint } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { createRoot, type Root } from "react-dom/client";
import { LoadingIndicator } from "../ui/loading-indicator";

/** An image being sent: where it will be placed in the text. */
interface PendingImage {
  id: string;
  anchor: number;
}

type PlaceholderChange = { kind: "start"; id: string; anchor: number } | { kind: "end"; id: string };

const placeholderKey = new PluginKey<PendingImage[]>("imageUploadPlaceholders");

/** Proportions (width over height) of the images sent in this session, so that a placed image keeps its height while it loads. */
const sentImageRatios = new Map<string, number>();

export function rememberImageRatio(resourceId: string, ratio: number) {
  sentImageRatios.set(resourceId, ratio);
}

export function sentImageRatio(resourceId: string): number | undefined {
  return sentImageRatios.get(resourceId);
}

const roots = new WeakMap<HTMLElement, Root>();

/** The place of an image being sent: a low box of fixed height with the loading indicator. */
function placeholderElement(): HTMLElement {
  const element = document.createElement("span");
  element.className = "editor-image-placeholder hall-template-image-left";
  element.contentEditable = "false";
  element.dataset.testid = "editor-image-placeholder";
  element.style.width = `${imageWidthRange.default}%`;
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
        if (change.kind === "start") return [...mapped, { id: change.id, anchor: change.anchor }];
        return mapped.filter((image) => image.id !== change.id);
      },
    },
    props: {
      decorations(state) {
        const pending = placeholderKey.getState(state) ?? [];
        const imageType = state.schema.nodes.resourceImage;
        const widgets = pending.flatMap(({ id, anchor }) => {
          if (!imageType) return [];
          const position = insertPoint(state.doc, anchor, imageType) ?? anchor;
          return [
            Decoration.widget(position, placeholderElement, {
              key: id,
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

/** Shows the place of an image about to be sent at the given position of the text. */
export function startImagePlaceholder(view: EditorView, anchor: number): string {
  nextPlaceholder += 1;
  const id = `image-upload-${nextPlaceholder}`;
  dispatchChange(view, { kind: "start", id, anchor });
  return id;
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
