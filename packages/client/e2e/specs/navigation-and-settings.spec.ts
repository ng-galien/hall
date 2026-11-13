import { expect, openMenuEntry, test } from "../fixtures/application";

test.describe("navigation and settings", () => {
  test("keeps primary navigation focus visible and keyboard-operable", async ({ appPage: page }) => {
    await page.getByTestId("navigation-overview").focus();
    await page.keyboard.press("Tab");
    const meetings = page.getByTestId("navigation-council");
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
      ["mail", /\/app\/mail\/drafts$/, "Drafts"],
      ["contacts", /\/app\/contacts$/, "Contacts"],
      ["council-members", /\/app\/council-members$/, "Council composition"],
      ["council-committees", /\/app\/council-committees$/, null],
    ] as const;

    for (const [linkName, url, heading] of routes) {
      await openMenuEntry(page, linkName);
      await expect(page).toHaveURL(url);
      if (heading) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.getByTestId("navigation-settings").click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });

  // @verifies-requirement HALL-FR-LAY-110
  // @verifies-requirement HALL-FR-WSP-310
  test("shows the entries in three blocks and the sub-resources of the entry where one is", async ({
    appPage: page,
  }) => {
    const sidebar = page.locator(".app-sidebar");
    const order = () =>
      sidebar
        .locator('a[data-testid^="navigation-"], a[data-testid^="mail-folder-"]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
    const blocks = () =>
      sidebar
        .locator(".app-sidebar-block")
        .evaluateAll((elements) =>
          elements.map((element) =>
            [...element.querySelectorAll(":scope > .app-sidebar-item > a")].map((link) =>
              link.getAttribute("data-testid"),
            ),
          ),
        );
    expect(await blocks()).toEqual([
      ["navigation-overview"],
      ["navigation-council", "navigation-workspace", "navigation-mail", "navigation-calendar"],
      ["navigation-contacts", "navigation-maps", "navigation-administration"],
    ]);
    await expect(sidebar.locator(".nav-section-label")).toHaveCount(0);
    expect((await order()).slice(-2)).toEqual(["navigation-documentation", "navigation-settings"]);
    await expect(sidebar.locator(".nav-sub")).toHaveCount(0);
    // Every entry has its own icon.
    const icons = await sidebar
      .locator("a .nav-icon svg")
      .evaluateAll((elements) => elements.map((element) => element.innerHTML));
    expect(new Set(icons).size).toBe(icons.length);

    // « Conseil municipal » goes to its first sub-resource and shows the six of them; one entry is open at a time.
    await page.getByTestId("navigation-council").click();
    await expect(page).toHaveURL(/\/app\/meetings$/);
    await expect
      .poll(order)
      .toEqual([
        "navigation-overview",
        "navigation-council",
        "navigation-meetings",
        "navigation-minutes",
        "navigation-council-decisions",
        "navigation-council-members",
        "navigation-council-committees",
        "navigation-council-delegations",
        "navigation-workspace",
        "navigation-mail",
        "navigation-calendar",
        "navigation-contacts",
        "navigation-maps",
        "navigation-administration",
        "navigation-documentation",
        "navigation-settings",
      ]);
    await expect(page.getByTestId("navigation-meetings")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("navigation-council")).not.toHaveAttribute("aria-current", "page");

    // « Administration » holds the settings of the commune and of the software, each on its own screen.
    await page.getByTestId("navigation-administration").click();
    await expect(page).toHaveURL(/\/app\/administration\/commune$/);
    await expect(page.getByTestId("navigation-meetings")).toHaveCount(0);
    await expect(page.getByTestId("navigation-administration-commune")).toBeVisible();
    const administration = (await order()).slice((await order()).indexOf("navigation-administration") + 1, -2);
    expect(administration).toEqual([
      "navigation-administration-commune",
      "navigation-users",
      "navigation-administration-rights",
      "navigation-templates",
      "navigation-administration-documents",
      "navigation-administration-mail",
    ]);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    // The term and the meeting places are sections of the Commune screen.
    await expect(
      page.getByTestId("settings-commune-screen").getByTestId("settings-expected-member-count"),
    ).toBeVisible();
    await expect(page.getByTestId("settings-commune-screen")).toContainText("Meeting places");
    await page.getByTestId("navigation-administration-mail").click();
    await expect(page.getByTestId("settings-mail-screen")).toBeVisible();

    // « Documents » shows the folders and the affaires; « Courriels » its two folders with their number.
    await page.getByTestId("navigation-workspace").click();
    await expect(sidebar.getByTestId("workspace-tree")).toBeVisible();
    await expect(
      sidebar
        .getByTestId("workspace-tree")
        .locator('[data-testid="workspace-sidebar-link"][data-kind="folder"]')
        .first(),
    ).toBeVisible();
    await page.getByTestId("navigation-mail").click();
    await expect(page.getByTestId("mail-folder-drafts")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mail-folder-drafts").locator(".nav-count")).toHaveText(/^\d+$/);
    await expect(sidebar.getByTestId("workspace-tree")).toHaveCount(0);

    // « Paramètres » keeps the preferences and the session, with the editor lab at its foot.
    await page.getByTestId("navigation-settings").click();
    await expect(page.getByTestId("settings-preferences-screen")).toBeVisible();
    await expect(page.getByTestId("navigation-editor-lab")).toHaveCount(0);
  });

  // @verifies-requirement HALL-FR-LAY-110
  // @verifies-requirement HALL-FR-LAY-160
  test("the menu folds into a rail by its own control, remembered, and the screen header has no fold control", async ({
    appPage: page,
  }) => {
    const sidebar = page.locator(".app-sidebar");
    const toggle = page.getByTestId("navigation-toggle");
    await expect(page.getByTestId("screen-header").getByTestId("navigation-toggle")).toHaveCount(0);
    await expect(sidebar.getByTestId("navigation-toggle")).toHaveAttribute("aria-expanded", "true");
    const brand = await sidebar.locator(".app-brand").boundingBox();
    const control = await toggle.boundingBox();
    expect(Math.abs(brand!.y + brand!.height / 2 - (control!.y + control!.height / 2))).toBeLessThanOrEqual(2);
    expect(control!.x).toBeGreaterThan(brand!.x);
    await toggle.click();
    await expect(sidebar).toHaveAttribute("data-compact", "true");
    await expect(page.locator(".nav-label")).toHaveCount(0);
    await expect(page.getByTestId("navigation-mail")).toHaveAttribute("aria-label", "Mail");
    await expect(sidebar.locator("[title]")).toHaveCount(0);
    // The label of a screen shows at once beside its icon, on a light surface like the menus of Hall.
    await page.getByTestId("navigation-contacts").hover();
    const label = page.locator('[data-slot="tooltip-content"]');
    await expect(label).toContainText("Contacts");
    const lightSurface = (element: Element) => {
      const [r, g, b] = getComputedStyle(element).backgroundColor.match(/\d+/g)!.map(Number);
      return (r + g + b) / 3 > 200;
    };
    expect(await label.evaluate(lightSurface)).toBe(true);
    // A click on an entry with places opens its panel, which stays open once the pointer leaves the icon.
    await page.getByTestId("navigation-council").click();
    const panel = page.getByTestId("navigation-rail-panel");
    await expect(panel.getByTestId("navigation-council-decisions")).toBeVisible();
    expect(await panel.evaluate(lightSurface)).toBe(true);
    await page.mouse.move(700, 700);
    await expect(panel).toBeVisible();
    await expect(page).not.toHaveURL(/\/app\/meetings$/);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("navigation-council")).toBeFocused();
    // Keyboard: Enter opens the panel on its first place, the arrows go through the others.
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("navigation-meetings")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByTestId("navigation-minutes")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByTestId("navigation-council-decisions")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/council-decisions$/);
    await expect(sidebar.locator(".nav-sub")).toHaveCount(0);
    const mark = await sidebar.locator(".app-brand-mark").boundingBox();
    const railControl = await toggle.boundingBox();
    expect(railControl!.y).toBeGreaterThanOrEqual(mark!.y + mark!.height - 1);
    await page.reload();
    await expect(sidebar).toHaveAttribute("data-compact", "true");
    await page.getByTestId("navigation-toggle").click();
    await expect(sidebar).not.toHaveAttribute("data-compact", "true");
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
    await expect(page.getByTestId("navigation-council")).toHaveText("Municipal council");
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
  await expect(page.getByTestId("home-meeting-open")).toHaveAttribute("href", `/app/meetings/${next}`);
  await page.getByTestId("navigation-council").click();
  await expect(page.getByTestId("meeting-next")).toHaveAttribute("href", `/app/meetings/${next}`);
  await expect(page.getByTestId("meeting-needs-review")).toHaveCount(4);
  for (const meeting of meetings.slice(1, 5)) {
    const row = page.getByTestId(`meeting-history-${meeting.properties.id}`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("href", `/app/meetings/${meeting.properties.id}`);
    const badge = row.getByTestId("meeting-needs-review");
    await expect(badge).toHaveText("À réviser");
    await expect(badge).toHaveAttribute("data-tone", "action");
  }
  await expect(page.getByTestId(`meeting-history-${meetings[0].properties.id}`)).toBeVisible();
  await expect(page.getByTestId("meeting-next").getByTestId("meeting-needs-review")).toHaveCount(0);
});

// @verifies-requirement HALL-FR-LAY-100
test("the screen header writes nothing of the connection until the server stops answering", async ({
  appPage: page,
  seededDatabase,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/");
  const connection = page.getByTestId("application-sync-status");
  await expect(connection).toHaveAttribute("data-sync-state", "synchronized");
  await expect(connection).toHaveText("");
  await expect(connection).toHaveAttribute("role", "status");
  await seededDatabase.stop();
  await page.getByTestId("phone-navigation-calendar").click();
  await expect(connection).toHaveAttribute("data-sync-state", "failed");
  await expect(connection).toHaveText("Server unreachable");
  await expect(connection).toBeVisible();
  const bounds = async (testId: string) => (await page.getByTestId(testId).boundingBox())!;
  const state = await bounds("application-sync-status");
  const initials = await bounds("screen-header-account");
  expect(state.x + state.width).toBeLessThanOrEqual(initials.x);
  expect(initials.x + initials.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// @verifies-requirement HALL-FR-LAY-100
// @verifies-requirement HALL-FR-LAY-130
test("on a computer a text and an affaire report open for writing, with the automatic saving on the title line", async ({
  appPage: page,
}) => {
  const text = await page.request.post("/api/resources", {
    data: { kind: "text", path: "seed", name: `Ordre ${crypto.randomUUID()}`, content: "Texte." },
  });
  expect(text.status()).toBe(201);
  const business = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Ordre ${crypto.randomUUID()}`, reportName: "Report", reportContent: "Rapport." },
  });
  expect(business.ok()).toBeTruthy();

  await page.goto(`/app/workspace?path=seed&resource=${(await text.json()).properties.id}`);
  // On a computer a text opens for writing: no « Modifier », the automatic saving and the changes on the title line.
  await expect(page.getByTestId("markdown-editor-compact")).toBeVisible();
  await expect(page.getByTestId("text-edit")).toHaveCount(0);
  await expect(page.getByTestId("screen-title-commands").getByTestId("resource-autosave-toggle")).toBeVisible();
  await expect(page.getByTestId("screen-title-commands").getByTestId("resource-changes-trigger")).toBeVisible();

  // The label of the tags field stays above the tags it holds.
  await page.getByTestId("tag-input-draft").fill("voirie");
  await page.getByTestId("tag-input-draft").press("Enter");
  const field = page.locator(".tag-input .hall-field");
  const label = await field.locator(".hall-field-label").boundingBox();
  const tag = await field.locator(".tag-input-row > .hall-button").first().boundingBox();
  expect(label!.y + label!.height).toBeLessThanOrEqual(tag!.y + 1);

  await page.goto(`/app/workspace?path=seed&councilBusiness=${(await business.json()).properties.id}`);
  await expect(page.getByTestId("business-report-editor")).toBeVisible();
  await expect(page.getByTestId("text-edit")).toHaveCount(0);
});
