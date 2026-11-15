import { expect, type Page, test } from "@playwright/test";
import { installationGuides, installationIntroduction } from "../src/installation";

/* L'ouverture animée de la carte se termine d'elle-même avec moins de mouvement : les scénarios partent de la carte. */
test.use({ contextOptions: { reducedMotion: "reduce" } });

const order = [
  "ouverture",
  "veille",
  "carte",
  "grenier",
  "ouvrages",
  "defense",
  "convocation",
  "appel",
  "rationnement",
  "motion",
  "actes",
] as const;
const withCaptures = order.filter((id) => id !== "ouverture");
const releases = "https://github.com/ng-galien/hall/releases";
const documentation = "../documentation/index.html#/docs";
const outsideTheGame = /Berthier|Alise|Foncine|thèse|clin d[’']œil/i;
const presentDayObjects = /mairie|salle polyvalente|école|église|route nationale|voie ferrée|Pont de la Chaux/i;

/** Sur téléphone la visionneuse n'a pas de barre de boutons : un toucher sur la capture montre les flèches. */
const phoneViewer = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 900;

async function stepViewer(page: Page, direction: "previous" | "next") {
  if (!phoneViewer(page)) {
    await page.getByTestId(`viewer-${direction}`).click();
    return;
  }
  await page.getByTestId("viewer-shot").click({ position: { x: 8, y: 8 } });
  await page.getByTestId(`viewer-chevron-${direction}`).click();
}

async function expectCapturesLoaded(page: Page, scope: string) {
  const images = page.locator(`${scope} img`);
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const image = images.nth(i);
    await image.evaluate((img) => {
      const panel = img.closest<HTMLElement>(".scenario-panel");
      if (!panel) {
        img.scrollIntoView({ block: "center", behavior: "instant" });
        return;
      }
      panel.scrollTop += img.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
    });
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  }
}

