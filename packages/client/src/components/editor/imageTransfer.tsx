import { matchDiscriminated } from "@hall/domain";
import { imageWidthRange } from "@hall/templating";
import type { Editor } from "@tiptap/core";
import { Fragment, type ResolvedPos, Slice } from "@tiptap/pm/model";
import { Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { insertPoint } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { type DragEvent, type RefObject, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { watchPhotoSize } from "../../features/documents/photoReduction";
import { useI18n } from "../../i18n/I18nProvider";
import { Modal } from "../Ui";
import { LoadingIndicator } from "../ui/loading-indicator";
import type { ResourceImageAttributes } from "./images";
import { beginImageUpload } from "./imageUploadGate";
import {
  endImagePlaceholder,
  imagePlaceholderAnchor,
  rememberImageRatio,
  removeImagePlaceholder,
  startImagePlaceholder,
} from "./imageUploadPlaceholder";
import { focusesText } from "./phoneKeyboard";

/** State of the image or document transfer shown under the writing area. */
export type ImageUploadStatus =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "failed" }
  | { kind: "documentUploading"; name: string; position: number; total: number }
  | { kind: "documentFailed"; name: string }
  | { kind: "documentRefused"; names: string[]; accepted: string }
  | { kind: "tableConverting"; name: string }
  | { kind: "tableTruncated"; name: string; included: number; total: number };
export type EditorImageUpload = (image: File) => Promise<{ id: string; label: string }>;

/** Upload of a dropped file as a document cited by a reference; the accepted formats come from the upload actions. */
export interface EditorDocumentUpload {
  accepts(file: File): boolean;
  /** Accepted extensions, as shown in the refusal message. */
  accepted: string;
  /** With numberTakenName, a name already taken at the location is numbered instead of refused. */
  upload(file: File, options?: { numberTakenName?: boolean }): Promise<{ id: string; label: string }>;
  /** True for a spreadsheet file that can be inserted as a table of the text instead of being attached. */
  convertsToTable(file: File): boolean;
  /** Converts the first sheet of the file into a Markdown table; the counts exclude the header row. */
  convertTable(file: File): Promise<{ markdown: string; rowCount: number; includedRowCount: number }>;
}

export type SpreadsheetDropChoice = "attach" | "table";
/** Asks the user what to do with a dropped spreadsheet; null when the drop of this file is cancelled. */
export type ChooseSpreadsheetDrop = (file: File) => Promise<SpreadsheetDropChoice | null>;

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

/** Where an image chosen at a text position goes: the place in the text, and whether a line was opened under it. */
interface ImagePlace {
  anchor: number;
  openedLine: boolean;
}

/**
 * Prepares the place of an image chosen at the target: the image goes after the paragraph of the caret, or before it
 * when it is empty, and the writing goes on in the line under that place, opened when the paragraph has text.
 */
function openImagePlace(view: EditorView, target: Selection): ImagePlace {
  const { $from } = target;
  const imageType = view.state.schema.nodes.resourceImage!;
  const depth = $from.depth;
  const container = depth > 0 ? $from.node(depth - 1) : null;
  const index = depth > 0 ? $from.index(depth - 1) : 0;
  if (!$from.parent.isTextblock || !container?.canReplaceWith(index, index, imageType))
    return { anchor: target.from, openedLine: false };
  if ($from.parent.content.size === 0) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.pos)));
    return { anchor: $from.before(depth), openedLine: false };
  }
  const boundary = $from.after(depth);
  const transaction = view.state.tr.insert(boundary, view.state.schema.nodes.paragraph!.create());
  view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, boundary + 1)).scrollIntoView());
  return { anchor: boundary, openedLine: true };
}

/** Removes the line opened under the place of an image that was not placed, when nothing was written in it. */
function closeImagePlace(view: EditorView, anchor: number | undefined) {
  if (anchor === undefined || view.isDestroyed) return;
  const line = view.state.doc.resolve(anchor).nodeAfter;
  if (!line?.isTextblock || line.content.size > 0) return;
  const transaction = view.state.tr.delete(anchor, anchor + line.nodeSize);
  view.dispatch(transaction.setSelection(textSelectionAt(transaction.doc.resolve(anchor))));
}

/**
 * Inserts an uploaded image and returns the position right after it, or null when it was not placed. The writing goes
 * on after the image, in the paragraph that follows it, created when there is none; a selection the person made while
 * the image was sent is kept. The image is never left selected, so the next key never replaces it.
 */
function placeImage(
  view: EditorView,
  image: { id: string; label: string },
  requestedPosition: number | undefined,
  prepare?: (transaction: Transaction) => void,
  personSelection?: Selection,
) {
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
  const after = (insertedPosition as number) + node.nodeSize;
  if (personSelection) transaction.setSelection(personSelection.map(transaction.doc, transaction.mapping));
  else {
    if (!transaction.doc.resolve(after).nodeAfter?.isTextblock)
      transaction.insert(after, view.state.schema.nodes.paragraph!.create());
    transaction.setSelection(TextSelection.create(transaction.doc, after + 1));
  }
  prepare?.(transaction);
  view.dispatch(transaction);
  return after;
}

