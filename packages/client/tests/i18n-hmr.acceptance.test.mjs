import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { test } from "vitest";

test("catalog hot refresh preserves translated consumers under the application provider", {
  timeout: 60000,
}, async () => {
  const fixture = await mkdtemp(join(tmpdir(), "hall-i18n-hmr-"));
  let server;
  let browser;
  try {
    await cp(join(import.meta.dirname, "../src/i18n"), join(fixture, "i18n"), { recursive: true });
    await writeFile(
      join(fixture, "index.html"),
      '<div id="root"></div><script type="module" src="/main.tsx"></script>',
    );
    await writeFile(
      join(fixture, "main.tsx"),
      `import {createRoot} from 'react-dom/client';
import {I18nProvider} from './i18n/I18nProvider';
import {App} from './App';
createRoot(document.getElementById('root')!).render(<I18nProvider><App/></I18nProvider>);`,
    );
    await writeFile(
      join(fixture, "App.tsx"),
      `import {createBrowserRouter,RouterProvider} from 'react-router-dom';
import {useI18n} from './i18n/I18nProvider';
function Consumer(){return <p data-testid="translation">{useI18n().t('common.cancel')}</p>}
const router=createBrowserRouter([{path:'/',element:<Consumer/>}]);
export function App(){return <RouterProvider router={router}/>}`,
    );
    server = await createServer({
      configFile: false,
      root: fixture,
      plugins: [react()],
      resolve: {
        alias: {
          react: join(import.meta.dirname, "../../../node_modules/react"),
          "react-dom": join(import.meta.dirname, "../../../node_modules/react-dom"),
          "react-router-dom": join(import.meta.dirname, "../../../node_modules/react-router-dom"),
        },
      },
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
    await page.goto(server.resolvedUrls.local[0]);
    await page.getByTestId("translation").waitFor();
    assert.equal(await page.getByTestId("translation").textContent(), "Annuler");
    const catalog = join(fixture, "i18n/fr.ts");
    await writeFile(
      catalog,
      (await readFile(catalog, "utf8")).replace('"common.cancel": "Annuler"', '"common.cancel": "Annuler modifié"'),
    );
    await page.waitForFunction(
      () => document.querySelector('[data-testid="translation"]')?.textContent === "Annuler modifié",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server?.close();
    await rm(fixture, { recursive: true, force: true });
  }
});
