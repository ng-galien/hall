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
