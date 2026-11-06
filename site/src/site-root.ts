import publicFileVersions from "virtual:public-file-versions";

/** Racine du site, déclarée par chaque page dans l'attribut data-site-root de <html>. */
export const siteRoot = new URL(document.documentElement.dataset.siteRoot ?? "./", window.location.href).href;

/** Adresse d'un fichier de public/, suivie de l'empreinte de son contenu. */
export function publicFileUrl(path: string): string {
  const version = publicFileVersions[path];
  return version ? `${siteRoot}${path}?v=${version}` : `${siteRoot}${path}`;
}
