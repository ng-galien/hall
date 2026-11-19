import { expect, historySettled, runItemCommand, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-DOC-280
test("opens recorded history for a non-text resource and its folder", async ({ appPage: page }) => {
  const folderName = `Audit history ${Date.now()}`;
  const folderResponse = await page.request.post("/api/resources", {
    data: { kind: "folder", path: "", name: folderName },
  });
  expect(folderResponse.status()).toBe(201);
  const folder = (await folderResponse.json()).properties;
  const createdResponse = await page.request.post("/api/resources", {
    data: { kind: "remote", path: folderName, name: "Tracked reference", target: { kind: "unconfigured" } },
  });
  expect(createdResponse.status()).toBe(201);
  let resource = (await createdResponse.json()).properties;
  for (const suffix of ["first", "second"]) {
    const response = await page.request.put(`/api/resources/${resource.id}/content`, {
      data: {
        kind: "remote",
        expectedVersion: resource.version,
        target: { kind: "url", url: `https://example.org/${suffix}` },
      },
    });
    expect(response.status()).toBe(200);
    resource = (await response.json()).properties;
  }
  try {
    await page.goto(`/app/workspace?resource=${resource.id}`);
    await runItemCommand(page, "resource-changes-trigger");
    const panel = page.getByTestId("resource-changes-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("resource-changes-item")).toHaveCount(3);
    await expect(panel.locator("time")).toHaveCount(3);
    await page.keyboard.press("Escape");
    // Closing the panel gives its history entry back; the folder address is opened once that return has arrived.
    await expect(panel).toBeHidden();
    await historySettled(page);
    await page.goto(`/app/workspace?path=${encodeURIComponent(folderName)}`);
    await runItemCommand(page, "resource-changes-trigger");
    await expect(page.getByTestId("resource-changes-panel").getByTestId("resource-changes-item")).toHaveCount(1);
  } finally {
    await page.request.delete(`/api/resources/${resource.id}`);
    await page.request.delete(`/api/resources/${folder.id}`);
  }
});

// @verifies-requirement HALL-FR-DOC-280
test("the history of a document records each saved change by the fields it touched", async ({ appPage: page }) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const root = `Historique ${marker}`;
  const post = async (data: Record<string, unknown>) => {
    const response = await page.request.post("/api/resources", { data });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).properties as { id: string; version: number };
  };
  const folder = await post({ kind: "folder", path: "", name: root });
  await post({ kind: "folder", path: root, name: "Classement" });
  const text = await post({ kind: "text", path: root, name: "Note", content: "Premier texte." });
  const current = async (id: string) =>
    (await (await page.request.get(`/api/resources/${id}`)).json()).properties as {
      version: number;
      path: string;
      name: string;
      tags: string[];
      autosaveEnabled?: boolean;
    };
  const fields = async (id: string) =>
    (
      (await (await page.request.get(`/api/resources/${id}/changes`)).json()).properties.changes as Array<{
        fields: string[];
      }>
    ).map((change) => change.fields.toSorted().join(","));
  const ok = (response: Awaited<ReturnType<typeof page.request.put>>) => expect(response.ok()).toBeTruthy();

  ok(
    await page.request.put(`/api/resources/${text.id}/content`, {
      data: { kind: "text", expectedVersion: (await current(text.id)).version, content: "Second texte." },
    }),
  );
  const metadata = (changes: Record<string, unknown>) =>
    current(text.id).then((entry) =>
      page.request.patch(`/api/resources/${text.id}/metadata`, {
        data: {
          path: entry.path,
          name: entry.name,
          tags: entry.tags,
          editing: { kind: "autosave", enabled: entry.autosaveEnabled ?? true },
          ...changes,
        },
      }),
    );
  ok(await metadata({ name: "Note renommée" }));
  ok(await metadata({ tags: ["voirie"] }));
  ok(await metadata({ editing: { kind: "autosave", enabled: false } }));
  ok(
    await page.request.patch(`/api/resources/${text.id}/location`, {
      data: { path: `${root}/Classement`, name: "Note renommée" },
    }),
  );
  expect(await fields(text.id)).toEqual(["path", "autosave", "tags", "name", "content", ""]);

  const entry = await current(folder.id);
  ok(
    await page.request.patch(`/api/resources/${folder.id}/metadata`, {
      data: { path: entry.path, name: entry.name, tags: entry.tags, color: "#1f7a4a", editing: { kind: "fixed" } },
    }),
  );
  expect((await fields(folder.id))[0]).toBe("color");
});
