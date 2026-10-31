import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type ElectronApplication, _electron as electron, expect, type Page, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const desktopDirectory = resolve(import.meta.dirname, "../../../desktop");

/**
 * Serveur Hall de test : une page d'application, servie en `applicationDelay` millisecondes, et GET /api/settings
 * avec le code INSEE donné.
 */
async function startHallStub(inseeCode: string | null, applicationDelay = 0): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    if (request.url === "/api/settings") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ name: "Commune de test", inseeCode }));
      return;
    }
    if (request.url?.startsWith("/app/")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.write('<!doctype html><html lang="fr"><body>');
      setTimeout(
        () => response.end('<main data-testid="stub-application">Hall</main></body></html>'),
        applicationDelay,
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

async function launchHall(userDataPath: string, serverUrl: string) {
  return electron.launch({
    executablePath: require("electron") as unknown as string,
    args: [desktopDirectory],
    env: {
      ...process.env,
      HALL_USER_DATA_PATH: userDataPath,
      HALL_DESKTOP_EDITION: "local",
      HALL_SERVER_URL: serverUrl,
    },
  });
}

async function launchPage(application: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => application.windows().some((page) => page.url().startsWith("hall-launch:")), { timeout: 15_000 })
    .toBe(true);
  return application.windows().find((page) => page.url().startsWith("hall-launch:"))!;
}

async function applicationPage(application: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => application.windows().some((page) => page.url().includes("/app/")), { timeout: 30_000 })
    .toBe(true);
  return application.windows().find((page) => page.url().includes("/app/"))!;
}

async function finalAt(page: Page, timeout: number): Promise<number> {
  await expect(page.locator("html")).toHaveAttribute("data-state", "final", { timeout });
  return Number(await page.locator("html").getAttribute("data-final-at"));
}

async function onlyLocalResources(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("hall-launch://screen/")),
  );
}

const alesiaPlace = "Alésia, territoire des Mandubiens";
const alesiaNote = "Oppidum du plateau de Cornu, entre la Lemme et la Saine. Le maire est Vercingétorix.";

async function launchViewOpen(application: ElectronApplication): Promise<boolean> {
  return application.windows().some((page) => page.url().startsWith("hall-launch:"));
}

/** Rectangles des étiquettes de cités affichées qui se chevauchent deux à deux. */
async function overlappingCityLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const shown = [...document.querySelectorAll<HTMLElement>("[data-testid='launch-city']")]
      .filter((element) => Number(element.style.opacity) > 0.01)
      .map((element) => ({ name: element.textContent ?? "", box: element.getBoundingClientRect() }));
    const pairs: string[] = [];
    for (const [index, a] of shown.entries()) {
      for (const b of shown.slice(index + 1)) {
        const apart =
          a.box.right <= b.box.left ||
          b.box.right <= a.box.left ||
          a.box.bottom <= b.box.top ||
          b.box.bottom <= a.box.top;
        if (!apart) pairs.push(`${a.name} / ${b.name}`);
      }
    }
    return pairs;
  });
}

async function storedInseeCode(userDataPath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(userDataPath, "launch-territory.json"), "utf8")).inseeCode;
  } catch {
    return undefined;
  }
}