/** Attend la fin du défilement fluide : la position de la page ne bouge plus. */
async function scrollSettled(page: Page) {
  await expect
    .poll(async () => {
      const before = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(150);
      return before === (await page.evaluate(() => window.scrollY));
    })
    .toBe(true);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Fichiers de la dernière version publiée, un par ligne de la section Télécharger, le serveur en dernier. */
const downloadFiles = {
  windows: /^windows-x64-.*-Setup\.exe$/,
  "macos-arm64": /^macos-arm64-.*\.dmg$/,
  "macos-x64": /^macos-x64-.*\.dmg$/,
  "linux-deb": /^linux-x64-.*\.deb$/,
  "linux-rpm": /^linux-x64-.*\.rpm$/,
  server: /^ng-galien-hall-.*\.tgz$/,
} as const;
const directDownload = /^https:\/\/github\.com\/ng-galien\/hall\/releases\/download\/v(\d+\.\d+\.\d+)\/([^/]+)$/;

/** Chaque bouton « Télécharger » mène directement au fichier de son système dans la dernière version publiée. */
async function expectLinks(page: Page, place: "accueil" | "alesia" = "alesia") {
  for (const [key, file] of Object.entries(downloadFiles)) {
    const link = page.getByTestId(`download-link-${key}`);
    await expect(link).toHaveText("Télécharger");
    const match = (await link.getAttribute("href"))?.match(directDownload);
    expect(match, `${key} : adresse directe d’un fichier de la dernière version`).toBeTruthy();
    const [, version, name] = match as RegExpMatchArray;
    expect(name, `${key} : fichier de ce système`).toMatch(file);
    await expect(link).toHaveAttribute("download", name);
    await expect(page.getByTestId(`download-${key}`)).toContainText(name);
    await expect(page.getByTestId(`download-${key}`)).toContainText(`Version ${version}`);
  }
  await expect(page.getByTestId("download-all-versions")).toHaveAttribute("href", releases);
  if (place === "accueil")
    await expect(page.getByTestId("download-documentation")).toHaveAttribute(
      "href",
      /\/documentation\/index\.html#\/docs$/,
    );
  else await expect(page.getByTestId("documentation-link")).toHaveAttribute("href", documentation);
  await expect(page.getByTestId("releases-link")).toHaveCount(0);
}

/** Retire les espaces insécables ajoutés par la typographie française pour comparer au texte du guide. */
function plain(text: string): string {
  return text
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const axisOf: Record<(typeof order)[number], "ouverture" | "preparer" | "sieger"> = {
  ouverture: "ouverture",
  veille: "preparer",
  carte: "preparer",
  grenier: "preparer",
  ouvrages: "preparer",
  defense: "preparer",
  convocation: "sieger",
  appel: "sieger",
  rationnement: "sieger",
  motion: "sieger",
  actes: "sieger",
};
const technicalCodes = /\b[PS][1-5]\b/;

async function choose(page: Page, id: (typeof order)[number]) {
  const axis = axisOf[id];
  if (axis !== "ouverture") {
    const toggle = page.getByTestId(`menu-group-${axis}`);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  }
  await page.getByTestId(`menu-item-${id}`).click();
}

interface Zone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Partie visible de la scène que ni l'en-tête, ni le panneau, ni le menu ne couvrent, en coordonnées de la page. */
async function freeZone(page: Page): Promise<Zone> {
  return page.evaluate(() => {
    const rect = (testId: string) =>
      (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement).getBoundingClientRect();
    const stage = rect("terrain-stage");
    let zone = {
      left: Math.max(0, stage.left),
      top: Math.max(stage.top, rect("site-header").bottom),
      right: Math.min(stage.right, window.innerWidth),
      bottom: Math.min(stage.bottom, window.innerHeight),
    };
    for (const cover of [rect("scenario-panel"), rect("menu-bar")]) {
      if (cover.left >= zone.right || cover.right <= zone.left || cover.top >= zone.bottom || cover.bottom <= zone.top)
        continue;
      const options = [
        { ...zone, right: Math.min(zone.right, cover.left) },
        { ...zone, left: Math.max(zone.left, cover.right) },
        { ...zone, bottom: Math.min(zone.bottom, cover.top) },
        { ...zone, top: Math.max(zone.top, cover.bottom) },
      ];
      const area = (z: typeof zone) => Math.max(0, z.right - z.left) * Math.max(0, z.bottom - z.top);
      zone = options.reduce((best, z) => (area(z) > area(best) ? z : best));
    }
    return zone;
  });
}

async function projectedTarget(page: Page): Promise<{ x: number; y: number }> {
  const stage = page.getByTestId("terrain-stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Scène absente");
  return {
    x: box.x + Number(await stage.getAttribute("data-target-x")),
    y: box.y + Number(await stage.getAttribute("data-target-y")),
  };
}

/* Depuis la carte de bataille de l'arrivée, le visiteur entre dans le relief par « Découvrir » puis ferme l'ouverture. */
async function enterRelief(page: Page) {
  await page.getByTestId("intro-discover").click();
  await expect(page.getByTestId("scenario-ouverture")).toBeVisible();
  await page.getByTestId("scenario-close").click();
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
  await sceneReady(page);
}

async function sceneReady(page: Page) {
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-motion", "done");
}

test.describe("relief en 3D", () => {
  test("l’ouverture puis les dix scénarios s’ouvrent avec leurs captures de Hall", async ({ page }) => {
    await page.goto("./demonstration/");
    await expect(page.locator("html")).toHaveAttribute("data-view", "terrain");
    await sceneReady(page);
    /* Les noms du récit restent fictifs ; les villages et hameaux réels forment une couche à part (.is-locality). */
    const toponyms = await page.locator(".terrain-toponym:not(.is-locality)").allTextContents();
    expect(toponyms).toContain("Bois derrière Alésia");
    expect(toponyms.join(" ")).not.toMatch(/cornu/i);
    const canvas = page.getByTestId("terrain-canvas");
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0)).toBe(true);
    await expectLinks(page);
    await expectNoHorizontalScroll(page);

    for (const id of order) {
      await choose(page, id);
      await expect(page.getByTestId("scenario-panel")).toBeVisible();
      await expect(page.getByTestId(`scenario-${id}`)).toBeVisible();
      await expect(page.getByTestId(`menu-item-${id}`)).toHaveAttribute("aria-current", "step");
      if (id !== "ouverture") await expectCapturesLoaded(page, `[data-testid="scenario-${id}"]`);
      await expectNoHorizontalScroll(page);
      await page.getByTestId("scenario-close").click();
      await expect(page.getByTestId("scenario-panel")).toBeHidden();
    }
  });

  test("les axes se suivent dans l’ordre, la carte avant les tableurs", async ({ page }) => {
    await page.goto("./demonstration/#ouverture");
    await expect(page.getByTestId("scenario-ouverture")).toBeVisible();
    await expect(page.getByTestId("step-previous")).toBeDisabled();
    const axes: string[] = [];
    for (const id of order.slice(1)) {
      await page.getByTestId("step-next").click();
      const scenario = page.getByTestId(`scenario-${id}`);
      await expect(scenario).toBeVisible();
      axes.push((await scenario.getAttribute("data-axis")) ?? "");
      expect(new URL(page.url()).hash).toBe(`#${id}`);
    }
    await expect(page.getByTestId("step-next")).toBeDisabled();
    expect(axes).toEqual([...Array(5).fill("preparer"), ...Array(5).fill("sieger")]);
    expect(order.indexOf("carte")).toBeLessThan(order.indexOf("ouvrages"));
    expect(order.indexOf("carte")).toBeLessThan(order.indexOf("defense"));
    await page.getByTestId("step-previous").click();
    await expect(page.getByTestId("scenario-motion")).toBeVisible();
  });

  test("l’ouverture mène à Préparer ou à Siéger", async ({ page }) => {
    await page.goto("./demonstration/#ouverture");
    await page.getByTestId("entry-sieger").click();
    await expect(page.getByTestId("scenario-convocation")).toBeVisible();
    await page.goto("./demonstration/#ouverture");
    await page.getByTestId("entry-preparer").click();
    await expect(page.getByTestId("scenario-veille")).toBeVisible();
  });

  test("la lecture du parcours passe à l’étape suivante et s’arrête à la demande", async ({ page }) => {
    await page.clock.install();
    await page.goto("./demonstration/#ouverture");
    await expect(page.getByTestId("scenario-ouverture")).toBeVisible();
    await page.getByTestId("autoplay").click();
    await expect(page.getByTestId("autoplay")).toHaveAttribute("aria-pressed", "true");
    await page.clock.runFor(14_500);
    await expect(page.getByTestId("scenario-veille")).toBeVisible();
    await page.getByTestId("autoplay").click();
    await expect(page.getByTestId("autoplay")).toHaveAttribute("aria-pressed", "false");
    await page.clock.runFor(20_000);
    await expect(page.getByTestId("scenario-veille")).toBeVisible();
  });

  test("chaque scénario allume ses repères sur le relief", async ({ page }) => {
    await page.goto("./demonstration/#carte");
    await sceneReady(page);
    await expect
      .poll(async () =>
        JSON.parse((await page.getByTestId("terrain-stage").getAttribute("data-journeys")) ?? "[]").map(
          (journey: { kind: string }) => journey.kind,
        ),
      )
      .toEqual(["grain", "messenger"]);
    expect((await page.getByTestId("terrain-mark").allTextContents()).join(" ")).not.toContain("425");
    await page.goto("./demonstration/#ouvrages");
    await sceneReady(page);
    /* Depuis d3d04f50, les textes des repères d'un scénario restent posés mais masqués sur le relief. */
    await expect(
      page.getByTestId("terrain-mark").filter({ hasText: "Ouvrages romains vus par les veilleurs" }),
    ).toHaveCount(1);
    await page.goto("./demonstration/#motion");
    await sceneReady(page);
    await expect(page.getByTestId("terrain-mark").filter({ hasText: "Vers les cités alliées" }).first()).toBeAttached();
  });

  test("le menu de découverte nomme les scénarios de chaque groupe, sans code", async ({ page }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    await expect(page.getByTestId("menu-item-ouverture")).toContainText("Alésia");
    await expect(page.getByTestId("menu-group-preparer")).toContainText("Préparer");
    await expect(page.getByTestId("menu-group-sieger")).toContainText("Siéger");
    await expect(page.getByTestId("menu-list-preparer")).toBeHidden();
    await page.getByTestId("menu-group-preparer").click();
    await expect(page.getByTestId("menu-group-preparer")).toHaveAttribute("aria-expanded", "true");
    const list = page.getByTestId("menu-list-preparer");
    await expect(list).toBeVisible();
    const names = ["La veille", "Les passages", "Le grenier", "Les ouvrages", "La défense"];
    for (const [index, name] of names.entries()) {
      const item = page.getByTestId(`menu-item-${order[index + 1]}`);
      await expect(item).toBeVisible();
      await expect(item).toContainText(`${index + 1}`);
      await expect(item).toContainText(name);
    }
    await expectNoHorizontalScroll(page);
    await page.getByTestId("menu-group-sieger").click();
    await expect(list).toBeHidden();
    await expect(page.getByTestId("menu-list-sieger")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("menu-list-sieger")).toBeHidden();
    await choose(page, "carte");
    await expect(page.getByTestId("menu-list-preparer")).toBeHidden();
    await expect(page.getByTestId("menu-group-preparer")).toHaveClass(/is-current/);
    await expect(page.locator(".discovery-group-state")).toHaveCount(0);
    await expect(page.getByTestId("scenario-carte")).toContainText("Préparer, étape 2 sur 5");
    await expect(page.getByTestId("step-next")).toHaveText("Le grenier");
    await expect(page.getByTestId("step-next").locator("svg")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(technicalCodes);
    await page.getByTestId("menu-group-preparer").click();
    expect(await page.locator("body").innerText()).not.toMatch(technicalCodes);
  });

  test("chaque capture s’ouvre en plein écran avec ses pastilles et leur légende", async ({ page }) => {
    await page.goto("./demonstration/#actes");
    await expect(page.getByTestId("scenario-actes")).toBeVisible();
    const opener = page.getByTestId("capture-open-sieger-calendrier");
    await opener.click();
    const viewer = page.getByTestId("viewer");
    await expect(viewer).toBeVisible();
    /* Depuis 117089ba, le calendrier est la dernière des cinq captures des actes. */
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 5 sur 5");
    await expect(page.getByTestId("viewer-title")).toContainText("Calendrier");
    await expect
      .poll(() =>
        page.getByTestId("viewer-image").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
      )
      .toBeGreaterThan(0);
    const shot = await page.getByTestId("viewer-shot").boundingBox();
    const viewport = page.viewportSize();
    if (!shot || !viewport) throw new Error("Capture absente");
    expect(shot.width).toBeGreaterThan(viewport.width * 0.8 - 400);
    const pins = page.getByTestId("viewer-pin");
    await expect(pins).toHaveCount(4);
    await expect(page.getByTestId("viewer-legend-item")).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const pin = await pins.nth(i).boundingBox();
      if (!pin) throw new Error("Pastille absente");
      await expect(pins.nth(i)).toHaveText(String(i + 1));
      expect(pin.x + pin.width).toBeGreaterThan(shot.x);
      expect(pin.x).toBeLessThan(shot.x + shot.width);
      expect(pin.y + pin.height / 2).toBeGreaterThanOrEqual(shot.y);
      expect(pin.y + pin.height / 2).toBeLessThanOrEqual(shot.y + shot.height);
    }
    await expect(page.getByTestId("viewer-legend-item").nth(1)).toContainText("Pourparlers avec Jules César");
    await pins.nth(1).focus();
    await expect(page.getByTestId("viewer-legend-item").nth(1)).toHaveClass(/is-lit/);
    if (phoneViewer(page)) await expect(page.getByTestId("viewer-chevron-next")).toBeHidden();
    else await expect(page.getByTestId("viewer-next")).toBeDisabled();
    await stepViewer(page, "previous");
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 4 sur 5");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 3 sur 5");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 4 sur 5");
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(page.getByTestId("scenario-actes")).toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();
    await page.getByTestId("viewer-close").click();
    await expect(viewer).toBeHidden();
    await opener.click();
    await expect(viewer).toBeVisible();
    await page.mouse.click(4, Math.round((viewport.height * 2) / 3));
    await expect(viewer).toBeHidden();
    await expect(page.getByTestId("scenario-actes")).toBeVisible();
  });

  test("la capture en plein écran s’agrandit, se déplace et se ferme par le retour", async ({ page }) => {
    await page.goto("./demonstration/#actes");
    /* Depuis 117089ba, le procès-verbal est la troisième des cinq captures des actes. */
    const opener = page.getByTestId("capture-open-sieger-proces-verbal");
    await opener.click();
    const viewer = page.getByTestId("viewer");
    await expect(viewer).toHaveAttribute("data-zoom", "1.00");
    const phone = phoneViewer(page);
    if (phone) await expect(page.getByTestId("viewer-zoom-in")).toBeHidden();
    else await expect(page.getByTestId("viewer-zoom-fit")).toBeDisabled();
    if (phone) await page.keyboard.press("+");
    else await page.getByTestId("viewer-zoom-in").click();
    await expect.poll(async () => Number(await viewer.getAttribute("data-zoom"))).toBeGreaterThan(1.5);
    const stage = await page.getByTestId("viewer-stage").boundingBox();
    if (!stage) throw new Error("Scène absente");
    const before = await page.getByTestId("viewer-shot").boundingBox();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2 + 60, stage.y + stage.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    const after = await page.getByTestId("viewer-shot").boundingBox();
    expect(after?.x).not.toBe(before?.x);
    await expect(viewer).toBeVisible();
    if (phone) await page.keyboard.press("0");
    else await page.getByTestId("viewer-zoom-fit").click();
    await expect(viewer).toHaveAttribute("data-zoom", "1.00");
    await page.mouse.dblclick(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await expect.poll(async () => Number(await viewer.getAttribute("data-zoom"))).toBeGreaterThan(1.5);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 4 sur 5");
    await expect(viewer).toHaveAttribute("data-zoom", "1.00");
    await page.goBack();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/demonstration\/#actes$/);
    await expect(page.getByTestId("scenario-actes")).toBeVisible();
  });

  test("une capture des Fonctionnalités s’ouvre en plein écran et mène aux suivantes", async ({ page }) => {
    await page.goto("./");
    const opener = page.getByTestId("feature-capture-cartes");
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    await expect(page.getByTestId("viewer")).toBeVisible();
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 3 sur 6");
    await expect(page.getByTestId("viewer-title")).toHaveText("Cartes");
    await expect(page.getByTestId("viewer-legend")).toBeHidden();
    await stepViewer(page, "next");
    await expect(page.getByTestId("viewer-title")).toHaveText("Préparation de séance");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer")).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("sur téléphone, le pincement agrandit la capture seule et les flèches s’effacent", async ({ page }) => {
    test.skip(!phoneViewer(page), "visionneuse de téléphone");
    await page.goto("./demonstration/#actes");
    await page.getByTestId("capture-open-sieger-calendrier").click();
    const viewer = page.getByTestId("viewer");
    await expect(page.getByTestId("viewer-previous")).toBeHidden();
    const chevron = page.getByTestId("viewer-chevron-next");
    await expect(chevron).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("viewer-hint")).toHaveCSS("opacity", "1");
    await expect(chevron).toHaveCSS("opacity", "0", { timeout: 4000 });
    await page.getByTestId("viewer-shot").click({ position: { x: 8, y: 8 } });
    await expect(chevron).toHaveCSS("opacity", "1");
    const cdp = await page.context().newCDPSession(page);
    const pinch = async (x: number, y: number) => {
      const at = (r: number) => [
        { x: x - r, y, id: 0 },
        { x: x + r, y, id: 1 },
      ];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(30) });
      for (const r of [50, 70, 90, 110]) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(r) });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const bar = await page.getByTestId("viewer-count").boundingBox();
    if (!bar) throw new Error("Barre absente");
    await pinch(bar.x + 150, bar.y + bar.height / 2);
    await expect(viewer).toHaveAttribute("data-zoom", "1.00");
    const shot = await page.getByTestId("viewer-shot").boundingBox();
    if (!shot) throw new Error("Capture absente");
    await pinch(shot.x + shot.width / 2, shot.y + shot.height / 2);
    await expect.poll(async () => Number(await viewer.getAttribute("data-zoom"))).toBeGreaterThan(2);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });

  test("chaque capture du récit a des pastilles légendées", async ({ page }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    for (const id of withCaptures) {
      await choose(page, id);
      const openers = page.locator(`[data-testid="scenario-${id}"] [data-testid^="capture-open-"]`);
      const count = await openers.count();
      expect(count, id).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await openers.nth(i).click();
        const pins = await page.getByTestId("viewer-pin").count();
        expect(pins, id).toBeGreaterThanOrEqual(2);
        await expect(page.getByTestId("viewer-legend-item")).toHaveCount(pins);
        await page.getByTestId("viewer-close").click();
      }
      await page.getByTestId("scenario-close").click();
    }
  });

  test("le relief vient des données embarquées, sans requête vers un autre hôte", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1:4791/").origin;
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) foreign.push(url);
    });
    await page.goto("./demonstration/");
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
    await page.waitForLoadState("networkidle");
    expect(foreign).toEqual([]);
    /* Octets transférés pour les trois fichiers du relief, tels qu'ils sont embarqués */
    const terrainBytes = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => /\/terrain\/(terrain\.json|terrain\.bin|landcover\.bin)\.gz(\?|$)/.test(entry.name))
        .reduce((total, entry) => total + (entry as PerformanceResourceTiming).encodedBodySize, 0),
    );
    expect(terrainBytes).toBeGreaterThan(500_000);
    expect(terrainBytes).toBeLessThan(2 * 1024 * 1024);
    await expect(page.getByTestId("terrain-credit")).toContainText("IGN");
  });
});

