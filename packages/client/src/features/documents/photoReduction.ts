/** Bounds of a photo sent to Hall: the only place where they are written. */
export const photoReduction = {
  /** Upper limit, in pixels, of the longest side of a photo sent; a photo within it is sent as it is. */
  longestSide: 2560,
  /** JPEG quality of a reduced photo. */
  jpegQuality: 0.8,
} as const;

/** Image formats of a camera or a gallery; a vector image, an animation or a PDF is never reduced. */
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"]);

/** A decoded image, already turned as its orientation says. */
export interface DecodedPhoto {
  width: number;
  height: number;
  /** Draws the image at the given size. */
  draw(width: number, height: number): DrawnPhoto;
  close(): void;
}

export interface DrawnPhoto {
  /** True when every pixel is fully opaque. */
  opaque(): boolean;
  jpeg(quality: number): Promise<Blob>;
}

export type DecodePhoto = (file: Blob) => Promise<DecodedPhoto>;

/** Decodes with the image decoder of the browser, which applies the orientation recorded by the camera. */
const decodeInBrowser: DecodePhoto = async (file) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas_unavailable");
      context.drawImage(bitmap, 0, 0, width, height);
      return {
        opaque() {
          const { data } = context.getImageData(0, 0, width, height);
          for (let index = 3; index < data.length; index += 4) if (data[index] !== 255) return false;
          return true;
        },
        jpeg: (quality) =>
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error("encoding_failed"))),
              "image/jpeg",
              quality,
            ),
          ),
      };
    },
    close: () => bitmap.close(),
  };
};

/** Size of a decoded photo, in pixels, turned as its orientation says. */
export interface PhotoSize {
  width: number;
  height: number;
}

const sizeWatchers = new WeakMap<Blob, (size: PhotoSize) => void>();

/**
 * Calls back once with the size of the photo when its reduction decodes it, before it is sent; the returned function
 * stops watching. A file that is not decoded is never reported.
 */
export function watchPhotoSize(file: Blob, watcher: (size: PhotoSize) => void): () => void {
  sizeWatchers.set(file, watcher);
  return () => {
    if (sizeWatchers.get(file) === watcher) sizeWatchers.delete(file);
  };
}

function reportPhotoSize(file: Blob, image: DecodedPhoto) {
  const watcher = sizeWatchers.get(file);
  sizeWatchers.delete(file);
  const size = { width: image.width, height: image.height };
  if (watcher) queueMicrotask(() => watcher(size));
}

function jpegName(name: string): string {
  if (/\.jpe?g$/i.test(name)) return name;
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`;
}

// @implements-requirement HALL-FR-LAY-010
/**
 * The photo to send instead of the chosen one: brought down to the longest side of photoReduction and encoded as
 * JPEG, turned as its orientation says. An image within that side, whatever its weight, an image with a
 * transparent pixel, a file that is not a photo and an image the browser cannot decode are sent as they are.
 */
export async function reducePhoto(file: File, decode: DecodePhoto = decodeInBrowser): Promise<File> {
  if (!photoTypes.has(file.type)) return file;
  let image: DecodedPhoto | undefined;
  try {
    image = await decode(file);
    reportPhotoSize(file, image);
    const longest = Math.max(image.width, image.height);
    if (longest <= photoReduction.longestSide) return file;
    const scale = photoReduction.longestSide / longest;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const drawn = image.draw(width, height);
    if (file.type !== "image/jpeg" && !drawn.opaque()) return file;
    const encoded = await drawn.jpeg(photoReduction.jpegQuality);
    return new File([encoded], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    image?.close();
  }
}

/**
 * Replaces the photo of an upload form by its reduced version, and its name field when it was the name of the file.
 */
export async function reducePhotoOfForm(form: FormData, decode?: DecodePhoto): Promise<FormData> {
  const file = form.get("file");
  if (!(file instanceof File)) return form;
  const reduced = await reducePhoto(file, decode);
  if (reduced === file) return form;
  form.set("file", reduced);
  if (form.get("name") === file.name) form.set("name", reduced.name);
  return form;
}
