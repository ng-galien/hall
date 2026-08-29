import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "auto" | "light" | "dark";
export type ThemeTone = "light" | "dark";

interface ThemePrefsState {
  preference: ThemePreference;
  setPreference(preference: ThemePreference): void;
}

const darkQuery = () => (typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)"));

/** Effective rendered tone; "auto" follows the system setting. */
export function resolveTone(preference: ThemePreference): ThemeTone {
  if (preference !== "auto") return preference;
  return darkQuery()?.matches ? "dark" : "light";
}

/** Sets the tone on the document root; light removes `data-theme` instead of setting it. */
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

/** Applies the tone once at startup and tracks the system while the preference is "auto"; call before render. */
export function startThemeTone(): void {
  applyTone(resolveTone(useThemePrefsStore.getState().preference));
  darkQuery()?.addEventListener("change", () => {
    const { preference } = useThemePrefsStore.getState();
    if (preference === "auto") applyTone(resolveTone(preference));
  });
}
