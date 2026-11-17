import { expect, test } from "@playwright/test";

test("the scene resumes after its embedded preview temporarily has no layout", async ({ page }) => {
  test.skip(test.info().project.name !== "bureau", "Canvas lifecycle is shared by both layouts");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (/NaN|computeBoundingSphere/.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    const report = console.error;
    console.error = (...args: unknown[]) => {
      if (String(args[0]).includes("computeBoundingSphere")) {
        const host = document.querySelector(".p-canvas");
        report(
          "Invalid line diagnostic",
          JSON.stringify({
            stack: new Error().stack,
            width: host?.clientWidth,
            height: host?.clientHeight,
          }),
        );
      }
      report(...args);
    };
  });
  await page.goto("./studio/");
  test.skip(!(await page.getByTestId("studio-play").count()), "Studio is excluded from the public build");
  await expect(page.getByTestId("studio-step-picker")).toBeEnabled({ timeout: 60_000 });
  const preview = page.frames().find((frame) => frame !== page.mainFrame());
  if (!preview) throw new Error("Missing preview");
  await preview.evaluate(async () => {
    const stage = document.querySelector(".p-stage") as HTMLElement;
    stage.style.display = "none";
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    stage.style.display = "";
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.getByTestId("studio-frame-phone").click();
  await page.getByTestId("studio-frame-desktop").click();
  await page.getByTestId("studio-step-picker").selectOption("assistant");
  await page.getByTestId("studio-moment-secretaryWalksToDoor").click();
  await expect(page.getByTestId("studio-moment-name")).toHaveText("La maire marche jusqu'à la porte");
  expect(errors).toEqual([]);
});
