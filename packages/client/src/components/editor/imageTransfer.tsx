import { matchDiscriminated } from "@hall/domain";
import { imageWidthRange } from "@hall/templating";
import type { ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { type DragEvent, type RefObject, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { ResourceImageAttributes } from "./images";

/** State of the image or document transfer shown under the writing area. */
export type ImageUploadStatus =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "failed" }
  | { kind: "documentUploading"; name: string; position: number; total: number }
  | { kind: "documentFailed"; name: string }
  | { kind: "documentRefused"; names: string[]; accepted: string };
export type EditorImageUpload = (image: File) => Promise<{ id: string; label: string }>;

/** Upload of a dropped file as a document cited by a reference; the accepted formats come from the upload actions. */
export interface EditorDocumentUpload {
  accepts(file: File): boolean;
  /** Accepted extensions, as shown in the refusal message. */
  accepted: string;
  upload(file: File): Promise<{ id: string; label: string }>;
}

export const idleUploadStatus: ImageUploadStatus = { kind: "idle" };

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

function insertionTarget(view: EditorView, requestedPosition: number | undefined): Selection {
  const { doc, selection } = view.state;
  return requestedPosition === undefined && selection instanceof TextSelection
    ? selection
    : textSelectionAt(doc.resolve(Math.min(requestedPosition ?? selection.from, doc.content.size)));
}

/** Inserts an uploaded image, selects it and returns the position right after it, or null when it was not placed. */
function placeImage(view: EditorView, image: { id: string; label: string }, requestedPosition: number | undefined) {
  if (view.isDestroyed) return null;
  const node = view.state.schema.nodes.resourceImage!.create(imageAttributes(image));
  const transaction = view.state.tr.setSelection(insertionTarget(view, requestedPosition)).replaceSelectionWith(node);
  let insertedPosition: number | null = null;
  transaction.doc.descendants((candidate, candidatePosition) => {
    if (candidate.type === node.type && candidate.attrs.id === image.id) {
      insertedPosition = candidatePosition;
      return false;
    }
    return true;
  });
  if (insertedPosition === null) return null;
  transaction.setSelection(NodeSelection.create(transaction.doc, insertedPosition));
  view.dispatch(transaction);
  return (insertedPosition as number) + node.nodeSize;
}

/** Inserts the reference of an uploaded document followed by a space and returns the position after that space. */
function placeDocumentReference(
  view: EditorView,
  document: { id: string; label: string },
  requestedPosition: number | undefined,
) {
  if (view.isDestroyed) return null;
  const node = view.state.schema.nodes.reference!.create({ kind: "resource", id: document.id, label: document.label });
  view.dispatch(
    view.state.tr.setSelection(insertionTarget(view, requestedPosition)).replaceSelectionWith(node, false).insertText(" "),
  );
  return view.state.selection.to;
}

function insertImage(
  view: EditorView,
  file: File,
  requestedPosition: number | undefined,
  upload: EditorImageUpload | undefined,
  onStatus: (status: ImageUploadStatus) => void,
) {
  if (!upload || !acceptedImageTypes.has(file.type)) {
    onStatus({ kind: "failed" });
    return;
  }
  onStatus({ kind: "uploading" });
  void upload(file).then(
    (image) => onStatus(placeImage(view, image, requestedPosition) === null ? { kind: "failed" } : idleUploadStatus),
    () => onStatus({ kind: "failed" }),
  );
}

/**
 * Uploads the dropped files one after the other and inserts each at the drop point, after the previous one: a PNG or
 * JPEG as an image of the text when the editor imports images, any other accepted file as a cited document.
 */
async function insertDroppedFiles(
  view: EditorView,
  files: File[],
  requestedPosition: number | undefined,
  uploadImage: EditorImageUpload | undefined,
  documents: EditorDocumentUpload,
  onStatus: (status: ImageUploadStatus) => void,
) {
  const asImage = (file: File) => Boolean(uploadImage) && acceptedImageTypes.has(file.type);
  const refused = files.filter((file) => !asImage(file) && !documents.accepts(file));
  const accepted = files.filter((file) => !refused.includes(file));
  let position = requestedPosition;
  for (const [index, file] of accepted.entries()) {
    const image = asImage(file);
    onStatus(
      image
        ? { kind: "uploading" }
        : { kind: "documentUploading", name: file.name, position: index + 1, total: accepted.length },
    );
    try {
      const uploaded = await (image ? uploadImage!(file) : documents.upload(file));
      const next = image ? placeImage(view, uploaded, position) : placeDocumentReference(view, uploaded, position);
      if (next === null) throw new Error("insertion_failed");
      position = next;
    } catch {
      onStatus(image ? { kind: "failed" } : { kind: "documentFailed", name: file.name });
      return;
    }
  }
  onStatus(
    refused.length
      ? { kind: "documentRefused", names: refused.map(({ name }) => name), accepted: documents.accepted }
      : idleUploadStatus,
  );
}

// @implements-requirement HALL-FR-DOC-470
// @implements-requirement HALL-FR-DOC-500
/** ProseMirror handlers shared by the compact and full-screen editors for an image or a file dropped or pasted. */
export function imageTransferHandlers(
  upload: RefObject<EditorImageUpload | undefined>,
  onStatus: RefObject<(status: ImageUploadStatus) => void>,
  documentUpload: RefObject<EditorDocumentUpload | undefined>,
) {
  return {
    handleDrop: (view: EditorView, event: globalThis.DragEvent) => {
      const documents = documentUpload.current;
      const files = event.dataTransfer ? [...event.dataTransfer.files] : [];
      if (documents && files.length) {
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertDroppedFiles(view, files, position, upload.current, documents, onStatus.current);
        return true;
      }
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

export function ImageDropZone({ active, documents = false }: { active: boolean; documents?: boolean }) {
  const { t } = useI18n();
  if (!active) return null;
  return (
    <div
      className="markdown-image-drop-zone"
      data-testid="editor-image-drop-zone"
      data-documents={documents}
      aria-hidden="true"
    >
      <span>{t(documents ? "editor.fileDropZone" : "editor.imageDropZone")}</span>
    </div>
  );
}

export function ImageUploadStatusLine({ status }: { status: ImageUploadStatus }) {
  const { t } = useI18n();
  if (status.kind === "idle") return null;
  const message = matchDiscriminated(status, "kind", {
    idle: () => "",
    uploading: () => t("editor.imageUploading"),
    failed: () => t("editor.imageUploadFailed"),
    documentUploading: ({ name, position, total }) =>
      t("editor.documentUploading")
        .replace("{name}", name)
        .replace("{position}", String(position))
        .replace("{total}", String(total)),
    documentFailed: ({ name }) => t("editor.documentUploadFailed").replace("{name}", name),
    documentRefused: ({ names, accepted }) =>
      t("editor.documentRefused").replace("{names}", names.join(", ")).replace("{accepted}", accepted),
  });
  return (
    <p
      className="markdown-image-status"
      role={status.kind === "uploading" || status.kind === "documentUploading" ? "status" : "alert"}
      data-testid="editor-image-status"
      data-status={status.kind}
    >
      {message}
    </p>
  );
}
