import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";
import { openDemonstration } from "../../../desktop/src/demonstration";

const require = createRequire(import.meta.url);
const desktopDirectory = resolve(import.meta.dirname, "../../../desktop");
const markerName = "marqueur-remise-a-zero.md";

async function resourcesContainMarker(page: Page): Promise<boolean> {
  return page.evaluate(
    async (name) => JSON.stringify(await (await fetch("/api/resources")).json()).includes(name),
    markerName,
  );
}

test("opens the Alésia demonstration signed in and resets it from the Démonstration menu", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "hall-demonstration-"));
  const application = await electron.launch({
    executablePath: require("electron") as unknown as string,
    args: [desktopDirectory],
    env: { ...process.env, HALL_USER_DATA_PATH: userDataPath, HALL_DESKTOP_EDITION: "demonstration" },
  });
  try {
    const window = await application.firstWindow();
    await expect(window.getByTestId("dashboard-next-meeting")).toBeVisible({ timeout: 8 * 60_000 });
    expect(new URL(window.url()).pathname).toBe("/app/");

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