test("le fragment d’adresse ouvre le scénario pendant la visite et la fermeture le retire", async ({ page }) => {
  await page.goto("./demonstration/#appel");
  await expect(page.getByTestId("scenario-appel")).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "grenier";
  });
  await expect(page.getByTestId("scenario-grenier")).toBeVisible();
  await expect(page.getByTestId("menu-item-grenier")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("scenario-close").click();
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(() => window.location.href.includes("#"))).toBe(false);
  await choose(page, "actes");
  expect(new URL(page.url()).hash).toBe("#actes");
});

test("le récit d’Alésia suit l’itinéraire jurassien et réserve Hall aux captures", async ({ page }) => {
  await page.goto("./demonstration/?view=plain");
  const page_text = await page.locator("body").innerText();
  const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
  expect(description).not.toMatch(outsideTheGame);
  const opening = page.getByTestId("scenario-ouverture");
  await expect(opening).toContainText("Genève");
  await expect(opening).toContainText("Cornu");
  await expect(opening.locator(".scenario-lead, .steps")).not.toContainText(["Berthier"]);
  await expect(opening.locator(".scenario-feature")).toHaveCount(0);
  await expect(opening.locator(".scenario-sources a")).toHaveCount(4);
  expect(description).not.toMatch(/cornu/i);
  for (const name of ["Alésia", "Mandubiens", "Vercingétorix"]) {
    expect(page_text).toContain(name);
  }
  expect(description).toContain("Jura");
  for (const id of order) {
    expect(await page.getByTestId(`scenario-${id}`).innerText(), id).not.toMatch(presentDayObjects);
  }
  await expect(page.locator(".site-footer")).toContainText("fictives");
  await expect(page.locator(".site-footer")).toContainText("licence ouverte Etalab 2.0");
});

