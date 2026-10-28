import { apiPathFromHref, apiResponse } from "./apiClient";

/** A file produced by Hall, ready to be shared or saved on the device. */
export interface SharedFile {
  blob: Blob;
  fileName: string;
}

export type ShareOutcome = "shared" | "cancelled" | "downloaded";

/** Saves the file through a temporary link, as the browser's download does. */
export function downloadFile({ blob, fileName }: SharedFile): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function attachmentName(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
}

/** Reads a file served by the Hall API, named by its attachment header or by the given fallback name. */
export async function apiFile(href: string, fallbackName: string, accept?: string): Promise<SharedFile> {
  const response = await apiResponse(
    href.startsWith("/api") || /^https?:/.test(href) ? apiPathFromHref(href) : href,
    accept ? { headers: { Accept: accept } } : undefined,
  );
  return {
    blob: await response.blob(),
    fileName: attachmentName(response.headers.get("Content-Disposition")) ?? fallbackName,
  };
}

/**
 * Opens the device's share sheet with the file when the browser can share files, and downloads the file otherwise.
 * Closing the sheet shares nothing; a browser that refuses the share after the file was fetched falls back to the
 * download.
 */
// @implements-requirement HALL-FR-DOC-570
export async function shareOrDownload(file: SharedFile): Promise<ShareOutcome> {
  const shared = new File([file.blob], file.fileName, { type: file.blob.type || "application/octet-stream" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [shared] })) {
    try {
      await navigator.share({ files: [shared], title: file.fileName });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) throw error;
    }
  }
  downloadFile(file);
  return "downloaded";
}
