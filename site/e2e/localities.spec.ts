import { expect, test } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("local villages and hamlets are available without covering story labels", async ({ page }, testInfo) => {
  await page.goto("./demonstration/?view=3d");
  const stage = page.getByTestId("terrain-stage");
  await expect(stage).toHaveAttribute("data-ready", "true");
  const localities = page.getByTestId("locality-name");
  await expect(localities).toHaveCount(82);
  const names = await localities.allTextContents();
  for (const name of [
    "Crans",
    "Syam",
    "Chaux-des-Crotenay",
    "Les Planches-en-Montagne",
    "Foncine-le-Bas",
    "Foncine-le-Haut",
    "Le Vaudioux",
    "Bief-des-Maisons",
    "Les Chalesmes",
    "Entre-deux-Monts",
    "Fort-du-Plasne",
    "Montliboz",
    "Cornu",
  ])
    expect(names).toContain(name);
  // Since the battle map, the demonstration opens on the battle introduction rather than on the overview of the relief.
  await expect(stage).toHaveAttribute("data-intro", "ready");
  const overlaps = () =>
    page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>(".is-locality, .terrain-label, .terrain-mark")]
        .filter((node) => getComputedStyle(node).visibility === "visible" && node.offsetWidth > 0)
        .map((node) => ({ text: node.textContent, rect: node.getBoundingClientRect() }));
      const result: string[] = [];
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          if (
            Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 2 &&
            Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 2
          )
            result.push(`${a.text} / ${b.text}`);
        }
      return result;
    });
  await expect.poll(overlaps).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("localities-overview.png") });
  await page.getByTestId("intro-discover").click();
  await expect(page.getByTestId("scenario-ouverture")).toBeVisible();
  await expect(stage).toHaveAttribute("data-motion", "done");
  await expect.poll(overlaps).toEqual([]);
});