test("le quorum reste expliqué dans la capture, sans entrer dans le récit", async ({ page }) => {
  await page.goto("./demonstration/?view=plain");
  const steps = page.locator('[data-testid="scenario-appel"] .steps li');
  expect((await steps.allTextContents()).join(" ")).not.toMatch(/quorum|12 présents|8 requis/);
  /* La vue sans 3D range les captures à côté du texte du scénario, dans sa section (69a3e106). */
  await expect(page.locator("#lieu-appel figcaption")).toContainText("quorum");
  await expect(page.locator(".steps li.tone-blocking")).toHaveCount(0);
});

test("l’arrivée dit qu’on visite la démonstration de Hall et comment choisir un scénario", async ({ page }) => {
  await page.goto("./demonstration/?view=plain");
  await expect(page).toHaveTitle("Alésia, jeu de démonstration de Hall");
  await expect(page.getByTestId("site-header")).toContainText("Hall");
  const intro = page.getByTestId("intro");
  await expect(intro.locator("h1")).toHaveText("Le siège d’Alésia");
  await expect(page.getByTestId("intro-discover")).toHaveAttribute("href", "#lieu-ouverture");
  await expect(page.getByTestId("site-signature")).toHaveCount(0);
  await expect(page.getByTestId("site-credit")).toContainText(/Démonstration\s*: données fictives/);
  await page.goto("./demonstration/");
  await expect(page.getByTestId("intro-discover")).toBeVisible();
  await expect(page.getByTestId("intro-discover")).toHaveAttribute("href", "#ouverture");
  await expect(intro).not.toContainText("Choisissez un scénario");
});

