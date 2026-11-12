import { useSyncExternalStore } from "react";

/**
 * Orders the saving of a text around the upload of its images. The server keeps only the images that the saved content
 * cites, so no save whose content was taken before an image was created may reach it after that image: an upload first
 * waits for the saves already sent, and no automatic save starts until the image is created and placed in the text.
 */
let uploads = 0;
const saves = new Set<Promise<unknown>>();
const listeners = new Set<() => void>();
let settledWaiters: Array<() => void> = [];

function notify() {
  for (const listener of listeners) listener();
}

/** Registers a save sent to the server, so that the next image upload waits for it. */
export function trackTextSave<Result>(save: Promise<Result>): Promise<Result> {
  saves.add(save);
  const forget = () => saves.delete(save);
  save.then(forget, forget);
  return save;
}

/** Starts an image upload once the saves already sent have ended; the returned function ends it. */
export async function beginImageUpload(): Promise<() => void> {
  uploads += 1;
  notify();
  await Promise.allSettled([...saves]);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    uploads -= 1;
    notify();
    if (uploads === 0) {
      const waiters = settledWaiters;
      settledWaiters = [];
      for (const waiter of waiters) waiter();
    }
  };
}

/**
 * Resolves once no image is uploading and the text has taken the last placed image, so that a save asked meanwhile
 * leaves with the content that cites it.
 */
export async function imageUploadsSettled(): Promise<void> {
  if (uploads > 0) await new Promise<void>((resolve) => settledWaiters.push(resolve));
  await new Promise((resolve) => window.setTimeout(resolve, contentSettleDelay));
}

/** Time left to the editor and the screen to take the content holding a placed image. */
const contentSettleDelay = 50;

export function imageUploadsPending(): boolean {
  return uploads > 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while an image of a text is being uploaded; automatic saving waits for it. */
export function useImageUploadsPending(): boolean {
  return useSyncExternalStore(subscribe, imageUploadsPending);
}