/**
 * Inserts an uploaded image at its place between two paragraphs and returns the position of the writing under it, or
 * null when it was not placed. The caret, already in the line under the place or where the person moved it, keeps its
 * place in the text.
 */
function placeImageAtPlace(
  view: EditorView,
  image: { id: string; label: string },
  anchor: number,
  prepare: (transaction: Transaction) => void,
  personSelection: Selection | undefined,
) {
  if (view.isDestroyed) return null;
  const node = view.state.schema.nodes.resourceImage!.create(imageAttributes(image));
  if (insertPoint(view.state.doc, anchor, node.type) !== anchor)
    return placeImage(view, image, anchor, prepare, personSelection);
  const transaction = view.state.tr.insert(anchor, node);
  const after = anchor + node.nodeSize;
  if (!transaction.doc.resolve(after).nodeAfter?.isTextblock)
    transaction.insert(after, view.state.schema.nodes.paragraph!.create());
  if (!personSelection) transaction.setSelection(TextSelection.create(transaction.doc, after + 1));
  prepare(transaction);
  view.dispatch(transaction);
  return after + 1;
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
    view.state.tr
      .setSelection(insertionTarget(view, requestedPosition))
      .replaceSelectionWith(node, false)
      .insertText(" "),
  );
  return view.state.selection.to;
}

/** Inserts Markdown content parsed by the editor and returns the position right after it. */
function placeMarkdown(view: EditorView, markdown: string, requestedPosition: number | undefined) {
  const editor = (view.dom as HTMLElement & { editor?: Editor }).editor;
  if (view.isDestroyed || !editor?.markdown) return null;
  const parsed = editor.markdown.parse(markdown);
  const content = Fragment.fromJSON(view.state.schema, parsed.content ?? []);
  const transaction = view.state.tr
    .setSelection(insertionTarget(view, requestedPosition))
    .replaceSelection(new Slice(content, 0, 0));
  view.dispatch(transaction);
  return view.state.selection.to;
}

// @implements-requirement HALL-FR-LAY-010
/**
 * Sends an image while its place, a low box with the loading indicator, is shown in the text; the image then takes that
 * place at its own size. The writing goes on under the place from the choice of the image, so what is written meanwhile
 * stays under the image. Returns the position of the writing under the image, or null when it was not placed; the
 * place, and the line opened under it when nothing was written there, are removed when the image is not placed.
 */
async function uploadIntoPlace(
  view: EditorView,
  file: File,
  requestedPosition: number | undefined,
  upload: EditorImageUpload,
): Promise<number | null> {
  const place = openImagePlace(view, insertionTarget(view, requestedPosition));
  const placeholder = startImagePlaceholder(view, place.anchor);
  if (focusesText(view)) view.focus();
  const startDocument = view.state.doc;
  const startSelection = view.state.selection;
  let placed = false;
  let ratio: number | null = null;
  const unwatch = watchPhotoSize(file, ({ width, height }) => {
    if (width <= 0 || height <= 0) return;
    ratio = width / height;
  });
  try {
    const end = await beginImageUpload();
    try {
      const image = await upload(file);
      if (view.isDestroyed) return null;
      if (ratio !== null) rememberImageRatio(image.id, ratio);
      const after = placeImageAtPlace(
        view,
        image,
        imagePlaceholderAnchor(view.state, placeholder) ?? place.anchor,
        (transaction) => endImagePlaceholder(transaction, placeholder),
        view.state.doc.eq(startDocument) && view.state.selection.eq(startSelection) ? undefined : view.state.selection,
      );
      placed = after !== null;
      return after;
    } finally {
      end();
    }
  } finally {
    unwatch();
    if (!view.isDestroyed && !placed && place.openedLine)
      closeImagePlace(view, imagePlaceholderAnchor(view.state, placeholder));
    if (!view.isDestroyed) removeImagePlaceholder(view, placeholder);
  }
}

export function insertImage(
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
  void uploadIntoPlace(view, file, requestedPosition, upload).then(
    (placed) => onStatus(placed === null ? { kind: "failed" } : idleUploadStatus),
    () => onStatus({ kind: "failed" }),
  );
}

/**
 * Uploads the dropped files one after the other and inserts each at the drop point, after the previous one: a PNG or
 * JPEG as an image of the text when the editor imports images, a spreadsheet as a table of the text when the user
 * chooses it, any other accepted file as a cited document.
 */
