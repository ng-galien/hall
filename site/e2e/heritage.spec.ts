import { expect, test } from "@playwright/test";

test("landscape photographs have independent credited links without covering story labels", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "telephone";
  await page.setViewportSize({ width: phone ? 390 : 1440, height: phone ? 844 : 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./demonstration/");
  const stage = page.getByTestId("terrain-stage");
  await expect(stage).toHaveAttribute("data-ready", "true");
  // Since the battle map, the photographs are reached by moving the free map onto their place: the scenario enters
  // the free map, zooms out over the valley and, if needed, moves it aside, until both photographs are in frame.
  await expect(stage).toHaveAttribute("data-intro", "ready");
  const box = await page.getByTestId("terrain-canvas").boundingBox();
  if (!box) throw new Error("The terrain canvas is not visible");
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y + 100);
  await page.mouse.wheel(0, -150);
  await expect(stage).toHaveAttribute("data-intro", "off");
  const inFrame = () =>
    page.evaluate(() =>
      ["langouette", "bief-ruine"].every(
        (id) => document.querySelector<HTMLElement>(`[data-testid="heritage-${id}"]`)?.hidden === false,
      ),
    );
  const moves: Array<() => Promise<void>> = [
    ...Array.from({ length: 10 }, () => async () => {
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.wheel(0, 300);
    }),
    ...Array.from({ length: 2 }, () => async () => {
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(centre.x - Math.min(150, box.width / 3), centre.y, { steps: 8 });
      await page.mouse.up({ button: "right" });
    }),
  ];
  for (const move of moves) {
    if (await inFrame()) break;
    await move();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }
  for (const id of ["langouette", "bief-ruine"]) {
    const marker = page.getByTestId(`heritage-${id}`);
    await expect(marker).toBeVisible();
    await expect(marker.locator(".heritage-icon svg")).toBeVisible();
    await expect(marker.locator("img")).toHaveCount(0);
    await expect(marker.locator(".heritage-photo")).toHaveAttribute("href", /^https:\/\/commons\.wikimedia\.org\//);
    await marker.locator(".heritage-info").focus();
    await page.keyboard.press("Enter");
    const information = page.getByTestId("heritage-information");
    await expect(information).toBeVisible();
    await expect(information.locator(".heritage-credit")).toContainText("CC BY-SA");
    await expect(information.locator(".heritage-context")).toHaveAttribute(
      "href",
      /^https:\/\/berthier\.archeojurasites\.org\//,
    );
    await information.getByRole("button", { name: "Fermer" }).click();
    await expect(information).toBeHidden();
    await expect(marker.locator(".heritage-photo")).toHaveAttribute("target", "_blank");
  }
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>(".heritage-label, .terrain-label, .terrain-mark")]
      .filter((node) => !node.hidden && getComputedStyle(node).visibility !== "hidden")
      .map((node) => ({ heritage: node.classList.contains("heritage-label"), rect: node.getBoundingClientRect() }));
    return boxes.some((a, i) =>
      boxes
        .slice(i + 1)
        .some(
          (b) =>
            (a.heritage || b.heritage) &&
            Math.min(a.rect.right, b.rect.right) > Math.max(a.rect.left, b.rect.left) &&
            Math.min(a.rect.bottom, b.rect.bottom) > Math.max(a.rect.top, b.rect.top),
        ),
    );
  });
  expect(overlaps).toBe(false);
  const before = page.url();
  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("heritage-langouette").locator(".heritage-photo").click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/commons\.wikimedia\.org/);
  await popup.close();
  expect(page.url()).toBe(before);
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
});
