import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SIREN_MEDIA_TYPE, sirenData } from "@hall/api-contract";
import { _electron as electron, expect, type Page, test } from "@playwright/test";
import { openDemonstration } from "../../../desktop/src/demonstration";

const require = createRequire(import.meta.url);
const desktopDirectory = resolve(import.meta.dirname, "../../../desktop");
const markerName = "marqueur-remise-a-zero.md";

function launchDemonstration(userDataPath: string) {
  const executable = process.env.HALL_E2E_DESKTOP_EXECUTABLE;
  return electron.launch({
    executablePath: executable ?? (require("electron") as unknown as string),
    args: executable ? [] : [desktopDirectory],
    env: { ...process.env, HALL_USER_DATA_PATH: userDataPath, HALL_DESKTOP_EDITION: "demonstration" },
  });
}

async function resourcesContainMarker(page: Page): Promise<boolean> {
  return page.evaluate(
    async (name) => JSON.stringify(await (await fetch("/api/resources")).json()).includes(name),
    markerName,
  );
}

/** @verifies-requirement HALL-TR-DSK-020 */
test("opens Alésia signed in, retains changes on relaunch and resets them from the Démonstration menu", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "hall-demonstration-"));
  let application = await launchDemonstration(userDataPath);
  try {
    await expect
      .poll(() => application.windows().some((page) => page.url().startsWith("hall-launch:")), { timeout: 15_000 })
      .toBe(true);
    const launch = application.windows().find((page) => page.url().startsWith("hall-launch:"))!;
    await expect(launch.locator("html")).toHaveAttribute("data-commune", "39129");
    await expect(launch.locator("html")).toHaveAttribute("data-state", "final", { timeout: 15_000 });
    await expect(launch.getByTestId("launch-place")).toHaveText("Alésia, territoire des Mandubiens");
    await expect(launch.getByTestId("launch-open")).toBeEnabled({ timeout: 8 * 60_000 });
    await expect(launch.getByTestId("launch-step-count")).toHaveText("4 sur 4");
    await expect(launch.locator("html")).toHaveAttribute("data-progress-statistics", /.+/, { timeout: 5_000 });
    const firstFrameAt = Number(await launch.locator("html").getAttribute("data-first-frame-at"));
    const phases = JSON.parse((await launch.getByTestId("launch-loader").getAttribute("data-phases")) ?? "{}");
    expect(Object.keys(phases)).toEqual(["database", "server", "dataset", "interface"]);
    expect(phases.database.startMs).toBeGreaterThanOrEqual(firstFrameAt);
    expect(phases.server.startMs).toBeGreaterThanOrEqual(phases.database.endMs);
    expect(phases.dataset.startMs).toBeGreaterThanOrEqual(phases.server.endMs);
    expect(phases.interface.startMs).toBeGreaterThanOrEqual(phases.dataset.endMs);
    await writeFile(
      test.info().outputPath("startup-first-frames.json"),
      JSON.stringify(await launch.evaluate(() => window.hallLaunchSnapshot?.())),
    );
    const motion = JSON.parse((await launch.locator("html").getAttribute("data-progress-statistics")) ?? "{}");
    expect(motion.backwards).toBe(0);
    expect(motion.longestStillMs).toBeLessThan(1_000);
    expect(motion.maxStepPerFrame).toBeLessThan(0.05);
    const story = launch.getByTestId("launch-story-list");
    const places = await story.locator("li").count();
    await expect(story.locator('li[data-state="written"]')).toHaveCount(places, { timeout: 25_000 });
    await launch.waitForTimeout(1_000);
    await launch.screenshot({ path: test.info().outputPath("candidate-startup-final.png") });
    await launch.getByTestId("launch-open").click();
    await expect
      .poll(() => application.windows().some((page) => page.url().startsWith("hall-launch:")), { timeout: 5_000 })
      .toBe(false);
    let window = application.windows().find((page) => page.url().includes("/app/"))!;
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible({ timeout: 8 * 60_000 });
    expect(new URL(window.url()).pathname).toBe("/app/");
    await window.screenshot({ path: test.info().outputPath("candidate-dashboard.png") });
    const collections = await window.evaluate(async (accept) => {
      const read = async (path: string) => {
        const response = await fetch(`/api/${path}`, { headers: { Accept: accept } });
        if (!response.ok) throw new Error(`${path}: ${response.status}`);
        return response.json();
      };
      return {
        meetings: await read("council-meetings"),
        minutes: await read("minutes"),
        decisions: await read("council-decisions"),
      };
    }, SIREN_MEDIA_TYPE);
    const meetings = sirenData<unknown[]>(collections.meetings);
    const minutes = sirenData<unknown[]>(collections.minutes);
    const decision = sirenData<{ id: string; title: string }[]>(collections.decisions).find((item) =>
      /grenier/i.test(item.title),
    );
    if (!decision) throw new Error("Missing Alésia granary decision");
    expect(meetings.length).toBeGreaterThan(0);
    expect(minutes.length).toBeGreaterThan(0);
    const preview = await window.evaluate(async (id) => {
      const response = await fetch(`/api/council-decisions/${id}/preview.pdf`);
      return {
        status: response.status,
        mediaType: response.headers.get("content-type"),
        bytes: [...new Uint8Array(await response.arrayBuffer())],
      };
    }, decision.id);
    expect(preview.status).toBe(200);
    expect(preview.mediaType).toContain("application/pdf");
    const pdf = Buffer.from(preview.bytes);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    await writeFile(test.info().outputPath("candidate-decision-preview.pdf"), pdf);
    await writeFile(
      test.info().outputPath("candidate-alesia-summary.json"),
      JSON.stringify({
        meetings: meetings.length,
        minutes: minutes.length,
        title: decision.title,
        pdfBytes: pdf.length,
      }),
    );

    const created = await window.evaluate(async (name) => {
      const response = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "text", name, path: "", content: "Marqueur" }),
      });
      return `${response.status} ${await response.text()}`;
    }, markerName);
    expect(created).toMatch(/^201 /);
    expect(await resourcesContainMarker(window)).toBe(true);

    await application.close();
    application = await launchDemonstration(userDataPath);
    await expect.poll(() => application.windows().some((page) => page.url().startsWith("hall-launch:"))).toBe(true);
    const relaunch = application.windows().find((page) => page.url().startsWith("hall-launch:"))!;
    await expect(relaunch.getByTestId("launch-open")).toBeEnabled({ timeout: 120_000 });
    await expect(relaunch.locator("html")).toHaveAttribute("data-state", "final", { timeout: 20_000 });
    await relaunch.keyboard.press("Enter");
    await expect.poll(() => application.windows().some((page) => page.url().startsWith("hall-launch:"))).toBe(false);
    window = application.windows().find((page) => page.url().includes("/app/"))!;
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible();
    expect(await resourcesContainMarker(window)).toBe(true);

    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
    });
    await application.evaluate(({ Menu }) => {
      const reset = Menu.getApplicationMenu()?.getMenuItemById("demonstration-reset");
      if (!reset) throw new Error("Missing Démonstration reset menu item");
      reset.click();
    });
    await expect.poll(() => window.url(), { timeout: 30_000 }).toMatch(/^data:/);
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible({ timeout: 8 * 60_000 });
    expect(await resourcesContainMarker(window)).toBe(false);
  } finally {
    await application.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test("refuses to erase a profile whose database is not a demonstration", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "hall-local-profile-"));
  try {
    await mkdir(join(userDataPath, "postgres"));
    await writeFile(join(userDataPath, "postgres", "PG_VERSION"), "17\n");
    await expect(
      openDemonstration({
        userDataPath,
        applicationVersion: "0.1.0",
        startServer: () => Promise.reject(new Error("The server must not start")),
      }),
    ).rejects.toThrow("n’est pas une démonstration");
    expect(await readdir(join(userDataPath, "postgres"))).toEqual(["PG_VERSION"]);
    expect(await readdir(userDataPath)).toEqual(["postgres"]);
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
});
