import { isSafeExternalUrl } from "./externalUrl.js";

/** Suite donnée à une navigation de la fenêtre principale : rester dans Hall, ouvrir dans le navigateur, ou rien. */
export type MainWindowNavigation = "allow" | "external" | "block";

function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Une navigation reste dans la fenêtre seulement vers l'origine de la page Hall affichée. */
export function mainWindowNavigation(currentUrl: string, targetUrl: string): MainWindowNavigation {
  const current = httpOrigin(currentUrl);
  if (current !== null && current === httpOrigin(targetUrl)) return "allow";
  return isSafeExternalUrl(targetUrl) ? "external" : "block";
}

const grantedPermissions: ReadonlySet<string> = new Set(["clipboard-sanitized-write", "fullscreen"]);

/**
 * Permissions accordées aux pages : écriture dans le presse-papiers, plein écran et ouverture d'un lien externe sûr ;
 * caméra, micro, géolocalisation, notifications et les autres sont refusées.
 */
export function permissionGranted(permission: string, externalUrl?: string): boolean {
  if (permission === "openExternal") return externalUrl !== undefined && isSafeExternalUrl(externalUrl);
  return grantedPermissions.has(permission);
}

/** Place of the requesting frame in the main window: its main frame, a frame placed directly in it, or elsewhere. */
export type RequestingFrame = "main" | "childOfMain" | "other";

export interface DemonstrationApiRequest {
  url: string;
  method: string;
  resourceType: string;
  referrer: string;
  frame: RequestingFrame;
}

/**
 * The demonstration session goes with every Hall API request of the main frame. Outside it, only the loading of a
 * Hall document into a frame that a Hall page placed directly in the window receives it: a GET or HEAD navigation of
 * that frame, referred by the Hall page. Requests issued by the content of any frame, writes, and frames placed by
 * other content never receive it.
 */
export function demonstrationSessionApplies(origin: string, request: DemonstrationApiRequest): boolean {
  if (httpOrigin(request.url) !== origin) return false;
  if (request.frame === "main") return true;
  return (
    request.frame === "childOfMain" &&
    request.resourceType === "subFrame" &&
    (request.method === "GET" || request.method === "HEAD") &&
    httpOrigin(request.referrer) === origin
  );
}
