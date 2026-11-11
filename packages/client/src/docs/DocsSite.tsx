import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { DarkThemeIcon, LightThemeIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import type { Locale } from "../i18n/I18nProvider";
import { useI18n } from "../i18n/I18nProvider";
import { resolveTone, useThemePrefsStore } from "../theme/themePrefs";
import { DocsArea } from "./DocsArea";

/* The documentation as a site of its own: no server, no application; the same pages, a hash router
   (works from a file:// URL), a minimal header with the language and the theme. Built by
   `npm run build:docs` into one self-contained HTML file. */

export function DocsSite() {
  const { t, locale, setLocale } = useI18n();
  const preference = useThemePrefsStore((state) => state.preference);
  const setPreference = useThemePrefsStore((state) => state.setPreference);
  const tone = resolveTone(preference);

  const site = (
    <div className="docs-site">
      <header className="docs-site-header">
        <span className="docs-site-brand">
          <span className="docs-site-mark">H</span>
          <span className="docs-site-name">{t("app.name")}</span>
          <span className="docs-site-subtitle">· {t("docs.title")}</span>
        </span>
        <div className="docs-site-controls">
          <div className="docs-site-locales">
            {(["fr", "en"] as Locale[]).map((candidate) => (
              <Button
                variant="secondary"
                key={candidate}
                type="button"
                aria-pressed={locale === candidate}
                onClick={() => setLocale(candidate)}
              >
                {candidate === "fr" ? "Français" : "English"}
              </Button>
            ))}
          </div>
          <Button
            variant="plain"
            size="icon"
            type="button"
            aria-label={tone === "dark" ? t("docs.site.useLight") : t("docs.site.useDark")}
            onClick={() => setPreference(tone === "dark" ? "light" : "dark")}
          >
            {tone === "dark" ? <LightThemeIcon aria-hidden="true" /> : <DarkThemeIcon aria-hidden="true" />}
          </Button>
        </div>
      </header>
      <main className="docs-site-main">
        <Routes>
          <Route path="/docs/*" element={<DocsArea />} />
          <Route path="*" element={<Navigate to="/docs" replace />} />
        </Routes>
      </main>
    </div>
  );

  return (
    <HashRouter>
      <Routes>
        <Route path="*" element={site} />
      </Routes>
    </HashRouter>
  );
}
