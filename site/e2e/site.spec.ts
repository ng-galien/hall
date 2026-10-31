import { expect, type Page, test } from "@playwright/test";

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
const documentation = "https://github.com/ng-galien/hall/tree/main/packages/client/src/docs/content/fr";
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectLinks(page: Page) {
  await expect(page.getByTestId("download-link")).toHaveAttribute("href", releases);
  await expect(page.getByTestId("documentation-link")).toHaveAttribute("href", documentation);
  await expect(page.getByTestId("footer-download-link")).toHaveAttribute("href", releases);
  await expect(page.getByTestId("footer-documentation-link")).toHaveAttribute("href", documentation);
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
    const canvas = page.getByTestId("terrain-canvas");
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0)).toBe(true);
    await expectLinks(page);
    await expectNoHorizontalScroll(page);

    for (const id of order) {
      await page.getByTestId(`place-${id}`).click();
      await expect(page.getByTestId("scenario-panel")).toBeVisible();
      await expect(page.getByTestId(`scenario-${id}`)).toBeVisible();
      await expect(page.getByTestId(`place-${id}`)).toHaveAttribute("aria-pressed", "true");
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

  test("un clic sur la maison commune dans la scène ouvre la convocation", async ({ page }) => {
    await page.goto("./");
    await sceneReady(page);
    const label = page.getByTestId("terrain-label-maison");
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
  await expect(page.getByTestId("place-grenier")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("scenario-close").click();
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(() => window.location.href.includes("#"))).toBe(false);
  await page.getByTestId("place-actes").click();
  expect(new URL(page.url()).hash).toBe("#actes");
});

test("le récit reste dans l’oppidum, sans objet contemporain ni sortie du jeu", async ({ page }) => {
  await page.goto("./?vue=sans-3d");
  const page_text = await page.locator("body").innerText();
  const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
  expect(page_text).not.toMatch(outsideTheGame);
  expect(description).not.toMatch(outsideTheGame);
  for (const name of ["Alésia", "Cornu", "Jura", "Chaux-des-Crotenay", "Mandubiens", "plaine de Syam", "Lemme"]) {
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
