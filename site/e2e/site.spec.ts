import { expect, type Page, test } from "@playwright/test";
import { installationGuides, installationIntroduction } from "../src/installation";

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
const places = ["tour", "cornu", "plaine", "rempart", "maison", "belvedere", "place"] as const;
const releases = "https://github.com/ng-galien/hall/releases";
const documentation = "../documentation/index.html#/docs";
const outsideTheGame = /Berthier|Alise|Foncine|thèse|clin d[’']œil/i;
const presentDayObjects = /mairie|salle polyvalente|école|église|route nationale|voie ferrée|Pont de la Chaux/i;

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

async function expectLinks(page: Page) {
  for (const system of ["windows", "macos", "linux"]) {
    await expect(page.getByTestId(`download-link-${system}`)).toHaveAttribute("href", releases);
  }
  await expect(page.getByTestId("documentation-link")).toHaveAttribute("href", documentation);
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

async function sceneReady(page: Page) {
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-motion", "done");
}

test.describe("relief en 3D", () => {
  test("l’ouverture puis les dix scénarios s’ouvrent avec leurs captures de Hall", async ({ page }) => {
    await page.goto("./demonstration/");
    await expect(page.locator("html")).toHaveAttribute("data-view", "terrain");
    await sceneReady(page);
    const toponyms = await page.locator(".terrain-toponym").allTextContents();
    expect(toponyms).toContain("Alésia");
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
    await expect(page.getByTestId("terrain-mark").filter({ hasText: "Chemin des convois, 425 m" })).toBeVisible();
    await page.goto("./demonstration/#ouvrages");
    await sceneReady(page);
    await expect(
      page.getByTestId("terrain-mark").filter({ hasText: "Ouvrages romains vus par les veilleurs" }),
    ).toBeVisible();
    await page.goto("./demonstration/#motion");
    await sceneReady(page);
    await expect(page.getByTestId("terrain-mark").filter({ hasText: "7 pour, 4 contre" })).toBeVisible();
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
    const names = ["La veille", "La carte", "Le grenier", "Les ouvrages", "La défense"];
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
    await expect(page.getByTestId("menu-group-state-preparer")).toHaveText("La carte, 2 sur 5");
    await expect(page.getByTestId("scenario-carte")).toContainText("Préparer, étape 2 sur 5");
    await expect(page.getByTestId("step-next")).toHaveText("Étape suivante\u202f: Le grenier");
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
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 3 sur 5");
    await expect(page.getByTestId("viewer-title")).toContainText("calendrier");
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
    await page.getByTestId("viewer-next").click();
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 4 sur 5");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("viewer-count")).toHaveText("Capture 5 sur 5");
    await expect(page.getByTestId("viewer-next")).toBeDisabled();
    await page.getByTestId("viewer-previous").click();
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

  test("un clic sur la maison commune dans la scène ouvre la convocation", async ({ page }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    const label = page.getByTestId("terrain-label-maison");
    await page
      .getByTestId("terrain-stage")
      .evaluate((stage) => stage.scrollIntoView({ block: "center", behavior: "instant" }));
    await scrollSettled(page);
    const x = Number(await label.getAttribute("data-hit-x"));
    const y = Number(await label.getAttribute("data-hit-y"));
    const box = await page.getByTestId("terrain-stage").boundingBox();
    if (!box) throw new Error("Scène absente");
    await page.mouse.click(box.x + x, box.y + y);
    await expect(page.getByTestId("scenario-convocation")).toBeVisible();
  });

  test("dans la vue d’ensemble les repères des lieux ne se recouvrent pas", async ({ page }) => {
    await page.goto("./demonstration/");
    await sceneReady(page);
    const boxes = [];
    for (const place of places) {
      const box = await page.getByTestId(`terrain-label-${place}`).boundingBox();
      if (!box) throw new Error(`Repère ${place} absent`);
      boxes.push({ place, ...box });
    }
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps, `${a.place} et ${b.place}`).toBe(false);
      }
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
        .filter((entry) => /\/terrain\/(terrain\.json|terrain\.bin|landcover\.bin)\.gz$/.test(entry.name))
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

test("le récit reste dans l’oppidum, sans objet contemporain ni sortie du jeu", async ({ page }) => {
  await page.goto("./demonstration/?view=plain");
  const page_text = await page.locator("body").innerText();
  const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
  expect(page_text).not.toMatch(outsideTheGame);
  expect(description).not.toMatch(outsideTheGame);
  expect(page_text).not.toMatch(/cornu/i);
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

test("le quorum atteint est une étape valide, sans rouge", async ({ page }) => {
  await page.goto("./demonstration/?view=plain");
  const steps = page.locator('[data-testid="scenario-appel"] .steps li');
  const quorum = steps.filter({ hasText: "12 présents pour 8 requis" });
  await expect(quorum).toHaveClass(/tone-valid/);
  await expect(page.locator(".steps li.tone-blocking")).toHaveCount(0);
});

test("l’arrivée dit qu’on visite la démonstration de Hall et comment choisir un scénario", async ({ page }) => {
  await page.goto("./demonstration/?view=plain");
  await expect(page).toHaveTitle("Hall, gestion de l’activité communale");
  await expect(page.getByTestId("site-header")).toContainText("Le conseil municipal en séance");
  const intro = page.getByTestId("intro");
  await expect(intro.locator("h1")).toHaveText("Démonstration de Hall sur la commune fictive d’Alésia");
  await expect(intro.getByText("Choisissez un scénario dans la liste ci-dessous.")).toBeVisible();
  await expect(page.getByTestId("site-signature")).toHaveCount(0);
  await expect(page.getByTestId("site-credit")).toContainText(/Démonstration\s*: données fictives/);
  await page.goto("./demonstration/");
  await expect(intro.getByText("Choisissez un scénario dans le menu Alésia, Préparer ou Siéger")).toBeVisible();
  await expect(intro.getByText("dans la liste ci-dessous")).toBeHidden();
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

  test("à 1280 px les repères des lieux ne passent pas sous le texte", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./demonstration/");
    await sceneReady(page);
    const intro = await page.getByTestId("intro").boundingBox();
    if (!intro) throw new Error("Texte absent");
    for (const place of places) {
      const label = await page.getByTestId(`terrain-label-${place}`).boundingBox();
      if (!label) throw new Error(`Repère ${place} absent`);
      const overlaps =
        label.x < intro.x + intro.width &&
        label.x + label.width > intro.x &&
        label.y < intro.y + intro.height &&
        label.y + label.height > intro.y;
      expect(overlaps, place).toBe(false);
    }
  });
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
    await expect
      .poll(async () => Number(await page.getByTestId("terrain-stage").getAttribute("data-contour")))
      .toBeLessThanOrEqual(20);
    await page.getByTestId("scenario-close").click();
    await expect.poll(async () => (await levels())[2]).toBeGreaterThan(near[2]);
  });
});

test.describe("sections de la page", () => {
  test("l’en-tête porte les entrées de la présentation, Démonstration soulignée, puis Télécharger", async ({
    page,
  }) => {
    await page.goto("./demonstration/");
    await expect(page.getByTestId("section-nav").locator("a")).toHaveText([
      "Fonctionnalités",
      "Démonstration",
      "Télécharger",
    ]);
    await expect(page.getByTestId("section-installer")).toHaveCount(0);
    await expect(page.getByTestId("brand-home")).toHaveAttribute("href", "../");
    await expect(page.getByTestId("nav-fonctionnalites")).toHaveAttribute("href", "../#en-savoir-plus");
    await expect(page.getByTestId("nav-contact")).toHaveCount(0);
    await expect(page.getByTestId("nav-demonstration")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-telecharger")).toHaveAttribute("href", "#telecharger");
    await expect(page.getByTestId("site-header")).toContainText("Démonstration");
    expect(
      await page.getByTestId("site-header").evaluate((header) => header.textContent?.match(/Démonstration/g)?.length),
    ).toBe(1);
    const tops: number[] = [];
    for (const id of ["decouvrir", "telecharger", "documentation"]) {
      const box = await page.getByTestId(`section-${id}`).boundingBox();
      if (!box) throw new Error(`Section ${id} absente`);
      tops.push(box.y);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    await page.getByTestId("nav-telecharger").click();
    await expect(page.getByTestId("section-telecharger")).toBeInViewport();
    await expect(page.getByTestId("nav-telecharger")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("nav-demonstration")).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);
    const nav = await page.getByTestId("nav-telecharger").boundingBox();
    const viewport = page.viewportSize();
    if (!nav || !viewport) throw new Error("En-tête absent");
    expect(nav.x + nav.width).toBeLessThanOrEqual(viewport.width);
  });

  test("la section Télécharger propose un bouton par système puis la marche à suivre", async ({ page }) => {
    await page.goto("./demonstration/#telecharger");
    await expectLinks(page);
    for (const guide of installationGuides) {
      const row = page.getByTestId(`download-${guide.system}`);
      await expect(row).toContainText(guide.title);
      expect(plain(await row.innerText())).toContain(plain(guide.versions));
      await expect(page.getByTestId(`download-link-${guide.system}`)).toHaveText(`Télécharger pour ${guide.title}`);
      await expect(page.getByTestId(`download-how-${guide.system}`)).toHaveText(`Marche à suivre pour ${guide.title}`);
    }
    const section = page.getByTestId("section-telecharger");
    await scrollSettled(page);
    const list = await section.locator(".download-list").boundingBox();
    const part = await section.getByTestId("install-part").boundingBox();
    if (!list || !part) throw new Error("Téléchargements ou marche à suivre absents");
    expect(part.y).toBeGreaterThan(list.y + list.height);
    await page.getByTestId("download-how-linux").click();
    await expect(page.getByTestId("install-tab-linux")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("install-panel-linux")).toBeInViewport();
    await expect(page.locator(".site-footer")).not.toContainText("Télécharger");
    await expectNoHorizontalScroll(page);
  });

  test("la marche à suivre montre chaque étape et chaque remarque du guide, par système", async ({ page }) => {
    await page.goto("./demonstration/#marche-a-suivre");
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
    await page.getByTestId("card-dot-3").click();
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
    await page.getByTestId("card-dot-3").click();
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
    await expect(rail.getByRole("button")).toHaveText(["Découvrir", "Télécharger", "Marche à suivre", "Documentation"]);
    await expect(page.getByTestId("card-dot-0")).toHaveAttribute("aria-current", "true");

    await page.getByTestId("card-dot-1").click();
    await expectCardUnderHeader(page, "#telecharger .section-inner");
    await expect(page.getByTestId("card-dot-1")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("card-up-1")).toHaveAttribute("aria-label", "Carte précédente : Découvrir");

    await page.getByTestId("card-down-1").click();
    await expectCardUnderHeader(page, ".section-card-install");
    await expect(page.getByTestId("card-dot-2")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("card-down-3")).toBeDisabled();

    await page.getByTestId("card-next-2").click();
    await expectCardUnderHeader(page, "#documentation .section-inner");
    await expect(page.getByTestId("card-dot-3")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#documentation h2")).toBeFocused();

    await page.getByTestId("card-dot-3").focus();
    await page.keyboard.press("ArrowUp");
    await expectCardUnderHeader(page, ".section-card-install");
    await expect(page.getByTestId("card-dot-2")).toBeFocused();
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