test.describe("mise en page de l’arrivée", () => {
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`à ${width}×${height}, la scène occupe l’écran d’arrivée sous un encart sans fond, Télécharger vient après`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("./demonstration/");
      await sceneReady(page);
      const header = await page.getByTestId("site-header").boundingBox();
      const stage = await page.getByTestId("terrain-stage").boundingBox();
      const intro = await page.getByTestId("intro").boundingBox();
      const download = await page.getByTestId("section-telecharger").boundingBox();
      if (!header || !stage || !intro || !download) throw new Error("En-tête, scène, encart ou section absent");
      expect(Math.abs(stage.y - (header.y + header.height))).toBeLessThanOrEqual(1);
      expect(stage.y + stage.height).toBeGreaterThanOrEqual(height - 1);
      expect(download.y).toBeGreaterThanOrEqual(height - 1);
      expect(intro.y).toBeGreaterThanOrEqual(stage.y);
      expect(intro.y + intro.height).toBeLessThanOrEqual(stage.y + stage.height / 3);
      const background = await page.getByTestId("intro").evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(background).toBe("rgba(0, 0, 0, 0)");
    });
  }
});

test.describe("version sans 3D", () => {
  test("3D par défaut avec moins de mouvement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const original = prototype.getParameter;
        prototype.getParameter = function (parameter: number) {
          const value = original.call(this, parameter);
          return typeof value === "string" && /swiftshader|llvmpipe|software/i.test(value)
            ? "Hardware renderer for reduced-motion verification"
            : value;
        };
      }
    });
    await page.goto("./demonstration/");
    await sceneReady(page);
    await expect(page.locator("html")).toHaveAttribute("data-view", "terrain");
    await expect(page.getByTestId("terrain-canvas")).toBeVisible();
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-motion", "done");
    await choose(page, "grenier");
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-motion", "done");
    await page.getByTestId("scenario-close").click();
    await page.getByTestId("view-switch").click();
    await expect(page.locator("html")).toHaveAttribute("data-view", "plain");
    await expect(page.getByTestId("terrain-canvas")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("appareil sans WebGL", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("./demonstration/");
    await expect(page.locator("html")).toHaveAttribute("data-view", "plain");
    await expect(page.getByTestId("terrain-canvas")).toHaveCount(0);
    await expect(page.getByTestId("plain-notice")).toBeVisible();
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await expectLinks(page);
    for (const id of withCaptures) {
      await page.getByTestId(`plain-link-${id}`).click();
      await expect(page.getByTestId(`scenario-${id}`)).toBeInViewport();
      await expectCapturesLoaded(page, `#lieu-${id}`);
    }
    await expectNoHorizontalScroll(page);
  });
});

