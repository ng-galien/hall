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
const documentation = "./documentation/index.html#/docs";
const outsideTheGame = /Berthier|Alise|Foncine|thèse|clin d[’']œil/i;
const presentDayObjects = /mairie|salle polyvalente|école|église|route nationale|voie ferrée|Pont de la Chaux/i;

async function expectCapturesLoaded(page: Page, scope: string) {
  const images = page.locator(`${scope} img`);
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const image = images.nth(i);
    await image.scrollIntoViewIfNeeded();
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
  await expect(page.getByTestId("releases-link")).toHaveAttribute("href", releases);
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
    await page.goto("./");
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
    await page.goto("./#ouverture");
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
    await page.goto("./#ouverture");
    await page.getByTestId("entry-sieger").click();
    await expect(page.getByTestId("scenario-convocation")).toBeVisible();
    await page.goto("./#ouverture");
    await page.getByTestId("entry-preparer").click();
    await expect(page.getByTestId("scenario-veille")).toBeVisible();
  });

  test("la lecture du parcours passe à l’étape suivante et s’arrête à la demande", async ({ page }) => {
    await page.clock.install();
    await page.goto("./#ouverture");
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
    await page.goto("./#carte");
    await sceneReady(page);
    await expect(page.getByTestId("terrain-mark").filter({ hasText: "Chemin des convois, 425 m" })).toBeVisible();
    await page.goto("./#ouvrages");
    await sceneReady(page);
    await expect(
      page.getByTestId("terrain-mark").filter({ hasText: "Ouvrages romains vus par les veilleurs" }),
    ).toBeVisible();
    await page.goto("./#motion");
    await sceneReady(page);
    await expect(page.getByTestId("terrain-mark").filter({ hasText: "7 pour, 4 contre" })).toBeVisible();
  });

  test("le menu de découverte nomme les scénarios de chaque groupe, sans code", async ({ page }) => {
    await page.goto("./");
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
    await page.goto("./#actes");
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
    await page.goto("./");
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
    await page.goto("./");
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
    await page.goto("./");
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
    await page.goto("./");
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
    await page.waitForLoadState("networkidle");
    expect(foreign).toEqual([]);
    const terrainBytes = await page.evaluate(async () => {
      let total = 0;
      for (const name of ["terrain.json", "terrain.bin", "landcover.bin"]) {
        total += (await (await fetch(`terrain/${name}`)).arrayBuffer()).byteLength;
      }
      return total;
    });
    expect(terrainBytes).toBeGreaterThan(1_000_000);
    expect(terrainBytes).toBeLessThan(8 * 1024 * 1024);
    await expect(page.getByTestId("terrain-credit")).toContainText("IGN");
  });
});

test("le fragment d’adresse ouvre le scénario pendant la visite et la fermeture le retire", async ({ page }) => {
  await page.goto("./#appel");
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
  await page.goto("./?vue=sans-3d");
  const page_text = await page.locator("body").innerText();
  const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
  expect(page_text).not.toMatch(outsideTheGame);
  expect(description).not.toMatch(outsideTheGame);
  expect(page_text).not.toMatch(/cornu/i);
  expect(description).not.toMatch(/cornu/i);
  for (const name of ["Alésia", "Jura", "Chaux-des-Crotenay", "Mandubiens", "plaine de Syam", "Lemme"]) {
    expect(page_text).toContain(name);
  }
  for (const id of order) {
    expect(await page.getByTestId(`scenario-${id}`).innerText(), id).not.toMatch(presentDayObjects);
  }
  await expect(page.locator(".site-footer")).toContainText("fictives");
  await expect(page.locator(".site-footer")).toContainText("licence ouverte Etalab 2.0");
});

test("le quorum atteint est une étape valide, sans rouge", async ({ page }) => {
  await page.goto("./?vue=sans-3d");
  const steps = page.locator('[data-testid="scenario-appel"] .steps li');
  const quorum = steps.filter({ hasText: "12 présents pour 8 requis" });
  await expect(quorum).toHaveClass(/tone-valid/);
  await expect(page.locator(".steps li.tone-blocking")).toHaveCount(0);
});

test("l’accueil dit ce qu’est Hall avant la démonstration", async ({ page }) => {
  await page.goto("./?vue=sans-3d");
  await expect(page).toHaveTitle("Hall, gestion de l’activité communale");
  await expect(page.getByTestId("site-header")).toContainText("Gestion de l’activité communale");
  const intro = page.getByTestId("intro");
  await expect(intro.locator("h1")).toHaveText(/Hall\s*Gestion de l’activité communale/);
  await expect(intro).toContainText("un logiciel pour gérer l’activité d’une commune");
  await expect(intro).toContainText("procès-verbaux");
  await expect(intro).toContainText("secrétariat de mairie et aux élus");
  await expect(intro).not.toContainText("de la préparation à l’acte");
  await expect(page.getByTestId("site-signature")).toHaveText("Hall, le conseil municipal en séance");
});

