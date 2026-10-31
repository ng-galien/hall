import { expect, test } from "../fixtures/application";

test.describe("navigation and settings", () => {
  test("keeps primary navigation focus visible and keyboard-operable", async ({ appPage: page }) => {
    await page.getByTestId("navigation-overview").focus();
    await page.keyboard.press("Tab");
    const meetings = page.getByTestId("navigation-meetings");
    await expect(meetings).toBeFocused();
    const focus = await meetings.evaluate((element) => ({
      visible: element.matches(":focus-visible"),
      style: getComputedStyle(element).outlineStyle,
      width: parseFloat(getComputedStyle(element).outlineWidth),
    }));
    expect(focus.visible).toBe(true);
    expect(focus.style).not.toBe("none");
    expect(focus.width).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/meetings$/);
  });

  test("loads every lazy route from the primary navigation", async ({ appPage: page }) => {
    const routes = [
      ["meetings", /\/app\/meetings$/, "Council meetings"],
      ["minutes", /\/app\/minutes$/, "Minutes"],
      ["council-decisions", /\/app\/council-decisions$/, "Council decisions"],
      ["workspace", /\/app\/workspace$/, null],
      ["maps", /\/app\/maps\?view=/, null],
      ["contacts", /\/app\/contacts$/, "Contacts"],
      ["council-members", /\/app\/council-members$/, "Council composition"],
      ["council-committees", /\/app\/council-committees$/, null],
    ] as const;

    for (const [linkName, url, heading] of routes) {
      await page.getByTestId(`navigation-${linkName}`).click();
      await expect(page).toHaveURL(url);
      if (heading) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.getByTestId("navigation-settings").click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });

  // @verifies-requirement HALL-FR-WSP-310
  test("places Cartes right after the workspace entry and its tree, before the calendar", async ({ appPage: page }) => {
    await expect(page.getByTestId("workspace-sidebar-link").first()).toBeVisible();
    const order = await page
      .locator('a[data-testid^="navigation-"], a[data-testid="workspace-sidebar-link"]')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("data-testid"))
          .filter((testId, index, all) => testId !== "workspace-sidebar-link" || all[index - 1] !== testId),
      );
    expect(order.slice(0, 8)).toEqual([
      "navigation-overview",
      "navigation-meetings",
      "navigation-minutes",
      "navigation-council-decisions",
      "navigation-workspace",
      "workspace-sidebar-link",
      "navigation-maps",
      "navigation-calendar",
    ]);
  });

  test("persists the selected interface language after a reload", async ({ appPage: page }) => {
    await page.getByTestId("navigation-settings").click();
    await page.getByTestId("settings-language").click();
    await page.getByTestId("settings-language-fr").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
    await page.getByTestId("settings-language").click();
    await page.getByTestId("settings-language-en").click();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Hall, municipal council");

    await page.reload();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-language")).toContainText("English");
    await expect(page.getByTestId("navigation-meetings")).toHaveText("Meetings");
  });

  test("keeps authentication credentials out of application settings", async ({ appPage: page }) => {
    await page.getByTestId("navigation-settings").click();
    await expect(page.getByTestId("settings-language")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toBeVisible();
    await expect(page.getByLabel("Access token", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save access", exact: true })).toHaveCount(0);
    await expect(page.getByText("Server access has been saved and verified.", { exact: true })).toHaveCount(0);
  });
});

// TODO REMOVE_STALE: temporary incomplete meetings must not replace the next active meeting.
test("stale meetings stay accessible with a yellow review badge and never become next", async ({ appPage: page }) => {
  const source = await (await page.request.get("/api/council-meetings")).json();
  const template = source.entities[0];
  const meetings = Array.from({ length: 6 }, (_, index) => {
    const id = `00000000-0000-4000-8000-00000000000${index}`;
    const scheduledAt = new Date(Date.now() + (index - 4) * 86400000).toISOString();
    return {
      ...template,
      properties: {
        ...template.properties,
        id,
        slug: null,
        number: index + 1,
        scheduledAt,
        stale: index > 0 && index < 5,
        startedAt: index === 0 ? scheduledAt : null,
        closedAt: index === 0 ? scheduledAt : null,
      },
    };
  });
  await page.route("**/api/council-meetings", (route) =>
    route.fulfill({ contentType: "application/vnd.siren+json", json: { ...source, entities: meetings } }),
  );
  await page.evaluate(() => localStorage.setItem("mairie.locale", "fr"));
  await page.reload();
  await expect(page.getByTestId("application-sync-status")).toHaveAttribute("data-sync-state", "synchronized");
  const next = meetings[5].properties.id;
  await expect(page.getByTestId("dashboard-next-meeting")).toHaveAttribute("href", `/app/meetings/${next}`);
  await page.getByTestId("navigation-meetings").click();
  await expect(page.getByTestId("meeting-next")).toHaveAttribute("href", `/app/meetings/${next}`);
  await expect(page.getByTestId("meeting-needs-review")).toHaveCount(4);
  for (const meeting of meetings.slice(1, 5)) {
    const row = page.getByTestId(`meeting-history-${meeting.properties.id}`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("href", `/app/meetings/${meeting.properties.id}`);
    const badge = row.getByTestId("meeting-needs-review");
    await expect(badge).toHaveText("À réviser");
    await expect(badge).toHaveAttribute("data-variant", "warning");
  }
  await expect(page.getByTestId(`meeting-history-${meetings[0].properties.id}`)).toBeVisible();
  await expect(page.getByTestId("meeting-next").getByTestId("meeting-needs-review")).toHaveCount(0);
});
