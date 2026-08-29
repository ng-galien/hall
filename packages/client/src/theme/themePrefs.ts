import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "auto" | "light" | "dark";
export type ThemeTone = "light" | "dark";

interface ThemePrefsState {
  preference: ThemePreference;
  setPreference(preference: ThemePreference): void;
}

const darkQuery = () => (typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)"));

/** Le ton effectivement rendu : « auto » suit le réglage du système. */
export function resolveTone(preference: ThemePreference): ThemeTone {
  if (preference !== "auto") return preference;
  return darkQuery()?.matches ? "dark" : "light";
}

/**
 * Pose le ton sur la racine du document. Le CSS ne connaît que `data-theme="dark"` : le ton clair
 * est la définition de base des tokens, donc l'attribut est retiré plutôt que mis à « light ».
 */
function applyTone(tone: ThemeTone): void {
  const root = document.documentElement;
  if (tone === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}

export const useThemePrefsStore = create<ThemePrefsState>()(
  persist(
    (set) => ({
      preference: "auto",
      setPreference(preference) {
        set({ preference });
        applyTone(resolveTone(preference));
      },
    }),
    {
      name: "hall.theme.prefs",
      onRehydrateStorage: () => (state) => applyTone(resolveTone(state?.preference ?? "auto")),
    },
  ),
);

/**
 * Applique le ton au démarrage et suit le système tant que la préférence est « auto ».
 * Appelé une fois depuis le point d'entrée, avant le rendu.
 */
export function startThemeTone(): void {
  applyTone(resolveTone(useThemePrefsStore.getState().preference));
  darkQuery()?.addEventListener("change", () => {
    const { preference } = useThemePrefsStore.getState();
    if (preference === "auto") applyTone(resolveTone(preference));
  });
}