test.describe("mise en page du texte d’accueil", () => {
  test("à 1024 px le texte est au-dessus de la scène", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("./");
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
    const intro = await page.getByTestId("intro").boundingBox();
    const stage = await page.getByTestId("terrain-stage").boundingBox();
    if (!intro || !stage) throw new Error("Texte ou scène absent");
    expect(intro.y + intro.height).toBeLessThanOrEqual(stage.y);
  });

  test("à 1280 px les repères des lieux ne passent pas sous le texte", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");
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
  test("préférence pour moins de mouvement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-view", "plain");
    await expect(page.getByTestId("terrain-canvas")).toHaveCount(0);
    await expect(page.getByTestId("view-switch")).toBeVisible();
    await expectLinks(page);
    for (const id of order) await expect(page.getByTestId(`scenario-${id}`)).toBeVisible();
    for (const id of withCaptures) await expectCapturesLoaded(page, `#lieu-${id}`);
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
    await page.goto("./");
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
    await page.goto("./");
    await sceneReady(page);
    const far = await levels();
    expect(far).toHaveLength(3);
    expect(far.reduce((a, b) => a + b)).toBeGreaterThan(100);
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-contour", "40");
    await page.goto("./#carte");
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
  test("l’en-tête mène aux sections dans l’ordre et marque la section visible", async ({ page }) => {
    await page.goto("./");
    const ids = ["decouvrir", "telecharger", "documentation"];
    await expect(page.getByTestId("section-nav").getByRole("link")).toHaveText([
      "Découvrir",
      "Télécharger",
      "Documentation",
    ]);
    await expect(page.getByTestId("section-installer")).toHaveCount(0);
    await expect(page.getByTestId("nav-accueil")).toHaveCount(0);
    await expect(page.getByTestId("brand-home")).toHaveAttribute("href", "#haut");
    const tops: number[] = [];
    for (const id of ids) {
      await expect(page.getByTestId(`nav-${id}`)).toHaveAttribute("href", `#${id}`);
      const box = await page.getByTestId(`section-${id}`).boundingBox();
      if (!box) throw new Error(`Section ${id} absente`);
      tops.push(box.y);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    for (const id of ids.slice(1)) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page.getByTestId(`section-${id}`)).toBeInViewport();
      await expect(page.getByTestId(`nav-${id}`)).toHaveAttribute("aria-current", "true");
    }
    await page.getByTestId("nav-telecharger").click();
    await expect(page.getByTestId("nav-telecharger")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("nav-documentation")).not.toHaveAttribute("aria-current", "true");
    await expectNoHorizontalScroll(page);
    const header = await page.getByTestId("site-header").boundingBox();
    const nav = await page.getByTestId("nav-documentation").boundingBox();
    const viewport = page.viewportSize();
    if (!header || !nav || !viewport) throw new Error("En-tête absent");
    expect(nav.x + nav.width).toBeLessThanOrEqual(viewport.width);
  });

  test("la section Télécharger propose un bouton par système puis la marche à suivre", async ({ page }) => {
    await page.goto("./#telecharger");
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
    await page.goto("./?vue=sans-3d");
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
    await page.goto("./");
    await sceneReady(page);
    const discover = page.getByTestId("section-decouvrir");
    await expect(discover.getByTestId("section-telecharger")).toHaveCount(1);
    await expect(discover.getByTestId("section-documentation")).toHaveCount(1);
    await expect(discover.locator(".site-footer")).toHaveCount(1);
    await page.getByTestId("nav-documentation").click();
    await expect(page.getByTestId("terrain-stage")).toBeInViewport();
    await expect(page.locator("body")).toHaveClass(/is-beyond/);
    const gap = await page.evaluate(() => {
      const card = document.querySelector("#documentation .section-inner")?.getBoundingClientRect().bottom ?? 0;
      const footer = document.querySelector(".footer-bar")?.getBoundingClientRect().top ?? 0;
      return footer - card;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(32);
  });

  test("l’en-tête amène chaque carte juste sous l’en-tête et le nom Hall ramène au premier écran", async ({ page }) => {
    await page.goto("./");
    await sceneReady(page);
    await page.getByTestId("nav-telecharger").click();
    await expectCardUnderHeader(page, "#telecharger .section-inner");
    await page.getByTestId("nav-documentation").click();
    await expectCardUnderHeader(page, "#documentation .section-inner");
    await page.getByTestId("brand-home").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByTestId("nav-decouvrir")).toHaveAttribute("aria-current", "true");
    await page.getByTestId("nav-decouvrir").click();
    await expect.poll(() => belowHeader(page, '[data-testid="terrain-stage"]')).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("terrain-stage")).toBeInViewport();
  });

  test("on passe de carte en carte par les flèches, les repères et le clavier", async ({ page }) => {
    await page.goto("./");
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
      await page.goto("./");
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
