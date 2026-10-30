import type { Editor } from "@tiptap/react";
import { useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { ImageIcon } from "../icons";
import { Button } from "../ui/button";
import { type EditorImageUpload, type ImageUploadStatus, insertImage } from "./imageTransfer";

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-DOC-230
// @implements-requirement HALL-FR-DOC-430
// @implements-requirement HALL-FR-WSP-460
/**
 * Image buttons of the editor. Without a photo import, Choose a photo and Take a photo insert an image of the text;
 * with one (the note of a map drawing), Upload an image inserts an image of the text and the two photo buttons import
 * the photo as a file that the text shows.
 */
export function ImageFileControls({
  editor,
  upload,
  uploadPhoto,
  status,
  onStatus,
}: {
  editor: Editor;
  upload?: EditorImageUpload;
  uploadPhoto?: EditorImageUpload;
  status: ImageUploadStatus;
  onStatus(status: ImageUploadStatus): void;
}) {
  const { t } = useI18n();
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const position = useRef<number | undefined>(undefined);
  const busy = status.kind === "uploading";
  const photoUpload = uploadPhoto ?? upload;
  const choose = (input: HTMLInputElement | null) => {
    position.current = editor.state.selection.from;
    input?.click();
  };
  const receive = (input: HTMLInputElement, target: EditorImageUpload | undefined) => {
    const file = input.files?.[0];
    input.value = "";
    if (file && target && !editor.isDestroyed && editor.isEditable)
      insertImage(editor.view, file, position.current, target, onStatus);
  };
  return (
    <div className="editor-image-file-controls" aria-busy={busy}>
      {uploadPhoto && upload ? (
        <>
          <Button
            variant="outline"
            type="button"
            data-testid="editor-upload-image"
            disabled={busy}
            onClick={() => choose(image.current)}
          >
            <ImageIcon />
            {t("editor.imageUpload")}
          </Button>
          <input
            ref={image}
            hidden
            type="file"
            accept="image/png,image/jpeg"
            data-testid="editor-upload-image-file"
            onChange={(event) => receive(event.currentTarget, upload)}
          />
        </>
      ) : null}
      {photoUpload ? (
        <>
          <Button
            variant="outline"
            type="button"
            data-testid="editor-choose-image"
            disabled={busy}
            onClick={() => choose(library.current)}
          >
            <ImageIcon />
            {t("editor.choosePhoto")}
          </Button>
          <Button
            variant="outline"
            type="button"
            data-testid="editor-take-photo"
            disabled={busy}
            onClick={() => choose(camera.current)}
          >
            {t("editor.takePhoto")}
          </Button>
          <input
            ref={library}
            hidden
            type="file"
            accept="image/png,image/jpeg"
            data-testid="editor-image-file"
            onChange={(event) => receive(event.currentTarget, photoUpload)}
          />
          <input
            ref={camera}
            hidden
            type="file"
            accept="image/png,image/jpeg"
            capture="environment"
            data-testid="editor-camera-file"
            onChange={(event) => receive(event.currentTarget, photoUpload)}
          />
        </>
      ) : null}
    </div>
  );
}
