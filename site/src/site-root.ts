/** Racine du site, déclarée par chaque page dans l'attribut data-site-root de <html>. */
export const siteRoot = new URL(document.documentElement.dataset.siteRoot ?? "./", window.location.href).href;