test.describe("niveau de détail du relief", () => {
  test("le relief s’affine en s’approchant et s’allège en s’éloignant", async ({ page }) => {
    const levels = async () =>
      ((await page.getByTestId("terrain-stage").getAttribute("data-lod")) ?? "").split(",").map(Number);
    await page.goto("./demonstration/");
    await sceneReady(page);
    await enterRelief(page);
    const far = await levels();
    expect(far).toHaveLength(3);
    expect(far.reduce((a, b) => a + b)).toBeGreaterThan(100);
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-contour", "40");
    await page.goto("./demonstration/#carte");
    await expect(page.getByTestId("scenario-carte")).toBeVisible();
    await sceneReady(page);
    await expect.poll(async () => (await levels())[2]).toBeLessThan(far[2]);
    const near = await levels();
    expect(near[0] + near[1]).toBeGreaterThan(far[0] + far[1]);
    // Closing the scenario leaves the camera in place on a free map: the person then zooms with the wheel.
    await page.getByTestId("scenario-close").click();
    await expect(page.getByTestId("scenario-panel")).toBeHidden();
    const stage = page.getByTestId("terrain-stage");
    const contour = async () => Number(await stage.getAttribute("data-contour"));
    const distance = async () => Number(await stage.getAttribute("data-distance"));
    const wheelAt = async (deltaY: number) => {
      const point = await page.getByTestId("terrain-canvas").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        for (const y of [0.5, 0.65, 0.35])
          for (const x of [0.5, 0.4, 0.6]) {
            const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
            if (document.elementFromPoint(point.x, point.y) === node) return point;
          }
        throw new Error("Aucune zone libre de la carte pour la molette");
      });
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, deltaY);
    };
    // Closer than the end of « carte »: the contour lines tighten to 20 m at most.
    await expect
      .poll(
        async () => {
          if ((await contour()) > 20) await wheelAt(-200);
          return contour();
        },
        { timeout: 20_000 },
      )
      .toBeLessThanOrEqual(20);
    const closest = await levels();
    // Away from the ground, the relief lightens again and the contour lines widen.
    const closeDistance = await distance();
    await expect
      .poll(
        async () => {
          if ((await levels())[2] <= closest[2]) await wheelAt(400);
          return (await levels())[2];
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(closest[2]);
    expect(await distance()).toBeGreaterThan(closeDistance);
    await expect.poll(contour).toBeGreaterThan(20);
  });
});

test.describe("sections de la page", () => {
  test("l’en-tête porte les entrées de la présentation, Alésia soulignée, puis Télécharger", async ({ page }) => {
    await page.goto("./demonstration/");
    await expect(page.getByTestId("section-nav").locator("a")).toHaveText([
      "Parcours",
      "Fonctionnalités",
      "Alésia",
      "Télécharger",
    ]);
    await expect(page.getByTestId("section-installer")).toHaveCount(0);
    await expect(page.getByTestId("brand-home")).toHaveAttribute("href", "../");
    await expect(page.getByTestId("nav-parcours")).toHaveAttribute("href", "../");
    await expect(page.getByTestId("nav-fonctionnalites")).toHaveAttribute("href", "../#en-savoir-plus");
    await expect(page.getByTestId("nav-contact")).toHaveCount(0);
    await expect(page.getByTestId("nav-demonstration")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-telecharger")).toHaveAttribute("href", "#telecharger");
    await expect(page.getByTestId("section-nav").locator("a", { hasText: "Alésia" })).toHaveCount(1);
    const tops: number[] = [];
    for (const id of ["decouvrir", "telecharger", "documentation"]) {
      const box = await page.getByTestId(`section-${id}`).boundingBox();
      if (!box) throw new Error(`Section ${id} absente`);
      tops.push(box.y);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Fenêtre absente");
    await page.getByTestId("nav-telecharger").click();
    await expect(page.getByTestId("section-telecharger")).toBeInViewport();
    await expect(page.getByTestId("nav-telecharger")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("nav-demonstration")).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);
    const nav = await page.getByTestId("nav-telecharger").boundingBox();
    if (!nav) throw new Error("En-tête absent");
    expect(nav.x + nav.width).toBeLessThanOrEqual(viewport.width);
  });

  test("l’accueil propose un bouton « Télécharger » par fichier de la dernière version, puis la marche à suivre", async ({
    page,
  }) => {
    await page.goto("./#telecharger");
    await expectLinks(page, "accueil");
    const section = page.getByTestId("section-telecharger");
    await expect(section.locator("h2")).toHaveText("Télécharger Hall");
    expect(plain(await section.locator(".section-head").innerText())).toContain(
      "Deux jeux de démonstration : Foncine-le-Bas et Alésia.",
    );
    for (const guide of installationGuides) {
      const keys = Object.keys(downloadFiles).filter((key) => key.split("-")[0] === guide.system);
      for (const key of keys) {
        await expect(page.getByTestId(`download-how-${key}`)).toHaveText("Marche à suivre");
        await expect(page.getByTestId(`download-how-${key}`)).toHaveAttribute("href", "#marche-a-suivre");
      }
    }
    await expect(page.getByTestId("download-how-server")).toHaveText("Installer le serveur");
    await expect(page.getByTestId("download-how-server")).toHaveAttribute(
      "href",
      "https://github.com/ng-galien/hall/blob/main/docs/distribution.md",
    );
    await scrollSettled(page);
    const list = await section.locator(".download-list").boundingBox();
    const part = await section.getByTestId("install-part").boundingBox();
    if (!list || !part) throw new Error("Téléchargements ou marche à suivre absents");
    expect(part.y).toBeGreaterThan(list.y + list.height);
    await page.getByTestId("download-how-linux-rpm").click();
    await expect(page.getByTestId("install-tab-linux")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("install-panel-linux")).toBeInViewport();

    await expectNoHorizontalScroll(page);
  });

  test("la section Télécharger d’Alésia propose les mêmes fichiers et renvoie à la marche à suivre de l’accueil", async ({
    page,
  }) => {
    await page.goto("./demonstration/#telecharger");
    await expectLinks(page);
    for (const key of ["windows", "macos-arm64", "macos-x64", "linux-deb", "linux-rpm"])
      await expect(page.getByTestId(`download-how-${key}`)).toHaveAttribute("href", "../#marche-a-suivre");
    await expect(page.getByTestId("install-part")).toHaveCount(0);
    await expect(page.locator(".site-footer")).not.toContainText("Télécharger");
    await expectNoHorizontalScroll(page);
  });

  test("la marche à suivre montre chaque étape et chaque remarque du guide, par système", async ({ page }) => {
    await page.goto("./#marche-a-suivre");
    const intro = plain(await page.getByTestId("install-introduction").innerText());
    for (const line of installationIntroduction) expect(intro).toContain(plain(line));
    for (const guide of installationGuides) {
      await page.getByTestId(`install-tab-${guide.system}`).click();
      const panel = page.getByTestId(`install-panel-${guide.system}`);
      await expect(panel).toBeVisible();
      for (const other of installationGuides.filter((g) => g.system !== guide.system)) {
        await expect(page.getByTestId(`install-panel-${other.system}`)).toBeHidden();
      }
      const steps = panel.getByTestId("install-step");
      const expected = guide.paths.flatMap((path) => path.steps);
      await expect(steps).toHaveCount(expected.length);
      for (const [index, step] of expected.entries()) {
        const text = plain(await steps.nth(index).innerText());
        expect(text).toContain("À l’écran");
        expect(text).toContain("À faire");
        expect(text).toContain(plain(step.sees));
        expect(text.replace(/ ?Copier ?/g, " ").replace(/\s+/g, " ")).toContain(plain(step.does));
      }
      for (const path of guide.paths) await expect(panel).toContainText(path.title);
      await expect(panel.getByTestId("install-note")).toHaveCount(guide.notes.length);
      await expectNoHorizontalScroll(page);
    }
    await page.getByTestId("install-tab-linux").click();
    await expect(page.getByTestId("install-panel-linux").getByTestId("command-text")).toHaveText([
      'sudo apt install "$(xdg-user-dir DOWNLOAD)"/linux-x64-*.deb',
      'sudo dnf install "$(xdg-user-dir DOWNLOAD)"/linux-x64-*.rpm',
    ]);
    await page.getByTestId("install-tab-macos").click();
    await expect(page.getByTestId("install-panel-macos").getByTestId("command-text")).toHaveText(
      "xattr -dr com.apple.quarantine /Applications/Hall.app",
    );
    await page.getByTestId("install-tab-macos").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("install-tab-linux")).toHaveAttribute("aria-selected", "true");
  });

  test("la version sans 3D garde les mêmes sections", async ({ page }) => {
    await page.goto("./demonstration/?view=plain");
    for (const id of ["decouvrir", "telecharger", "documentation"]) {
      await expect(page.getByTestId(`section-${id}`)).toBeAttached();
    }
    await page.getByTestId("nav-telecharger").click();
    await expect(page.getByTestId("section-telecharger")).toBeInViewport();
    await expectLinks(page);
  });
});

