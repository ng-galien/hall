import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../fixtures/application";

test("imports selected folders on a folder and dropped folders on a business preserving all paths", async ({
  appPage: page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  const temp = await mkdtemp(join(tmpdir(), "hall-folder-"));
  const selected = join(temp, "Selection");
  await mkdir(join(selected, "Pieces", "Details"), { recursive: true });
  await writeFile(join(selected, "rapport.txt"), "Rapport principal");
  await writeFile(join(selected, "Pieces", "annexe.txt"), "Annexe");
  await writeFile(join(selected, "Pieces", "Details", "notes.txt"), "Notes");
  try {
    await page.goto("/app/workspace?path=seed");
    await page.getByTestId("workspace-tree-root").click({ button: "right" });
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("workspace-tree-import-folder").click();
    await (await chooser).setFiles(selected);
    await expect
      .poll(async () => (await (await page.request.get("/api/resources/catalog")).json()).entities?.length ?? 0)
      .toBeGreaterThan(0);
    const find = async (path: string, name: string) => {
      const data = await (await page.request.get("/api/resources/catalog")).json();
      return data.entities
        ?.map((entry: { properties: { path: string; name: string } }) => entry.properties)
        .find((resource: { path: string; name: string }) => resource.path === path && resource.name === name);
    };
    await expect.poll(() => find("seed/Selection/Pieces/Details", "notes.txt")).toBeTruthy();
    expect(await find("seed/Selection", "rapport.txt")).toBeTruthy();
    expect(await find("seed/Selection/Pieces", "annexe.txt")).toBeTruthy();
    const created = await page.request.post("/api/council-business", {
      data: { path: "seed", name: "Affaire import dossier", reportName: "Rapport", reportContent: "" },
    });
    const business = (await created.json()).properties;
    await page.reload();
    const target = page.getByTestId(`workspace-business-${business.id}`);
    await expect(target).toHaveAttribute("data-folder-import-enabled", "true");
    const dropFolder = async (target: import("@playwright/test").Locator) =>
      target.evaluate((element) => {
        const file = (name: string, text: string) => ({
          isFile: true,
          isDirectory: false,
          name,
          file: (resolve: (file: File) => void) => resolve(new File([text], name, { type: "text/plain" })),
        });
        const dir = (name: string, children: unknown[]) => ({
          isFile: false,
          isDirectory: true,
          name,
          createReader: () => {
            let read = false;
            return {
              readEntries: (resolve: (children: unknown[]) => void) => {
                resolve(read ? [] : children);
                read = true;
              },
            };
          },
        });
        const root = dir("Depot", [
          file("racine.txt", "Racine"),
          dir("Sous-dossier", [file("piece.txt", "Pièce")]),
          dir("Vide", []),
        ]);
        const transfer = new DataTransfer();
        Object.defineProperty(transfer, "items", { value: [{ webkitGetAsEntry: () => root }] });
        Object.defineProperty(transfer, "types", { value: ["Files"] });
        element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      });
    await dropFolder(target);
    await expect
      .poll(async () => {
        const detail = await (
          await page.request.get(`/api/council-business/resource-items?councilBusinessId=${business.id}`)
        ).json();
        return JSON.stringify(detail).includes("piece.txt");
      })
      .toBe(true);
    expect(await find("seed/Affaire import dossier/Depot/Sous-dossier", "piece.txt")).toBeTruthy();
    expect(await find("seed/Affaire import dossier/Depot", "Vide")).toBeTruthy();
    await expect(page.getByTestId("workspace-import-progress")).toHaveCount(0);
    await page.getByTestId(`workspace-business-title-${business.id}`).click({ button: "right" });
    const businessChooser = page.waitForEvent("filechooser");
    await page.getByTestId("workspace-tree-import-folder").click();
    await (await businessChooser).setFiles(selected);
    await expect.poll(() => find("seed/Affaire import dossier/Selection/Pieces/Details", "notes.txt")).toBeTruthy();
    await expect(page.getByTestId("workspace-import-progress")).toHaveCount(0);
    await dropFolder(page.getByTestId("workspace-tree-root"));
    await expect.poll(() => find("seed/Depot/Sous-dossier", "piece.txt")).toBeTruthy();
    expect(await find("seed/Depot", "Vide")).toBeTruthy();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("warns on identical file bytes across names and retains folder import errors", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  const original = await page.request.post("/api/resources/documents", {
    multipart: {
      path: "seed",
      file: { name: "original.txt", mimeType: "text/plain", buffer: Buffer.from("contenu identique") },
    },
  });
  const existing = (await original.json()).properties;
  await page.goto("/app/workspace?path=seed");
  await page.getByTestId("workspace-create-menu").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("workspace-create-file").click();
  await (await chooser).setFiles({
    name: "copie.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("contenu identique"),
  });
  await expect(page.getByTestId("workspace-import-duplicates")).toBeVisible();
  await expect(page.getByTestId(`workspace-import-existing-${existing.id}`)).toBeVisible();
  await expect(page.getByTestId("workspace-import-progress")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("identical-warning.png"), fullPage: true });
  await page.request.post("/api/resources", { data: { kind: "folder", path: "seed", name: "Autre" } });
  await page.goto("/app/workspace?path=seed/Autre");
  await page.getByTestId("workspace-create-menu").click();
  const different = page.waitForEvent("filechooser");
  await page.getByTestId("workspace-create-file").click();
  await (await different).setFiles({
    name: "original.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("contenu différent"),
  });
  await expect(page.getByTestId("resource-workbench")).toBeVisible();
  await expect(page.getByTestId("workspace-import-progress")).toHaveCount(0);
  await expect(page.getByTestId("workspace-import-duplicates")).toHaveCount(0);
  const temp = await mkdtemp(join(tmpdir(), "hall-folder-error-"));
  const directory = join(temp, "Erreur");
  await mkdir(directory);
  await writeFile(join(directory, "programme.exe"), "unsupported");
  try {
    await page.goto("/app/workspace?path=seed");
    await page.getByTestId("workspace-tree-root").click({ button: "right" });
    const rejected = page.waitForEvent("filechooser");
    await page.getByTestId("workspace-tree-import-folder").click();
    await (await rejected).setFiles(directory);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("workspace-import-progress")).toHaveCount(0);
    await expect(page.getByRole("alert")).toBeVisible();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("preserves empty folders through the native folder picker", async ({ appPage: page }) => {
  await page.goto("/app/workspace?path=seed");
  await page.evaluate(() => {
    const directory = (name: string, children: unknown[]) => ({
      kind: "directory",
      name,
      async *values() {
        yield* children;
      },
    });
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () =>
        directory("ChoixNatif", [
          directory("Vide", []),
          directory("Pieces", [
            {
              kind: "file",
              name: "note.txt",
              getFile: async () => new File(["note native"], "note.txt", { type: "text/plain" }),
            },
          ]),
        ]),
    });
  });
  await page.getByTestId("workspace-tree-root").click({ button: "right" });
  await page.getByTestId("workspace-tree-import-folder").click();
  await expect
    .poll(async () => {
      const result = await (await page.request.get("/api/resources/catalog")).json();
      const entries = result.entities.map((entry: { properties: { path: string; name: string } }) => entry.properties);
      return (
        entries.some(
          (entry: { path: string; name: string }) =>
            entry.path === "seed/ChoixNatif/Pieces" && entry.name === "note.txt",
        ) &&
        entries.some(
          (entry: { path: string; name: string }) => entry.path === "seed/ChoixNatif" && entry.name === "Vide",
        )
      );
    })
    .toBe(true);
});
