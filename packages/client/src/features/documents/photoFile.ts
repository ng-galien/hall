const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Names a photo taken on site or chosen in the gallery after the moment it is imported, so that successive photos of
 * one place never collide and read in order; the extension follows the image type.
 */
// @implements-requirement HALL-FR-WSP-460
export function photoFile(file: File, name: (date: string) => string, now = new Date()): File {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const extension = file.type === "image/png" ? "png" : "jpg";
  return new File([file], `${name(date)}.${extension}`, { type: file.type, lastModified: file.lastModified });
}
