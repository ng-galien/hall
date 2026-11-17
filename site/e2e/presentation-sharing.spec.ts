import { expect, test } from "@playwright/test";

type Copy = {
  visible: boolean;
  sameDocument: boolean;
  screen: { x: number; y: number };
  width: number;
  opacity: number;
  door: number[];
  inside: number[];
  bounds: { left: number; right: number; top: number; bottom: number };
  position: number[];
  routePoint: number[];
  camera: number[];
  link: boolean;
  outgoing: boolean;
  returning: boolean;
  glow: number;
};
type Inspection = {
  __presentation: {
    progress(): number;
    motion(): { camera: { x: number; y: number } };
    sharedResolution(): Copy;
  };
};
const mairie = { x: 3853, y: -4496 };
const prefecture = { x: 1408, y: -2285 };
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test("the real final navigation follows the act into the prefecture", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/NaN|computeBoundingSphere/.test(message.text())) errors.push(message.text());
  });
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("story-start").click();
  await expect(page.getByTestId("gutter-place-4")).toBeVisible();
  await page.getByTestId("gutter-place-4").click();
  await expect(page.getByTestId("gutter-sub-gel")).toHaveClass(/is-current/);
  await page.getByTestId("gutter-sub-liste").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Liste des délibérations");
  expect(
    distance(await page.evaluate(() => (window as unknown as Inspection).__presentation.motion().camera), mairie),
  ).toBeLessThan(80);
  await page.getByTestId("step-card-next").click();
  await expect(page.getByTestId("step-card-next")).toBeEnabled({ timeout: 10_000 });
  expect(
    distance(await page.evaluate(() => (window as unknown as Inspection).__presentation.motion().camera), mairie),
  ).toBeLessThan(80);
  const source = page.locator(".b-face.is-active .b-row").filter({ hasText: "Figée, numérotée et datée" });
  await expect(source).toBeVisible();
  await page.getByTestId("step-card-next").click();
  const samples = await page.evaluate(
    () =>
      new Promise<{ copy: Copy; camera: { x: number; y: number } }[]>((resolve) => {
        const samples: { copy: Copy; camera: { x: number; y: number } }[] = [];
        const start = performance.now();
        const sample = () => {
          const inspection = (window as unknown as Inspection).__presentation;
          samples.push({ copy: inspection.sharedResolution(), camera: inspection.motion().camera });
          if (performance.now() - start > 11_200) resolve(samples);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
  const travelling = samples.filter((sample) => sample.copy.outgoing);
  expect(travelling.length).toBeGreaterThan(2);
  const first = travelling[0].copy.position;
  const last = travelling[travelling.length - 1].copy.position;
  expect(Math.hypot(...first.map((value, i) => value - last[i]))).toBeGreaterThan(150);
  expect(travelling.every((sample) => sample.copy.link && sample.copy.sameDocument)).toBe(true);
  for (const sample of travelling) {
    expect(Math.hypot(...sample.copy.position.map((value, i) => value - sample.copy.routePoint[i]))).toBeLessThan(0.01);
    expect(sample.copy.bounds.left).toBeGreaterThan(0);
    expect(sample.copy.bounds.right).toBeLessThan(page.viewportSize()?.width ?? 0);
    expect(sample.copy.bounds.top).toBeGreaterThan(50);
    expect(sample.copy.bounds.bottom).toBeLessThan(page.viewportSize()?.height ?? 0);
  }
  expect(
    samples.filter((sample) => distance(sample.camera, mairie) > 300 && distance(sample.camera, prefecture) > 300)
      .length,
  ).toBeGreaterThan(1);
  expect(samples.some((sample) => sample.copy.returning)).toBe(true);
  expect(samples.some((sample) => sample.copy.glow > 0.25)).toBe(true);
  await expect(source).toBeVisible();
  await expect(page.getByTestId("sharing-destination")).toBeVisible({ timeout: 5000 });
  const arrived = await page.evaluate(() => ({
    copy: (window as unknown as Inspection).__presentation.sharedResolution(),
    camera: (window as unknown as Inspection).__presentation.motion().camera,
  }));
  expect(arrived.copy.visible).toBe(false);
  const entering = samples.filter((sample) => sample.copy.visible && !sample.copy.outgoing && sample.copy.glow > 0);
  expect(entering.length).toBeGreaterThan(0);
  expect(entering.some((sample) => sample.copy.width < 1 && sample.copy.opacity > 0.5)).toBe(true);
  expect(Math.hypot(...arrived.copy.position.map((value, i) => value - arrived.copy.inside[i]))).toBeLessThan(0.2);
  expect(arrived.copy.sameDocument).toBe(true);
  expect(distance(arrived.camera, prefecture)).toBeLessThan(40);
  await expect(source).toBeVisible();
  await expect(page.getByTestId("sharing-destination")).toHaveText("Préfecture · copie partagée");
  await expect(page.locator(".b-row-check")).toHaveCount(0);
  await expect(page.locator(".b-face.is-active")).not.toContainText(/accusé|contrôle de légalité/);
  await expect(page.getByTestId("step-panel-title")).toHaveText(
    test.info().project.name === "telephone" ? "Délibération partagée" : "Partage de la délibération",
  );
  expect(errors).toEqual([]);
});

test("the studio changes the arrival reduction in the actual preview", async ({ page }) => {
  test.skip(test.info().project.name !== "bureau", "Same editor for both frames");
  test.setTimeout(60_000);
  await page.goto("./studio/");
  test.skip(!(await page.getByTestId("studio-play").count()), "Private studio only");
  await expect(page.getByTestId("studio-step-picker")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("studio-step-picker").selectOption("transmission");
  await page.getByTestId("studio-moment-resolutionShrinks").click();
  const preview = page.frames().find((frame) => frame !== page.mainFrame());
  if (!preview) throw new Error("Missing preview");
  await expect(preview.getByTestId("sharing-destination")).toBeVisible();
  const before = await preview.evaluate(
    () => (window as unknown as Inspection).__presentation.sharedResolution().width,
  );
  await expect(page.getByTestId("studio-moment-start")).toBeDisabled();
  await expect(page.getByTestId("studio-moment-end")).toHaveValue("8.5");
  await page.getByTestId("studio-moment-end").fill("9");
  await page.getByTestId("studio-moment-apply").click();
  await expect
    .poll(async () =>
      Math.abs(
        (await preview.evaluate(() => (window as unknown as Inspection).__presentation.sharedResolution().width)) -
          before,
      ),
    )
    .toBeGreaterThan(0.01);
  await page.getByTestId("studio-undo").click();
  await expect(page.getByTestId("studio-moment-end")).toHaveValue("8.5");
  await expect
    .poll(async () =>
      Math.abs(
        (await preview.evaluate(() => (window as unknown as Inspection).__presentation.sharedResolution().width)) -
          before,
      ),
    )
    .toBeLessThan(0.001);
});
