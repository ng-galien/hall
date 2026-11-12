import type { Editor } from "@tiptap/react";
import { type ReactNode, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { CameraIcon, ImageIcon, UploadIcon } from "../icons";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ListRow, ListRows } from "../ui/list-row";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { type EditorImageUpload, type ImageUploadStatus, insertImage } from "./imageTransfer";

/** One way to bring an image into the text. */
export interface ImageChoice {
  id: "take-photo" | "choose-photo" | "upload-image";
  label: string;
  icon: ReactNode;
  testId: string;
  select(): void;
}

// @implements-requirement HALL-FR-LAY-010
// @implements-requirement HALL-FR-DOC-230
// @implements-requirement HALL-FR-DOC-430
// @implements-requirement HALL-FR-WSP-460
/**
 * The file inputs of the images of the editor and the choices that open them. Without a photo import, Take a photo
 * and Choose a photo insert an image of the text; with one (the note of a map drawing), Upload an image inserts an
 * image of the text and the two photo choices import the photo as a file that the text shows.
 */
export function useImageFiles({
  editor,
  upload,
  uploadPhoto,
  onStatus,
}: {
  editor: Editor | null;
  upload?: EditorImageUpload;
  uploadPhoto?: EditorImageUpload;
  onStatus(status: ImageUploadStatus): void;
}): { inputs: ReactNode; photos: ImageChoice[]; uploads: ImageChoice[] } {
  const { t } = useI18n();
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const position = useRef<number | undefined>(undefined);
  const photoUpload = uploadPhoto ?? upload;
  if (!editor) return { inputs: null, photos: [], uploads: [] };
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
  const photos: ImageChoice[] = photoUpload
    ? [
        {
          id: "take-photo",
          label: t("editor.takePhoto"),
          icon: <CameraIcon />,
          testId: "editor-take-photo",
          select: () => choose(camera.current),
        },
        {
          id: "choose-photo",
          label: t("editor.choosePhoto"),
          icon: <ImageIcon />,
          testId: "editor-choose-image",
          select: () => choose(library.current),
        },
      ]
    : [];
  const uploads: ImageChoice[] =
    uploadPhoto && upload
      ? [
          {
            id: "upload-image",
            label: t("editor.imageUpload"),
            icon: <UploadIcon />,
            testId: "editor-upload-image",
            select: () => choose(image.current),
          },
        ]
      : [];
  const inputs = (
    <>
      {uploads.length > 0 ? (
        <input
          ref={image}
          hidden
          type="file"
          accept="image/png,image/jpeg"
          data-testid="editor-upload-image-file"
          onChange={(event) => receive(event.currentTarget, upload)}
        />
      ) : null}
      {photoUpload ? (
        <>
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
    </>
  );
  return { inputs, photos, uploads };
}

/**
 * « Photo » at the right of the writing tools of a phone: it opens the bottom sheet of the application with Take a
 * photo and Choose a photo, and Upload an image for the note of a map drawing.
 */
export function PhotoSheetButton({ choices, busy }: { choices: ImageChoice[]; busy: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (choices.length === 0) return null;
  return (
    <>
      <Button
        variant="plain"
        type="button"
        className="editor-photo-control"
        data-testid="editor-photo"
        aria-expanded={open}
        disabled={busy}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(true)}
      >
        {t("editor.photo")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="app-sheet"
          placement="bottom"
          closeLabel={t("common.close")}
          aria-describedby={undefined}
          data-testid="editor-photo-sheet"
        >
          <DialogTitle>{t("editor.addPhoto")}</DialogTitle>
          <ListRows>
            {choices.map((choice) => (
              <ListRow
                key={choice.id}
                onOpen={() => {
                  setOpen(false);
                  choice.select();
                }}
                openTestId={choice.testId}
                head={
                  <span className="type-icon" aria-hidden="true">
                    {choice.icon}
                  </span>
                }
                title={choice.label}
              />
            ))}
          </ListRows>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The image command of the tool bar of a tablet or a computer: a menu of the ways to bring an image into the text. */
export function ImageMenuButton({ choices, busy }: { choices: ImageChoice[]; busy: boolean }) {
  const { t } = useI18n();
  if (choices.length === 0) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="plain"
              size="icon"
              type="button"
              data-testid="editor-image-menu"
              aria-label={t("editor.insertImage")}
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
            >
              <ImageIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={6}>
          {t("editor.insertImage")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-max">
        {choices.map((choice) => (
          <DropdownMenuItem key={choice.id} data-testid={choice.testId} onSelect={choice.select}>
            {choice.icon}
            {choice.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