async function insertDroppedFiles(
  view: EditorView,
  files: File[],
  requestedPosition: number | undefined,
  uploadImage: EditorImageUpload | undefined,
  documents: EditorDocumentUpload,
  chooseSpreadsheet: ChooseSpreadsheetDrop | undefined,
  onStatus: (status: ImageUploadStatus) => void,
) {
  const asImage = (file: File) => Boolean(uploadImage) && acceptedImageTypes.has(file.type);
  const refused = files.filter((file) => !asImage(file) && !documents.accepts(file));
  const accepted = files.filter((file) => !refused.includes(file));
  let position = requestedPosition;
  let truncated: ImageUploadStatus | null = null;
  const place = (next: number | null) => {
    if (next === null) throw new Error("insertion_failed");
    position = next;
  };
  for (const [index, file] of accepted.entries()) {
    const image = asImage(file);
    const uploading: ImageUploadStatus = {
      kind: "documentUploading",
      name: file.name,
      position: index + 1,
      total: accepted.length,
    };
    try {
      if (image) {
        onStatus({ kind: "uploading" });
        place(await uploadIntoPlace(view, file, position, uploadImage!));
        continue;
      }
      const choice =
        chooseSpreadsheet && documents.convertsToTable(file) ? await chooseSpreadsheet(file) : ("attach" as const);
      if (choice === null) continue;
      if (choice === "table") {
        onStatus({ kind: "tableConverting", name: file.name });
        const table = await documents.convertTable(file);
        place(placeMarkdown(view, table.markdown, position));
        if (table.includedRowCount >= table.rowCount) continue;
        truncated = {
          kind: "tableTruncated",
          name: file.name,
          included: table.includedRowCount,
          total: table.rowCount,
        };
      }
      onStatus(uploading);
      place(placeDocumentReference(view, await documents.upload(file), position));
    } catch {
      onStatus(image ? { kind: "failed" } : { kind: "documentFailed", name: file.name });
      return;
    }
  }
  onStatus(
    refused.length
      ? { kind: "documentRefused", names: refused.map(({ name }) => name), accepted: documents.accepted }
      : (truncated ?? idleUploadStatus),
  );
}

// @implements-requirement HALL-FR-DOC-470
// @implements-requirement HALL-FR-DOC-500
// @implements-requirement HALL-FR-DOC-510
/** ProseMirror handlers shared by the compact and full-screen editors for an image or a file dropped or pasted. */
export function imageTransferHandlers(
  upload: RefObject<EditorImageUpload | undefined>,
  onStatus: RefObject<(status: ImageUploadStatus) => void>,
  documentUpload: RefObject<EditorDocumentUpload | undefined>,
  chooseSpreadsheet: RefObject<ChooseSpreadsheetDrop | undefined>,
) {
  return {
    handleDrop: (view: EditorView, event: globalThis.DragEvent) => {
      const documents = documentUpload.current;
      const files = event.dataTransfer ? [...event.dataTransfer.files] : [];
      if (documents && files.length) {
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertDroppedFiles(
          view,
          files,
          position,
          upload.current,
          documents,
          chooseSpreadsheet.current,
          onStatus.current,
        );
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
      t("editor.documentUploading", { name: name, position: String(position), total: String(total) }),
    documentFailed: ({ name }) => t("editor.documentUploadFailed", { name: name }),
    documentRefused: ({ names, accepted }) =>
      t("editor.documentRefused", { names: names.join(", "), accepted: accepted }),
    tableConverting: ({ name }) => t("editor.tableConverting", { name: name }),
    tableTruncated: ({ name, included, total }) =>
      t("editor.tableTruncated", { name: name, included: String(included), total: String(total) }),
  });
  return (
    <p
      className="markdown-image-status"
      role={
        status.kind === "uploading" ||
        status.kind === "documentUploading" ||
        status.kind === "tableConverting" ||
        status.kind === "tableTruncated"
          ? "status"
          : "alert"
      }
      data-testid="editor-image-status"
      data-status={status.kind}
    >
      {status.kind === "uploading" || status.kind === "documentUploading" || status.kind === "tableConverting" ? (
        <LoadingIndicator label={message} />
      ) : (
        message
      )}
    </p>
  );
}

// @implements-requirement HALL-FR-DOC-510
/** The choice offered for a dropped spreadsheet: attach the file, or insert its first sheet as a table of the text. */
export function useSpreadsheetDropChoice() {
  const { t } = useI18n();
  const [pending, setPending] = useState<{
    file: File;
    resolve(choice: SpreadsheetDropChoice | null): void;
  } | null>(null);
  const choose = useCallback<ChooseSpreadsheetDrop>(
    (file) => new Promise((resolve) => setPending({ file, resolve })),
    [],
  );
  const settle = (choice: SpreadsheetDropChoice | null) => {
    pending?.resolve(choice);
    setPending(null);
  };
  const dialog = pending ? (
    <Modal
      open
      title={t("editor.spreadsheetDropTitle")}
      hint={t("editor.spreadsheetDropDescription", { name: pending.file.name })}
      onClose={() => settle(null)}
      testId="editor-spreadsheet-drop"
    >
      <div className="modal-form">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" data-testid="editor-spreadsheet-drop-attach" onClick={() => settle("attach")}>
            {t("editor.spreadsheetDropAttach")}
          </Button>
          <Button data-testid="editor-spreadsheet-drop-table" onClick={() => settle("table")}>
            {t("editor.spreadsheetDropTable")}
          </Button>
        </div>
      </div>
    </Modal>
  ) : null;
  return { choose, dialog };
}
