/**
 * Bouton de thème de l'en-tête : enregistre le thème opposé à celui de la page et recharge la page. Le thème est
 * appliqué au chargement par le script de tête de chaque page (attribut data-theme de <html>), jamais à chaud.
 */
export function wireThemeSwitch(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-testid="theme-switch"]');
  if (!button) return;
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  button.setAttribute("aria-label", next === "dark" ? "Passer au thème sombre" : "Passer au thème clair");
  button.addEventListener("click", () => {
    try {
      localStorage.setItem("hall-theme", next);
    } catch {
      return;
    }
    window.location.reload();
  });
}
