import { expect, test } from "@playwright/test";

test("landscape photographs have independent credited links without covering story labels", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "telephone";
  await page.setViewportSize({ width: phone ? 390 : 1440, height: phone ? 844 : 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./demonstration/");
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-motion", "done");
  if (phone) {
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(330, 740);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(80, 610, { steps: 10 });
      await page.mouse.up({ button: "right" });
    }
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
