import { imageWidthRange } from "@hall/templating";
import type { ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { type DragEvent, type RefObject, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { ResourceImageAttributes } from "./images";

export type ImageUploadStatus = "idle" | "uploading" | "failed";
export type EditorImageUpload = (image: File) => Promise<{ id: string; label: string }>;

const acceptedImageTypes = new Set(["image/jpeg", "image/png"]);

function imageAttributes(image: { id: string; label: string }): ResourceImageAttributes {
  return { id: image.id, alt: image.label, align: "left", width: imageWidthRange.default };
}

function imageFile(transfer: DataTransfer | null): File | undefined {
  return transfer ? [...transfer.files].find((candidate) => candidate.type.startsWith("image/")) : undefined;
}

/** Text position nearest to the requested one, so that an insertion never replaces a selected image. */
function textSelectionAt(position: ResolvedPos): Selection {
  return (
    Selection.findFrom(position, -1, true) ?? Selection.findFrom(position, 1, true) ?? Selection.atEnd(position.doc)
  );
}

function carriesFiles(transfer: DataTransfer | null): boolean {
  return Boolean(transfer && [...transfer.types].includes("Files"));
}

function insertImage(
  view: EditorView,
  file: File,
  requestedPosition: number | undefined,
  upload: EditorImageUpload | undefined,
  onStatus: (status: ImageUploadStatus) => void,
) {
  if (!upload || !acceptedImageTypes.has(file.type)) {
    onStatus("failed");
    return;
  }
  onStatus("uploading");
  void upload(file).then(
    (image) => {
      const { doc, selection } = view.state;
      const node = view.state.schema.nodes.resourceImage!.create(imageAttributes(image));
      const target =
        requestedPosition === undefined && selection instanceof TextSelection
          ? selection
          : textSelectionAt(doc.resolve(Math.min(requestedPosition ?? selection.from, doc.content.size)));
      const transaction = view.state.tr.setSelection(target).replaceSelectionWith(node);
      let insertedPosition: number | null = null;
      transaction.doc.descendants((candidate, candidatePosition) => {
        if (candidate.type === node.type && candidate.attrs.id === image.id) {
          insertedPosition = candidatePosition;
          return false;
        }
        return true;
      });
      if (insertedPosition === null) {
        onStatus("failed");
        return;
      }
      transaction.setSelection(NodeSelection.create(transaction.doc, insertedPosition));
      view.dispatch(transaction);
      onStatus("idle");
    },
    () => onStatus("failed"),
  );
}

// @implements-requirement HALL-FR-DOC-470
/** ProseMirror handlers shared by the compact and full-screen editors for an image dropped or pasted. */
export function imageTransferHandlers(
  upload: RefObject<EditorImageUpload | undefined>,
  onStatus: RefObject<(status: ImageUploadStatus) => void>,
) {
  return {
    handleDrop: (view: EditorView, event: globalThis.DragEvent) => {
      const file = imageFile(event.dataTransfer);
      if (!file) return false;
      event.preventDefault();
      const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      insertImage(view, file, position, upload.current, onStatus.current);
      return true;
    },
    handlePaste: (view: EditorView, event: ClipboardEvent) => {
      const file = imageFile(event.clipboardData);
      if (!file) return false;
      event.preventDefault();
      insertImage(view, file, undefined, upload.current, onStatus.current);
      return true;
    },
  };
}

/** Drop zone shown over the writing area while a file is dragged above it. */
export function useImageDropZone(enabled: boolean) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const reset = () => {
    depth.current = 0;
    setActive(false);
  };
  const handlers = enabled
    ? {
        onDragEnter: (event: DragEvent<HTMLElement>) => {
          if (!carriesFiles(event.dataTransfer)) return;
          depth.current += 1;
          setActive(true);
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
          if (!carriesFiles(event.dataTransfer)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setActive(false);
        },
        onDropCapture: reset,
      }
    : {};
  return { active: enabled && active, handlers };
}

export function ImageDropZone({ active }: { active: boolean }) {
  const { t } = useI18n();
  if (!active) return null;
  return (
    <div className="markdown-image-drop-zone" data-testid="editor-image-drop-zone" aria-hidden="true">
      <span>{t("editor.imageDropZone")}</span>
    </div>
  );
}

export function ImageUploadStatusLine({ status }: { status: ImageUploadStatus }) {
  const { t } = useI18n();
  if (status === "idle") return null;
  return (
    <p
      className="markdown-image-status"
      role={status === "failed" ? "alert" : "status"}
      data-testid="editor-image-status"
      data-status={status}
    >
      {t(status === "uploading" ? "editor.imageUploading" : "editor.imageUploadFailed")}
    </p>
  );
}
