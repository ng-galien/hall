import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IconDefaults } from "../components/icons";
import { I18nProvider } from "../i18n/I18nProvider";
import "../styles.css";
import { startThemeTone } from "../theme/themePrefs";
import { DocsSite } from "./DocsSite";

startThemeTone();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <IconDefaults>
        <DocsSite />
      </IconDefaults>
    </I18nProvider>
  </StrictMode>,
);