/** Distance entre le bas de l'en-tête fixe et le haut d'un élément. */
async function belowHeader(page: Page, selector: string): Promise<number> {
  return page.evaluate((target) => {
    const header = document.querySelector('[data-testid="site-header"]')?.getBoundingClientRect().bottom ?? 0;
    const element = document.querySelector(target)?.getBoundingClientRect().top ?? Number.NaN;
    return Math.round(element - header);
  }, selector);
}

async function expectCardUnderHeader(page: Page, selector: string) {
  await expect.poll(() => belowHeader(page, selector)).toBeGreaterThanOrEqual(0);
  await expect.poll(() => belowHeader(page, selector)).toBeLessThanOrEqual(32);
}

test.describe("la scène continue sous les sections", () => {
  test("les sections et le pied de page sont posés sur le relief de Découvrir", async ({ page }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    const discover = page.getByTestId("section-decouvrir");
    await expect(discover.getByTestId("section-telecharger")).toHaveCount(1);
    await expect(discover.getByTestId("section-documentation")).toHaveCount(1);
    await expect(discover.locator(".site-footer")).toHaveCount(1);
    await page.getByTestId("card-dot-2").click();
    await expect(page.getByTestId("terrain-stage")).toBeInViewport();
    await expect(page.locator("body")).toHaveClass(/is-beyond/);
    /* La ligne de crédit vient après la carte Documentation, en bas de page */
    const { gap, belowCredit } = await page.evaluate(() => {
      const card = document.querySelector("#documentation .section-inner")?.getBoundingClientRect().bottom ?? 0;
      const credit = document.querySelector('[data-testid="site-credit"]')?.getBoundingClientRect();
      return {
        gap: (credit?.top ?? 0) - card,
        belowCredit: document.documentElement.scrollHeight - window.scrollY - (credit?.bottom ?? 0),
      };
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(belowCredit).toBeLessThanOrEqual(64);
  });

  test("l’en-tête amène la carte Télécharger sous l’en-tête et Démonstration ramène au premier écran", async ({
    page,
  }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    await page.getByTestId("nav-telecharger").click();
    await expectCardUnderHeader(page, "#telecharger .section-inner");
    await page.getByTestId("card-dot-2").click();
    await expectCardUnderHeader(page, "#documentation .section-inner");
    await page.getByTestId("nav-demonstration").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByTestId("terrain-stage")).toBeInViewport();
  });

  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`à ${width}×${height}, le menu du récit est en haut dès l’arrivée et le reste pendant le défilement`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("./demonstration/");
      await sceneReady(page);
      const reachable = () =>
        page.getByTestId("menu-group-sieger").evaluate((button) => {
          const box = button.getBoundingClientRect();
          const header = document.querySelector('[data-testid="site-header"]')?.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return Boolean(header) && box.top >= 0 && box.bottom <= (header?.bottom ?? 0) && button.contains(hit);
        });
      expect(await reachable()).toBe(true);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await expect(page.locator("body")).toHaveClass(/is-beyond/);
      expect(await reachable()).toBe(true);
      await page.getByTestId("menu-group-preparer").click();
      await page.getByTestId("menu-item-carte").click();
      await expect(page.getByTestId("scenario-carte")).toBeInViewport();
      await expect(page.getByTestId("terrain-stage")).toBeInViewport();
    });
  }

  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`à ${width}×${height}, le menu du récit ramène à la scène depuis n’importe quel défilement, sans carte par-dessus`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("./demonstration/");
      await sceneReady(page);
      const moves = [
        () => page.getByTestId("nav-telecharger").click(),
        () => page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })),
      ];
      const choices: [string, () => Promise<void>][] = [
        ["ouverture", () => page.getByTestId("menu-item-ouverture").click()],
        [
          "carte",
          async () => {
            await page.getByTestId("menu-group-preparer").click();
            await page.getByTestId("menu-item-carte").click();
          },
        ],
      ];
      for (const move of moves) {
        for (const [id, choose] of choices) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await move();
          await choose();
          await expect(page.getByTestId(`scenario-${id}`)).toBeInViewport();
          await expect(page.getByTestId("terrain-stage")).toBeInViewport();
          await expect(page.locator("body")).not.toHaveClass(/is-beyond/);
          await expect.poll(() => belowHeader(page, '[data-testid="terrain-stage"]')).toBeLessThanOrEqual(1);
          const covering = await page.evaluate(() =>
            [...document.querySelectorAll(".section-inner")].some((card) => {
              const box = card.getBoundingClientRect();
              const header = document.querySelector('[data-testid="site-header"]')?.getBoundingClientRect().bottom ?? 0;
              const hit = document.elementFromPoint(Math.max(box.left, 0) + 20, Math.max(box.top, header) + 20);
              return box.bottom > header + 5 && box.top < window.innerHeight - 5 && card.contains(hit);
            }),
          );
          expect(covering).toBe(false);
          await page.keyboard.press("Escape");
        }
      }
    });
  }

  test("on passe de carte en carte par les flèches, les repères et le clavier", async ({ page }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    const rail = page.getByTestId("card-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("button")).toHaveText(["Découvrir", "Télécharger", "Documentation"]);
    await expect(page.getByTestId("card-dot-0")).toHaveAttribute("aria-current", "true");

    await page.getByTestId("card-dot-1").click();
    await expectCardUnderHeader(page, "#telecharger .section-inner");
    await expect(page.getByTestId("card-dot-1")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("card-up-1")).toHaveAttribute("aria-label", "Carte précédente : Découvrir");
    await expect(page.getByTestId("card-down-1")).toHaveAttribute("aria-label", "Carte suivante : Documentation");

    await page.getByTestId("card-next-1").click();
    await expectCardUnderHeader(page, "#documentation .section-inner");
    await expect(page.getByTestId("card-dot-2")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#documentation h2")).toBeFocused();
    await expect(page.getByTestId("card-down-2")).toBeDisabled();

    await page.getByTestId("card-dot-2").focus();
    await page.keyboard.press("ArrowUp");
    await expectCardUnderHeader(page, "#telecharger .section-inner");
    await expect(page.getByTestId("card-dot-1")).toBeFocused();
    await expect(page.getByTestId("card-dot-1")).toHaveAttribute("aria-current", "true");

    await page.getByTestId("card-down-1").click();
    await expectCardUnderHeader(page, "#documentation .section-inner");
    await expect(page.getByTestId("card-dot-2")).toHaveAttribute("aria-current", "true");

    await page.getByTestId("card-dot-0").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByTestId("card-dot-0")).toHaveAttribute("aria-current", "true");
    await expect(rail).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("cadrage de la scène avec le panneau ouvert", () => {
  const sizes: Record<string, { width: number; height: number }[]> = {
    bureau: [
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ],
    telephone: [
      { width: 390, height: 844 },
      { width: 360, height: 740 },
    ],
  };

  test("la cible de chaque vol reste dans la partie libre de la scène", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const measured: string[] = [];
    const wanted = sizes[testInfo.project.name] ?? [];
    for (const size of wanted) {
      await page.setViewportSize(size);
      await page.goto("./demonstration/");
      await sceneReady(page);
      for (const id of order) {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, id);
        await expect(page.getByTestId(`scenario-${id}`)).toBeVisible();
        await sceneReady(page);
        const label = `${id} à ${size.width}×${size.height}`;
        await expect
          .poll(async () => {
            const zone = await freeZone(page);
            const target = await projectedTarget(page);
            return (
              zone.right - zone.left > 120 &&
              zone.bottom - zone.top > 120 &&
              target.x >= zone.left &&
              target.x <= zone.right &&
              target.y >= zone.top &&
              target.y <= zone.bottom
            );
          }, label)
          .toBe(true);
        measured.push(label);
        const zone = await freeZone(page);
        const marks = page.getByTestId("terrain-mark");
        for (let i = 0; i < (await marks.count()); i++) {
          const mark = marks.nth(i);
          if (!(await mark.isVisible())) continue;
          const box = await mark.boundingBox();
          if (!box) continue;
          const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          expect(centre.x, `${label}, repère ${await mark.innerText()}`).toBeGreaterThanOrEqual(zone.left);
          expect(centre.x, `${label}, repère ${await mark.innerText()}`).toBeLessThanOrEqual(zone.right);
          expect(centre.y, `${label}, repère ${await mark.innerText()}`).toBeGreaterThanOrEqual(zone.top);
          expect(centre.y, `${label}, repère ${await mark.innerText()}`).toBeLessThanOrEqual(zone.bottom);
        }
      }
    }
    expect(measured).toHaveLength(order.length * wanted.length);
    expect(wanted.length).toBeGreaterThan(0);
  });
});
