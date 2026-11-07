import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SIREN_MEDIA_TYPE, sirenData } from "@hall/api-contract";
import { type ElectronApplication, _electron as electron, expect, type Page, test } from "@playwright/test";
import { Client } from "pg";
import { openDemonstration } from "../../../desktop/src/demonstration";

const require = createRequire(import.meta.url);
const desktopDirectory = resolve(import.meta.dirname, "../../../desktop");
const markerName = "marqueur-remise-a-zero.md";

function launchDemonstration(userDataPath: string, env: Record<string, string> = {}) {
  const executable = process.env.HALL_E2E_DESKTOP_EXECUTABLE;
  return electron.launch({
    executablePath: executable ?? (require("electron") as unknown as string),
    args: executable ? [] : [desktopDirectory],
    env: {
      ...process.env,
      ...env,
      HALL_USER_DATA_PATH: userDataPath,
      HALL_DESKTOP_EDITION: "demonstration",
      XDG_CONFIG_HOME: join(userDataPath, "config"),
    },
  });
}

async function resourcesContainMarker(page: Page): Promise<boolean> {
  return page.evaluate(
    async (name) => JSON.stringify(await (await fetch("/api/resources")).json()).includes(name),
    markerName,
  );
}

async function expireDemonstrationSessions(userDataPath: string, application: ElectronApplication): Promise<void> {
  const postgres = join(userDataPath, "postgres");
  const pidFile = await readFile(join(postgres, "cluster", "postmaster.pid"), "utf8");
  const { password } = JSON.parse(await readFile(join(postgres, "credentials.json"), "utf8"));
  const database = new Client({
    host: "127.0.0.1",
    port: Number(pidFile.split("\n")[3]),
    user: "hall_local",
    database: "hall",
    password,
  });
  await database.connect();
  try {
    const expired = await database.query("UPDATE hall.app_session SET expires_at = now() WHERE expires_at > now()");
    expect(expired.rowCount).toBeGreaterThan(0);
  } finally {
    await database.end();
  }
  await application.evaluate(() => {
    const realNow = Date.now;
    Date.now = Object.assign(() => realNow() + 13 * 60 * 60 * 1000, {
      restore: () => {
        Date.now = realNow;
      },
    });
  });
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

async function openWorkspace(application: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => application.windows().some((page) => page.url().startsWith("hall-launch:")), { timeout: 15_000 })
    .toBe(true);
  const launch = application.windows().find((page) => page.url().startsWith("hall-launch:"))!;
  await expect(launch.getByTestId("launch-open")).toBeEnabled({ timeout: 120_000 });
  await launch.getByTestId("launch-open").click();
  const window = application.windows().find((page) => page.url().includes("/app/"))!;
  await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible();
  return window;
}

/** @verifies-requirement HALL-TR-DSK-030 */
test("renews the Alésia window session after expiry and opens the embedded workspace after reset", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "hall-demo-session-"));
  let sharedRequests = 0;
  const shared = createServer((_request, response) => {
    sharedRequests += 1;
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => shared.listen(0, "127.0.0.1", resolve));
  const sharedAddress = shared.address();
  if (typeof sharedAddress !== "object" || !sharedAddress) throw new Error("Missing shared server address");
  const sharedUrl = `http://127.0.0.1:${sharedAddress.port}/app/`;
  let application: ElectronApplication | undefined;
  try {
    application = await launchDemonstration(userDataPath);
    let window = await openWorkspace(application);
    await expireDemonstrationSessions(userDataPath, application);
    await window.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="auth-submit"]')) {
          document.documentElement.setAttribute("data-observed-login", "");
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await window.reload();
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible();
    await expect(window.locator("html")).not.toHaveAttribute("data-observed-login");
    await application.evaluate(() => {
      (Date.now as typeof Date.now & { restore(): void }).restore();
    });
    expect((await fetch(new URL("/api/auth/session", window.url()))).status).toBe(401);
    const socketConnected = await window.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const url = new URL("/api/live?kind=workspace", location.href);
          url.protocol = "ws:";
          const socket = new WebSocket(url);
          socket.addEventListener("open", () => {
            resolve(true);
            socket.close();
          });
          socket.addEventListener("error", () => resolve(false));
        }),
    );
    expect(socketConnected).toBe(true);

    await window.route("**/api/auth/session", (route) => route.abort());
    await window.reload();
    await expect(window.getByTestId("auth-load-error")).toBeVisible();
    await expect(window.locator("html")).not.toHaveAttribute("data-observed-login");
    await window.unroute("**/api/auth/session");
    await window.getByTestId("auth-retry").click();
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible();

    await application.close();
    application = await launchDemonstration(userDataPath, {
      HALL_SERVER_URL: sharedUrl,
      HALL_RENDERER_URL: sharedUrl,
    });
    window = await openWorkspace(application);
    expect(window.url()).not.toBe(sharedUrl);
    expect(sharedRequests).toBe(0);
    await application.evaluate(({ dialog, Menu }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
      const reset = Menu.getApplicationMenu()?.getMenuItemById("demonstration-reset");
      if (!reset) throw new Error("Missing Démonstration reset menu item");
      reset.click();
    });
    await expect.poll(() => window.url(), { timeout: 30_000 }).toMatch(/^data:/);
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible({ timeout: 120_000 });
    expect(window.url()).not.toBe(sharedUrl);
    expect(sharedRequests).toBe(0);
  } finally {
    await application?.close();
    await new Promise<void>((resolve) => shared.close(() => resolve()));
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
