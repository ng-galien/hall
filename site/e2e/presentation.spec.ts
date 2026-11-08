import { expect, test } from "@playwright/test";

/* Page de présentation : la gouttière montre les cinq lieux, et un clic sur un lieu mène à sa première sous-étape. */
test("la gouttière mène à la première sous-étape d’un lieu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telephone", "La gouttière est masquée sur téléphone.");
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  /* La gouttière apparaît dès que le récit commence. */
  await page.evaluate(() =>
    window.scrollTo(0, (document.querySelector(".p-scroll") as HTMLElement).offsetHeight * 0.06),
  );
  await expect(page.getByTestId("gutter")).not.toHaveClass(/is-hidden/);
  for (let i = 0; i < 5; i++) await expect(page.getByTestId(`gutter-place-${i}`)).toBeVisible();
  await page.getByTestId("gutter-place-2").click();
  await expect(page.getByTestId("gutter-sub-assistant")).toHaveClass(/is-current/);
  await expect(page.getByTestId("step-panel-title")).toHaveText("Votre assistant IA, relié à vos dossiers");
  await page.getByTestId("gutter-place-3").click();
  await expect(page.getByTestId("gutter-sub-appel")).toHaveClass(/is-current/);
  await expect(page.getByTestId("step-panel-title")).toHaveText("Appel et quorum");
});

test("la page se charge et se lit sur téléphone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "telephone", "Parcours téléphone.");
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.evaluate(() =>
    window.scrollTo(0, (document.querySelector(".p-scroll") as HTMLElement).offsetHeight * 0.2),
  );
  await expect(page.getByTestId("step-panel-title")).not.toHaveText("", { timeout: 15_000 });
});

/* Carte d'étape : la flèche d'ouverture lance le récit, les flèches de la carte passent d'une sous-étape à l'autre. */
test("la flèche d’ouverture et les flèches de la carte font avancer le récit", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("story-start").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Création de l'affaire", { timeout: 15_000 });
  await expect(page.getByTestId("step-card-previous")).toBeDisabled();
  await page.getByTestId("step-card-next").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Devis et budget", { timeout: 15_000 });
  await page.getByTestId("step-card-previous").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Création de l'affaire", { timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

/* Molette et pavé tactile : un flux continu fait défiler le récit, ralenti hors Mac ; une molette à crans joue une
   sous-étape par geste ; sur Mac, le pavé tactile reste continu mais légèrement ralenti. */
for (const system of ["linux", "windows", "mac"] as const) {
  test(`défilement à la molette et au pavé tactile (${system})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "telephone", "Gestes de souris et de pavé tactile.");
    await page.addInitScript((system) => {
      const mac = system === "mac";
      Object.defineProperty(navigator, "platform", {
        get: () => (mac ? "MacIntel" : system === "windows" ? "Win32" : "Linux x86_64"),
      });
      Object.defineProperty(navigator, "userAgentData", {
        get: () => ({
          platform: mac ? "macOS" : system === "windows" ? "Windows" : "Linux",
          brands: [],
          mobile: false,
        }),
      });
    }, system);
    await page.goto("./");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
    const max = await page.evaluate(
      () => (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight,
    );
    await page.evaluate((top) => window.scrollTo(0, top), Math.round(max * 0.3));
    /** La scène rejoint l'avancement de la page, sans lecture de sous-étape vers un autre instant. */
    const settled = () =>
      page.waitForFunction(
        (height) =>
          Math.abs(
            (window as unknown as { __presentation: { progress: () => number } }).__presentation.progress() -
              window.scrollY / height,
          ) < 1e-4,
        max,
        { timeout: 45_000 },
      );
    await settled();
    /** Événements de molette envoyés à la scène ; renvoie la part de ceux dont le défilement natif est empêché. */
    const wheel = (events: { deltaY: number; wheelDeltaY: number }[]) =>
      page.evaluate((list) => {
        let prevented = 0;
        for (const { deltaY, wheelDeltaY } of list) {
          const event = new WheelEvent("wheel", { deltaY, deltaMode: 0, bubbles: true, cancelable: true });
          Object.defineProperty(event, "wheelDeltaY", { value: wheelDeltaY });
          document.querySelector(".p-canvas")?.dispatchEvent(event);
          if (event.defaultPrevented) prevented++;
        }
        return prevented / list.length;
      }, events);

    /* Flux continu de pavé tactile : 40 événements de 10 px */
    const before = await page.evaluate(() => window.scrollY);
    const stream = Array.from({ length: 40 }, () => ({ deltaY: 10, wheelDeltaY: system === "mac" ? -30 : -12 }));
    const prevented = await wheel(stream);
    const moved = (await page.evaluate(() => window.scrollY)) - before;
    if (system === "mac") {
      expect(prevented).toBe(1);
      expect(moved).toBeGreaterThanOrEqual(259);
      expect(moved).toBeLessThanOrEqual(261);
      await settled();
      // Mac mice can report the same legacy ratio as a trackpad; a large tick must stay bounded.
      for (const direction of [1, -1]) {
        const at = await page.evaluate(() => window.scrollY);
        expect(await wheel([{ deltaY: direction * 120, wheelDeltaY: direction * -360 }])).toBe(1);
        const jump = (await page.evaluate(() => window.scrollY)) - at;
        expect(jump * direction).toBeGreaterThan(0);
        expect(Math.abs(jump)).toBeLessThanOrEqual(36);
      }
      await settled();
    } else {
      expect(prevented).toBe(1);
      expect(moved).toBeGreaterThanOrEqual(139);
      expect(moved).toBeLessThanOrEqual(141);
      /* Pas de lecture de sous-étape : la scène suit l'avancement de la page et s'y arrête */
      await settled();
    }

    /* Molette à crans de Chrome sous Linux : deltaY 53,33 pour wheelDeltaY -120, un geste de quatre crans */
    await page.waitForTimeout(400);
    const ids = await page
      .locator("[data-testid^=gutter-sub-]")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.testid?.slice("gutter-sub-".length)));
    /** Rang de la sous-étape où se trouve la page. */
    const stepIndex = () =>
      page.evaluate((list) => {
        const story = (window as unknown as { __presentation: { range: (id: string) => [number, number] } })
          .__presentation;
        const height =
          (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight;
        const p = window.scrollY / height;
        return list.findIndex((id) => {
          const [a, b] = story.range(id as string);
          return p >= a && p < b;
        });
      }, ids);
    const from = await stepIndex();
    const title = await page.getByTestId("step-panel-title").textContent();
    const notches = Array.from({ length: 4 }, () => ({ deltaY: 53.33, wheelDeltaY: -120 }));
    expect(await wheel(notches)).toBe(1);
    await expect(page.getByTestId("step-panel-title")).not.toHaveText(title ?? "", { timeout: 15_000 });
    /* Un seul pas pour le geste entier, même avec l’animation Mac plus lente. */
    await expect.poll(async () => (await stepIndex()) - from, { timeout: 30_000 }).toBe(1);
  });
}
