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
async function startHallStub(
  inseeCode: string | null,
  applicationDelay = 0,
): Promise<{ url: string; server: Server; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
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
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, requests };
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
const alesiaNote = "Oppidum du plateau d’Alésia, entre la Lemme et la Saine. Le maire est Vercingétorix.";

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
  let stub: { url: string; server: Server; requests: string[] } | null = null;
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
    const startedAt = Number(await launch.locator("html").getAttribute("data-started-at"));
    expect(reached - startedAt).toBeGreaterThan(9_000);
    expect(reached - startedAt).toBeLessThan(11_000);
    await expect(launch.getByTestId("launch-place")).toHaveText(alesiaPlace);
    await expect(launch.getByTestId("launch-note")).toHaveText(alesiaNote);
    expect(await onlyLocalResources(launch)).toEqual([]);
    const open = launch.getByTestId("launch-open");
    await expect(open).toBeEnabled();
    await expect(open).toContainText("Démarrer Hall");
    await expect(open).toContainText("Entrée");
    await launch.waitForTimeout(2_000);
    expect(await launchViewOpen(application)).toBe(true);
    await open.click();
    await expect.poll(() => launchViewOpen(application!), { timeout: 5_000 }).toBe(false);
    await expect((await applicationPage(application)).getByTestId("stub-application")).toBeVisible();
    expect(await storedInseeCode(userDataPath)).toBeUndefined();
    expect(stub.requests).not.toContain("/api/settings");
  });

  test("application lente : bouton désactivé pendant la préparation, puis ouverture par Entrée", async () => {
    stub = await startHallStub(null, 14_000);
    application = await launchHall(userDataPath, stub.url);
    const launch = await launchPage(application);
    await finalAt(launch, 15_000);
    const open = launch.getByTestId("launch-open");
    await expect(open).toBeDisabled();
    await launch.keyboard.press("Enter");
    expect(await launchViewOpen(application)).toBe(true);
    await expect(launch.getByTestId("launch-step")).toHaveText("Chargement de l’interface");
    await expect(launch.getByTestId("launch-step-count")).toHaveText("1 sur 1");
    const loader = launch.getByTestId("launch-loader");
    const early = Number(await loader.getAttribute("data-progress"));
    await launch.waitForTimeout(1_000);
    const later = Number(await loader.getAttribute("data-progress"));
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThan(1);
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await expect(launch.getByTestId("launch-step")).toHaveText("Espace de travail prêt");
    await expect(launch.getByTestId("launch-step-count")).toHaveText("1 sur 1");
    await expect(loader).toHaveAttribute("aria-valuenow", "100");
    await expect(launch.getByTestId("launch-loader")).toHaveCSS("opacity", "0");
    await expect(open).toBeFocused();
    await launch.keyboard.press("Enter");
    await expect.poll(() => launchViewOpen(application!), { timeout: 5_000 }).toBe(false);
    await expect((await applicationPage(application)).getByTestId("stub-application")).toBeVisible();
  });

  /** @verifies-requirement HALL-TR-DSK-020 */
  test("a historical municipality code never changes Alésia or triggers a settings read, including on relaunch", async () => {
    const original = `${JSON.stringify({ inseeCode: "69123" })}\n`;
    await writeFile(join(userDataPath, "launch-territory.json"), original);
    stub = await startHallStub("29019");
    for (let run = 0; run < 2; run += 1) {
      application = await launchHall(userDataPath, stub.url);
      const launch = await launchPage(application);
      await expect(launch.locator("html")).toHaveAttribute("data-commune", "39129");
      await expect(launch.locator("html")).toHaveAttribute("data-presentation", "alesia");
      await finalAt(launch, 20_000);
      await expect(launch.getByTestId("launch-place")).toHaveText(alesiaPlace);
      await expect(launch.getByTestId("launch-open")).toBeEnabled();
      const before = JSON.parse((await launch.locator("html").getAttribute("data-frame-statistics")) ?? "{}");
      await launch.waitForTimeout(2_000);
      const after = JSON.parse((await launch.locator("html").getAttribute("data-frame-statistics")) ?? "{}");
      expect(after.frames).toBeGreaterThan(before.frames);
      await launch.getByTestId("launch-open").click();
      await expect.poll(() => launchViewOpen(application!)).toBe(false);
      await application.close();
      application = null;
      expect(await readFile(join(userDataPath, "launch-territory.json"), "utf8")).toBe(original);
      expect(stub.requests).not.toContain("/api/settings");
    }
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