test.describe("écran de lancement de l'application de bureau", () => {
  let userDataPath: string;
  let stub: { url: string; server: Server } | null = null;
  let application: ElectronApplication | null = null;

  test.beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), "hall-launch-screen-"));
  });

  test.afterEach(async () => {
    await application?.close();
    application = null;
    stub?.server.close();
    stub = null;
    await rm(userDataPath, { recursive: true, force: true });
  });

  test("sans code enregistré : cités antiques, plongée sur Alésia, puis ouverture par le bouton", async () => {
    stub = await startHallStub(null);
    application = await launchHall(userDataPath, stub.url);
    const launch = await launchPage(application);
    await expect(launch.locator("html")).toHaveAttribute("data-commune", "39129");
    await expect(launch.locator("html")).toHaveAttribute("data-presentation", "alesia");
    const lugdunum = launch.getByTestId("launch-city").filter({ hasText: "Lugdunum" });
    await expect(lugdunum).toHaveCSS("opacity", "1", { timeout: 10_000 });
    await expect(launch.locator("html")).toHaveAttribute("data-state", "playing");
    await expect(launch.getByTestId("launch-city").filter({ hasText: "Genava" })).toBeVisible();
    await expect
      .poll(() => launch.evaluate(() => document.querySelectorAll("[data-testid='launch-city']").length))
      .toBe(18);
    await launch.waitForTimeout(800);
    expect(await overlappingCityLabels(launch)).toEqual([]);
    const reached = await finalAt(launch, 15_000);
    expect(reached).toBeGreaterThan(7_000);
    expect(reached).toBeLessThan(10_000);
    await expect(launch.getByTestId("launch-place")).toHaveText(alesiaPlace);
    await expect(launch.getByTestId("launch-note")).toHaveText(alesiaNote);
    expect(await onlyLocalResources(launch)).toEqual([]);
    const open = launch.getByTestId("launch-open");
    await expect(open).toBeEnabled();
    await expect(open).toContainText("Ouvrir Hall");
    await expect(open).toContainText("Entrée");
    await launch.waitForTimeout(2_000);
    expect(await launchViewOpen(application)).toBe(true);
    await open.click();
    await expect.poll(() => launchViewOpen(application!), { timeout: 5_000 }).toBe(false);
    await expect((await applicationPage(application)).getByTestId("stub-application")).toBeVisible();
    await expect.poll(() => storedInseeCode(userDataPath)).toBeNull();
  });

  test("application lente : bouton désactivé pendant la préparation, puis ouverture par Entrée", async () => {
    stub = await startHallStub(null, 14_000);
    application = await launchHall(userDataPath, stub.url);
    const launch = await launchPage(application);
    await finalAt(launch, 15_000);
    const open = launch.getByTestId("launch-open");
    await expect(open).toBeDisabled();
    await expect(launch.getByTestId("launch-step")).toHaveText("Chargement de l’espace de travail");
    await expect(launch.getByTestId("launch-step-count")).toHaveText("2 sur 3");
    await expect(launch.getByTestId("launch-loader")).toHaveAttribute("aria-valuenow", "1");
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await expect(launch.getByTestId("launch-step-count")).toHaveText("3 sur 3");
    await expect(launch.getByTestId("launch-loader")).toHaveCSS("opacity", "0");
    await expect(open).toBeFocused();
    await launch.keyboard.press("Enter");
    await expect.poll(() => launchViewOpen(application!), { timeout: 5_000 }).toBe(false);
    await expect((await applicationPage(application)).getByTestId("stub-application")).toBeVisible();
  });

  test("code enregistré mémorisé : plongée sur sa commune sous son nom officiel", async () => {
    await writeFile(join(userDataPath, "launch-territory.json"), `${JSON.stringify({ inseeCode: "69123" })}\n`);
    stub = await startHallStub("69123");
    application = await launchHall(userDataPath, stub.url);
    const launch = await launchPage(application);
    await expect(launch.locator("html")).toHaveAttribute("data-commune", "69123");
    await expect(launch.locator("html")).toHaveAttribute("data-departement", "69");
    await expect(launch.locator("html")).toHaveAttribute("data-presentation", "official");
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800));
    await expect(launch.getByTestId("launch-city").filter({ hasText: "Lugdunum" })).toHaveCSS("opacity", "1", {
      timeout: 10_000,
    });
    await launch.waitForTimeout(800);
    expect(await overlappingCityLabels(launch)).toEqual([]);
    for (const name of ["Lutèce", "Lugdunum", "Genava"]) {
      await expect(launch.getByTestId("launch-city").filter({ hasText: name })).toHaveAttribute(
        "data-side",
        /right|left/,
      );
    }
    await finalAt(launch, 15_000);
    await expect(launch.getByTestId("launch-place")).toHaveText("Lyon, Rhône");
    await expect(launch.getByTestId("launch-note")).toBeHidden();
    await launch.getByTestId("launch-open").click();
    await expect.poll(() => launchViewOpen(application!), { timeout: 5_000 }).toBe(false);
  });

  test("code lu sur le serveur : mémorisé, puis montré à la relance", async () => {
    stub = await startHallStub("29019");
    application = await launchHall(userDataPath, stub.url);
    await expect((await launchPage(application)).locator("html")).toHaveAttribute("data-commune", "39129");
    await expect.poll(() => storedInseeCode(userDataPath), { timeout: 15_000 }).toBe("29019");
    await application.close();
    application = await launchHall(userDataPath, stub.url);
    const launch = await launchPage(application);
    await expect(launch.locator("html")).toHaveAttribute("data-commune", "29019");
    await expect(launch.getByTestId("launch-place")).toHaveText("Brest, Finistère");
  });

  test("animations réduites : état final immédiat", async () => {
    stub = await startHallStub(null);
    application = await launchHall(userDataPath, stub.url);
    const launch = await launchPage(application);
    await launch.emulateMedia({ reducedMotion: "reduce" });
    await launch.reload();
    const reached = await finalAt(launch, 5_000);
    expect(reached).toBeLessThan(1_500);
    await expect(launch.locator("html")).toHaveAttribute("data-motion", "reduced");
    await expect(launch.getByTestId("launch-place")).toHaveText(alesiaPlace);
    await expect(launch.getByTestId("launch-open")).toBeEnabled();
    await launch.getByTestId("launch-open").click();
    await expect.poll(() => launchViewOpen(application!), { timeout: 5_000 }).toBe(false);
  });
});
