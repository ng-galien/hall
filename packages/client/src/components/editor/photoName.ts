import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useI18n } from "../../i18n/I18nProvider";
import type { EditorImageUpload } from "./imageTransfer";

/** Names that a camera, a phone gallery or a capture tool gives to a file, followed by a number or a date. */
const deviceNamePrefix =
  /^(?:img|image|photo|picture|pic|pxl|dsc|dscn|dscf|dcim|mvimg|cimg|sam|wp|fb_img|screenshot|capture|clipboard|codex-clipboard|scan|cam|camera|signal|whatsapp image|received|file)(?=$|[\s_.-]|\d)/i;

function stemOf(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, "").trim();
}

/** True for a name that a device or a program gave to the photo, not a person: identifier, number, IMG_1234... */
export function isDeviceFileName(fileName: string): boolean {
  const stem = stemOf(fileName);
  if (!stem) return true;
  if (/^[\d\s_.:()-]+$/.test(stem)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stem)) return true;
  if (/^[0-9a-f_-]{16,}$/i.test(stem) && /\d/.test(stem)) return true;
  const prefix = deviceNamePrefix.exec(stem);
  if (!prefix) return false;
  const rest = stem.slice(prefix[0].length);
  return (
    rest === "" || (/\d/.test(rest) && !/[a-z]{3,}/i.test(rest.replace(/\b(?:at|edited|burst|cover|portrait)\b/gi, "")))
  );
}

function plausible(date: Date): Date | null {
  const year = date.getFullYear();
  return Number.isNaN(date.getTime()) || year < 2000 || year > 2100 ? null : date;
}

/** The moment written in a device name: a date and hour (20261115_143212), a date, or a time stamp in milliseconds. */
export function deviceFileDate(fileName: string): Date | null {
  const stem = stemOf(fileName);
  const written =
    /(?<!\d)(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})(?:[\s_T.-]*(?:at\s*)?(\d{2})[-_.:h]?(\d{2})(?:[-_.:]?(\d{2}))?)?/i.exec(
      stem,
    );
  if (written) {
    const [, year, month, day, hour = "0", minute = "0"] = written;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (date.getMonth() === Number(month) - 1 && plausible(date)) return date;
  }
  const stamp = /(?<!\d)(\d{13})(?!\d)/.exec(stem);
  return stamp ? plausible(new Date(Number(stamp[1]))) : null;
}

/** Words of a photo name: the day with its year, and the hour. */
export interface PhotoNameWords {
  day(date: Date): string;
  hour(date: Date): string;
  name(day: string): string;
  nameAt(day: string, hour: string): string;
}

/**
 * The name shown for a photo: the name given by a person, without its extension, or for a device name the day of the
 * photo, with its hour when another photo of the same day already has that name.
 */
export function readablePhotoName(
  fileName: string,
  moment: Date,
  taken: readonly string[],
  words: PhotoNameWords,
): string {
  if (!isDeviceFileName(fileName)) return stemOf(fileName);
  const date = deviceFileDate(fileName) ?? moment;
  const name = words.name(words.day(date));
  return taken.includes(name) ? words.nameAt(words.day(date), words.hour(date)) : name;
}

/** The names of the images already in the text. */
export function imageNamesOf(doc: ProseMirrorNode | undefined): string[] {
  const names: string[] = [];
  doc?.descendants((node) => {
    if (node.type.name === "resourceImage" && typeof node.attrs.alt === "string") names.push(node.attrs.alt);
  });
  return names;
}

function usePhotoNameWords(): PhotoNameWords {
  const { t, locale } = useI18n();
  const tag = locale === "fr" ? "fr-FR" : "en-GB";
  return {
    day: (date) => {
      const day = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(date);
      return locale === "fr" && date.getDate() === 1 ? day.replace(/^1(?=\s)/, "1er") : day;
    },
    hour: (date) =>
      t("editor.photoHour", { hour: String(date.getHours()), minute: String(date.getMinutes()).padStart(2, "0") }),
    name: (day) => t("editor.photoName", { day }),
    nameAt: (day, hour) => t("editor.photoNameAt", { day, hour }),
  };
}

/** The name an image of the text shows: a device name is replaced by « Photo », never shown as is. */
export function useImageDisplayName(): (name: string) => string {
  const { t } = useI18n();
  const words = usePhotoNameWords();
  return (name) => {
    if (!isDeviceFileName(name)) return name;
    const date = deviceFileDate(name);
    return date ? words.name(words.day(date)) : t("editor.photo");
  };
}

// @implements-requirement HALL-FR-LAY-010
/**
 * Sends a photo under a readable name: a photo taken or chosen on a device, whose file name is an identifier, a number
 * or a generic name, takes the name of its day; a name given by a person is kept.
 */
export function useReadablePhotoUpload(
  upload: EditorImageUpload | undefined,
  doc: () => ProseMirrorNode | undefined,
): EditorImageUpload | undefined {
  const words = usePhotoNameWords();
  if (!upload) return undefined;
  return (file: File) => {
    const moment = file.lastModified > 0 ? new Date(file.lastModified) : new Date();
    const name = readablePhotoName(file.name, moment, imageNamesOf(doc()), words);
    const extension = /\.[a-z0-9]{1,5}$/i.exec(file.name)?.[0] ?? (file.type === "image/png" ? ".png" : ".jpg");
    return upload(new File([file], `${name}${extension}`, { type: file.type, lastModified: file.lastModified }));
  };
}
