import type { Editor } from "@tiptap/react";
import { useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { ImageIcon } from "../icons";
import { Button } from "../ui/button";
import { type EditorImageUpload, type ImageUploadStatus, insertImage } from "./imageTransfer";

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-DOC-230
export function ImageFileControls({
  editor,
  upload,
  status,
  onStatus,
}: {
  editor: Editor;
  upload: EditorImageUpload;
  status: ImageUploadStatus;
  onStatus(status: ImageUploadStatus): void;
}) {
  const { t } = useI18n();
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const position = useRef<number | undefined>(undefined);
  const busy = status.kind === "uploading";
  const choose = (input: HTMLInputElement | null) => {
    position.current = editor.state.selection.from;
    input?.click();
  };
  const receive = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file && !editor.isDestroyed && editor.isEditable)
      insertImage(editor.view, file, position.current, upload, onStatus);
  };
  return (
    <div className="editor-image-file-controls" aria-busy={busy}>
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
        onChange={(event) => receive(event.currentTarget)}
      />
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/png,image/jpeg"
        capture="environment"
        data-testid="editor-camera-file"
        onChange={(event) => receive(event.currentTarget)}
      />
    </div>
  );
}
