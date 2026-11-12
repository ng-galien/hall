import { expect, runItemCommand, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-CAL-010
// @verifies-requirement HALL-FR-CAL-030
// @verifies-requirement HALL-FR-CAL-040
// @verifies-requirement HALL-FR-CAL-060
// @verifies-requirement HALL-FR-CAL-090
test("calendar creates a workspace appointment and opens council sessions", async ({ appPage: page }) => {
  const meetings = await (await page.request.get("/api/council-meetings")).json();
  const meeting = meetings.entities[0].properties;
  const schedule = await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
    data: { scheduledAt: new Date().toISOString(), location: "Council room" },
  });
  expect(schedule.ok()).toBeTruthy();
  await page.getByTestId("navigation-calendar").click();
  await expect(page.getByTestId("calendar-page")).toBeVisible();
  const councilMeeting = page.getByTestId(/^calendar-event-meeting-/).first();
  await expect(councilMeeting).toBeVisible();
  await expect(councilMeeting).toHaveCSS("cursor", "pointer");
  await page.getByTestId("calendar-new").click();
  const name = `Calendar acceptance ${Date.now()}`;
  await page.getByTestId("calendar-name").fill(name);
  await page.getByTestId("event-location").fill("Meeting room");
  const contacts = await (await page.request.get("/api/contacts")).json();
  const contact = contacts.entities[0].properties;
  await page.getByTestId("event-contact").click();
  await page.getByTestId("event-contact-search-input").fill(contact.lastName);
  await page
    .getByTestId("event-contact-search-result")
    .and(page.locator(`[data-reference-id="${contact.id}"]`))
    .click();
  await expect(page.getByTestId("event-participant-0")).toContainText(contact.lastName);
  await page.getByTestId("event-remove-participant-0").click();
  await expect(page.getByTestId("event-participant-0")).not.toBeVisible();
  await page.getByTestId("event-contact").click();
  await page.getByTestId("event-contact-search-input").fill(`${contact.firstName} ${contact.lastName}`);
  await page.getByTestId("event-contact-search-input").press("Enter");
  await expect(page.getByTestId("event-participant-0")).toContainText(contact.lastName);
  await page.getByTestId("event-guest").fill("Test participant");
  await page.getByTestId("event-add-guest").click();
  const createdResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/resources") && response.request().method() === "POST",
  );
  await page.getByTestId("calendar-create").click();
  const created = await (await createdResponse).json();
  const id = created.properties.id;
  await expect(page.getByTestId(`calendar-event-${id}`)).toBeVisible();
  await expect(page.getByTestId(`calendar-event-${id}`)).toHaveCSS("cursor", "pointer");
  const today = new Date();
  const offset = today.getDay() === 1 ? 1 : -1;
  const movedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const dateKey = `${movedDate.getFullYear()}-${String(movedDate.getMonth() + 1).padStart(2, "0")}-${String(movedDate.getDate()).padStart(2, "0")}`;
  await page.getByTestId(`calendar-event-${id}`).hover();
  const eventBox = await page.getByTestId(`calendar-event-${id}`).boundingBox();
  const targetBox = await page.getByTestId(`calendar-day-${dateKey}`).boundingBox();
  expect(eventBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(eventBox!.x + eventBox!.width / 2, eventBox!.y + eventBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 50, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(
      async () => (await (await page.request.get(`/api/resources/${id}`)).json()).properties.document.schedule.start,
    )
    .toBe(dateKey);
  // Extend the all-day bar by one day using its right-hand resize edge.
  const movedBox = await page.getByTestId(`calendar-event-${id}`).boundingBox();
  await page.mouse.move(movedBox!.x + movedBox!.width - 2, movedBox!.y + movedBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(movedBox!.x + movedBox!.width + targetBox!.width - 2, movedBox!.y + movedBox!.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  const resizedEnd = new Date(movedDate.getFullYear(), movedDate.getMonth(), movedDate.getDate() + 2);
  const endKey = `${resizedEnd.getFullYear()}-${String(resizedEnd.getMonth() + 1).padStart(2, "0")}-${String(resizedEnd.getDate()).padStart(2, "0")}`;
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${id}`)).json()).properties.document.schedule.end)
    .toBe(endKey);
  await page.getByTestId("calendar-view-timeGridWeek").click();
  await expect(page.getByTestId(`calendar-event-${id}`)).toBeVisible();
  await page.getByTestId("calendar-view-timeGridDay").click();
  await page.getByTestId(offset > 0 ? "calendar-next" : "calendar-previous").click();
  await expect(page.getByTestId(`calendar-event-${id}`)).toBeVisible();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("resource-preview")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/calendar$/);
  await expect(page.getByTestId("event-resource-editor")).toBeVisible();
  await page.getByTestId("event-location").fill("Updated meeting room");
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/resources/${id}`);
      return (await response.json()).properties.document.location;
    })
    .toBe("Updated meeting room");
  await page.getByTestId("resource-preview-close").click();
  await expect(page.getByTestId("resource-preview")).not.toBeVisible();
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-location")).toHaveValue("Updated meeting room");
  await page.getByTestId("resource-preview-close").click();
  await page
    .getByTestId(/^calendar-event-meeting-/)
    .first()
    .click();
  const meetingPreview = page.getByTestId("calendar-meeting-preview");
  await expect(meetingPreview).toBeVisible();
  await expect(meetingPreview.locator(".meeting-page-content")).toBeVisible();
  const previewWidth = (await meetingPreview.boundingBox())!.width;
  expect(previewWidth).toBeGreaterThan(800);
  expect(previewWidth).toBeLessThan(page.viewportSize()!.width * 0.9);
  await expect(page).toHaveURL(/\/app\/calendar$/);
  const previewClose = page.getByTestId("calendar-meeting-preview-close");
  const closePosition = await previewClose.boundingBox();
  await page.getByTestId("calendar-meeting-preview-content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(previewClose).toBeVisible();
  expect(Math.abs((await previewClose.boundingBox())!.y - closePosition!.y)).toBeLessThan(1);
  await previewClose.click();
  await expect(meetingPreview).not.toBeVisible();
  await expect(page.getByTestId("calendar-page")).toBeVisible();
  await page.request.delete(`/api/resources/${id}`);
});

// @verifies-requirement HALL-FR-CAL-060
// @verifies-requirement HALL-FR-CAL-120
// @verifies-requirement HALL-FR-CAL-200
test("calendar preserves timed appointments after creation and editing", async ({ appPage: page }) => {
  await page.getByTestId("navigation-calendar").click();
  await page.getByTestId("calendar-new").click();
  await page.getByTestId("calendar-name").fill(`Timed appointment ${Date.now()}`);
  await page.getByTestId("event-all-day").uncheck();
  const day = (await page.getByTestId("event-start").inputValue()).slice(0, 10);
  await page.getByTestId("event-start").fill(`${day}T19:30`);
  await expect(page.getByTestId("event-end")).toHaveValue(`${day}T20:30`);
  await expect(page.getByTestId("calendar-create")).toBeEnabled();
  await page.getByTestId("event-end").fill(`${day}T20:30`);
  await expect(page.getByTestId("calendar-create")).toBeEnabled();
  const response = page.waitForResponse((r) => r.url().endsWith("/api/resources") && r.request().method() === "POST");
  await page.getByTestId("calendar-create").click();
  const createdResponse = await response;
  expect(createdResponse.status(), await createdResponse.text()).toBe(201);
  const id = (await createdResponse.json()).properties.id;
  await expect(page.getByTestId(`calendar-event-${id}`)).toBeVisible();
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-start")).toHaveValue(`${day}T19:30`);
  await page.getByTestId("event-end").fill(`${day}T21:30`);
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${id}`)).json()).properties.document.schedule.end)
    .toBe(new Date(`${day}T21:30`).toISOString());
  await page.getByTestId("resource-preview-close").click();
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-end")).toHaveValue(`${day}T21:30`);
  await page.getByTestId("event-end").fill(`${day}T22:30`);
  await page.getByTestId("resource-preview-close").click();
  await expect(page.getByTestId("resource-preview")).not.toBeVisible();
  await expect(page).toHaveURL(/\/app\/calendar$/);
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-end")).toHaveValue(`${day}T22:30`);
  await page.getByTestId("resource-preview-close").click();
  await page.request.delete(`/api/resources/${id}`);
});

// @verifies-requirement HALL-FR-CAL-050
// @verifies-requirement HALL-FR-CAL-060
// @verifies-requirement HALL-FR-CAL-120
// @verifies-requirement HALL-FR-CAL-150
// @verifies-requirement HALL-FR-CAL-200
test("calendar completes every appointment field and changes schedule modes", async ({ appPage: page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  await page.getByTestId("navigation-calendar").click();
  await page.getByTestId("calendar-new").click();
  await expect(page.getByTestId("event-all-day")).toBeChecked();
  await expect(page.getByTestId("calendar-create")).toBeDisabled();
  const name = `Complete appointment ${Date.now()}`;
  await page.getByTestId("calendar-name").fill(name);
  await page.getByTestId("event-start").fill("2026-09-17");
  await page.getByTestId("event-end").fill("2026-09-18");
  await page.getByTestId("event-location").fill("Salle du conseil");
  const contact = (await (await page.request.get("/api/contacts")).json()).entities[0].properties;
  await page.getByTestId("event-contact").click();
  await page.getByTestId("event-contact-search-input").fill(contact.lastName);
  await page
    .getByTestId("event-contact-search-result")
    .and(page.locator(`[data-reference-id="${contact.id}"]`))
    .click();
  await page.getByTestId("event-guest").fill("Intervenant invité");
  await page.getByTestId("event-add-guest").click();
  await expect(page.getByTestId("event-participant-1")).toContainText("Intervenant invité");
  await page.getByTestId("editor-writing-area").fill("Contexte complet du rendez-vous.");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/resources") && r.request().method() === "POST");
  await page.getByTestId("calendar-create").click();
  const creation = await response;
  expect(creation.status(), await creation.text()).toBe(201);
  const id = (await creation.json()).properties.id;
  const read = async () => (await (await page.request.get(`/api/resources/${id}`)).json()).properties;
  const initial = await read();
  expect(initial).toMatchObject({
    name,
    path: "",
    document: {
      content: "Contexte complet du rendez-vous.",
      location: "Salle du conseil",
      schedule: { kind: "allDay", start: "2026-09-17", end: "2026-09-19" },
      participants: [
        { kind: "contact", contactId: contact.id },
        { kind: "guest", name: "Intervenant invité" },
      ],
    },
  });
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page).toHaveURL(/\/app\/calendar$/);
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-17");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-18");
  await expect(page.getByTestId("event-location")).toHaveValue("Salle du conseil");
  await expect(page.getByTestId("event-participant-0")).toContainText(contact.lastName);
  await expect(page.getByTestId("event-participant-1")).toContainText("Intervenant invité");
  await expect(page.getByTestId("editor-writing-area")).toContainText("Contexte complet du rendez-vous.");
  await page.getByTestId("event-all-day").uncheck();
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-17T09:00");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17T10:00");
  await page.getByTestId("event-start").fill("2026-09-17T19:30");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17T20:30");
  await page.getByTestId("event-end").fill("2026-09-17T20:30");
  await page.getByTestId("event-remove-participant-1").click();
  await page.getByTestId("event-remove-participant-0").click();
  await page.getByTestId("event-guest").fill("Autre invité");
  await page.getByTestId("event-add-guest").click();
  await page.getByTestId("event-location").fill("Salle annexe");
  await page.getByTestId("editor-writing-area").fill("Contexte modifié.");
  await page.getByTestId("resource-preview-close").click();
  await expect(page.getByTestId("resource-preview")).not.toBeVisible();
  const updated = await read();
  expect(updated.document).toMatchObject({
    content: "Contexte modifié.",
    location: "Salle annexe",
    schedule: { kind: "timed" },
    participants: [{ kind: "guest", name: "Autre invité" }],
  });
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-17T19:30");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17T20:30");
  await runItemCommand(page, "resource-autosave-toggle");
  await expect(page.getByTestId("resource-autosave-toggle")).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("event-location").fill("Sauvegarde manuelle");
  const representation = await (await page.request.get(`/api/resources/${id}`)).json();
  const updateAction = representation.actions.find(
    (action: { name: string }) => action.name === "resource.update-content",
  );
  expect(updateAction).toBeTruthy();
  const updateUrl = `**${new URL(updateAction.href, page.url()).pathname}`;
  await page.route(updateUrl, (route) => route.abort("failed"));
  await page.getByTestId("event-retry-save").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("event-location")).toHaveValue("Sauvegarde manuelle");
  expect((await read()).document.location).toBe("Salle annexe");
  await page.unroute(updateUrl);
  await page.getByTestId("event-retry-save").click();
  await expect.poll(async () => (await read()).document.location).toBe("Sauvegarde manuelle");
  await runItemCommand(page, "resource-autosave-toggle");
  await expect(page.getByTestId("resource-autosave-toggle")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("event-all-day").check();
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-17");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17");
  await page.getByTestId("resource-preview-close").click();
  await expect
    .poll(async () => (await read()).document.schedule)
    .toEqual({ kind: "allDay", start: "2026-09-17", end: "2026-09-18" });
  await page.request.delete(`/api/resources/${id}`);
});

// @verifies-requirement HALL-FR-CAL-070
test("calendar cancels appointment creation without saving", async ({ appPage: page }) => {
  await page.getByTestId("navigation-calendar").click();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/resources")) posts.push(request.url());
  });
  for (const close of ["calendar-cancel", "dialog-close", "escape"]) {
    await page.getByTestId("calendar-new").click();
    await page.getByTestId("calendar-name").fill("Cancelled appointment");
    await page.getByTestId("event-all-day").uncheck();
    if (close === "escape") await page.getByTestId("calendar-name").press("Escape");
    else await page.getByTestId(close).click();
    await expect(page.getByTestId("calendar-name")).not.toBeVisible();
    await expect(page).toHaveURL(/\/app\/calendar$/);
  }
  expect(posts).toEqual([]);
});

// @verifies-requirement HALL-FR-CAL-140
test("calendar recalculates invalid timed ends up to local midnight", async ({ appPage: page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  await page.getByTestId("navigation-calendar").click();
  for (const [start, end] of [
    ["2026-09-17T22:30", "2026-09-17T23:30"],
    ["2026-09-17T23:00", "2026-09-18T00:00"],
    ["2026-09-17T23:30", "2026-09-18T00:00"],
  ]) {
    await page.getByTestId("calendar-new").click();
    await page.getByTestId("calendar-name").fill(`Late appointment ${start}`);
    await page.getByTestId("event-all-day").uncheck();
    await page.getByTestId("event-start").fill(start);
    await expect(page.getByTestId("event-end")).toHaveValue(end);
    await expect(page.getByTestId("calendar-create")).toBeEnabled();
    const response = page.waitForResponse((r) => r.url().endsWith("/api/resources") && r.request().method() === "POST");
    await page.getByTestId("calendar-create").click();
    const creation = await response;
    expect(creation.status(), await creation.text()).toBe(201);
    const id = (await creation.json()).properties.id;
    await page.reload();
    await page.getByTestId(`calendar-event-${id}`).click();
    await expect(page.getByTestId("event-start")).toHaveValue(start);
    await expect(page.getByTestId("event-end")).toHaveValue(end);
    await page.getByTestId("event-start").fill("2026-09-17T19:00");
    await expect(page.getByTestId("event-end")).toHaveValue(end);
    await page.getByTestId("event-end").fill("2026-09-17T20:00");
    await page.getByTestId("event-start").fill(start);
    await expect(page.getByTestId("event-end")).toHaveValue(end);
    await page.getByTestId("resource-preview-close").click();
    await expect(page.getByTestId("resource-preview")).not.toBeVisible();
    await expect(page).toHaveURL(/\/app\/calendar$/);
    await page.reload();
    await page.getByTestId(`calendar-event-${id}`).click();
    await expect(page.getByTestId("event-start")).toHaveValue(start);
    await expect(page.getByTestId("event-end")).toHaveValue(end);
    await page.getByTestId("resource-preview-close").click();
    await page.request.delete(`/api/resources/${id}`);
  }
});

// @verifies-requirement HALL-FR-CAL-050
// @verifies-requirement HALL-FR-CAL-090
// @verifies-requirement HALL-FR-CAL-120
test("calendar selects ranges and moves and resizes timed appointments", async ({ appPage: page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  await page.getByTestId("navigation-calendar").click();
  // Days become selectable once the creation affordance is loaded.
  await expect(page.getByTestId("calendar-new")).toBeVisible();
  const emptyDay = page
    .locator('[data-testid^="calendar-day-2026-09-"]')
    .filter({ hasNot: page.locator(".fc-event") })
    .first();
  const date = (await emptyDay.getAttribute("data-testid"))?.slice("calendar-day-".length);
  expect(date).toBeTruthy();
  await emptyDay.click();
  await expect(page.getByTestId("event-all-day")).toBeChecked();
  await expect(page.getByTestId("event-start")).toHaveValue(date!);
  await page.getByTestId("calendar-cancel").click();
  await page.getByTestId("calendar-view-timeGridDay").click();
  const slot = page.getByTestId("calendar-slot-10:00:00");
  const nextSlot = page.getByTestId("calendar-slot-10:30:00");
  await slot.scrollIntoViewIfNeeded();
  const startBox = await slot.boundingBox();
  const endBox = await nextSlot.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("event-all-day")).not.toBeChecked();
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-12T10:00");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-12T11:00");
  await page.getByTestId("calendar-name").fill(`Selected time range ${Date.now()}`);
  const response = page.waitForResponse((r) => r.url().endsWith("/api/resources") && r.request().method() === "POST");
  await page.getByTestId("calendar-create").click();
  const creation = await response;
  expect(creation.status(), await creation.text()).toBe(201);
  const id = (await creation.json()).properties.id;
  const readSchedule = async () =>
    (await (await page.request.get(`/api/resources/${id}`)).json()).properties.document.schedule;
  const event = page.getByTestId(`calendar-event-${id}`);
  const halfHour = endBox!.y - startBox!.y;
  // The new event becomes draggable once its update action is loaded: the move is repeated until it is saved.
  await expect(async () => {
    await page.getByTestId("calendar-slot-12:30:00").scrollIntoViewIfNeeded();
    await expect(event).toBeInViewport();
    const originalBox = (await event.boundingBox())!;
    await page.mouse.move(originalBox.x + originalBox.width / 2, originalBox.y + originalBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      originalBox.x + originalBox.width / 2,
      originalBox.y + originalBox.height / 2 + halfHour * 2,
      { steps: 15 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => new Date((await readSchedule()).start).toISOString(), { timeout: 3_000 })
      .toBe(new Date("2026-09-12T11:00").toISOString());
  }).toPass({ timeout: 20_000 });
  await page.getByTestId("calendar-slot-12:30:00").scrollIntoViewIfNeeded();
  const moved = await event.boundingBox();
  await page.mouse.move(moved!.x + moved!.width / 2, moved!.y + moved!.height - 2);
  await page.mouse.down();
  await page.mouse.move(moved!.x + moved!.width / 2, moved!.y + moved!.height - 2 + halfHour, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(async () => new Date((await readSchedule()).end).toISOString())
    .toBe(new Date("2026-09-12T12:30").toISOString());
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-12T11:00");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-12T12:30");
  await page.getByTestId("resource-preview-close").click();
  await expect(page).toHaveURL(/\/app\/calendar$/);
  await page.request.delete(`/api/resources/${id}`);
});

// @verifies-requirement HALL-FR-CAL-140
test("calendar adjusts the end after native segmented hour editing", async ({ appPage: page }) => {
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  await page.getByTestId("navigation-calendar").click();
  await page.getByTestId("calendar-new").click();
  await page.getByTestId("calendar-name").fill(`Native hour entry ${Date.now()}`);
  await page.getByTestId("event-start").fill("2026-09-17");
  await page.getByTestId("event-all-day").uncheck();
  const start = page.getByTestId("event-start");
  await start.click({ position: { x: 12, y: 16 } });
  await start.press("ArrowRight");
  await start.press("ArrowRight");
  await start.press("ArrowRight");
  await start.press("ArrowUp");
  await start.press("ArrowUp");
  await start.press("ArrowUp");
  await page.getByTestId("event-location").click();
  await expect(start).toHaveValue("2026-09-17T12:00");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17T13:00");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/resources") && r.request().method() === "POST");
  await page.getByTestId("calendar-create").click();
  const creation = await response;
  expect(creation.status(), await creation.text()).toBe(201);
  const id = (await creation.json()).properties.id;
  await page.reload();
  await page.getByTestId(`calendar-event-${id}`).click();
  await expect(page.getByTestId("event-start")).toHaveValue("2026-09-17T12:00");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17T13:00");
  await page.getByTestId("resource-preview-close").click();
  await page.request.delete(`/api/resources/${id}`);
});

// @verifies-requirement HALL-FR-CAL-020
// @verifies-requirement HALL-FR-CAL-030
// @verifies-requirement HALL-FR-CAL-040
test("calendar presents overlapping appointments and council meetings distinctly", async ({ appPage: page }) => {
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  const meetings = await (await page.request.get("/api/council-meetings")).json();
  const meeting = meetings.entities[0].properties;
  expect(
    (
      await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
        data: { scheduledAt: "2026-09-12T15:00:00.000Z", location: "Council room" },
      })
    ).ok(),
  ).toBeTruthy();
  const create = async (name: string) => {
    const response = await page.request.post("/api/resources", {
      data: {
        kind: "event",
        path: "",
        name,
        document: {
          content: "",
          location: "Salle du conseil",
          schedule: { kind: "timed", start: "2026-09-12T08:00:00.000Z", end: "2026-09-12T09:00:00.000Z" },
          participants: [],
        },
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).properties.id as string;
  };
  const firstId = await create(`Overlap A ${Date.now()}`);
  const secondId = await create(`Overlap B ${Date.now()}`);
  await page.getByTestId("navigation-calendar").click();
  await page.getByTestId("calendar-view-timeGridDay").click();
  const firstBox = await page.getByTestId(`calendar-event-${firstId}`).boundingBox();
  const secondBox = await page.getByTestId(`calendar-event-${secondId}`).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(firstBox!.x).not.toBe(secondBox!.x);

  const meetingEvent = page.getByTestId(`calendar-event-meeting-${meeting.id}`);
  await expect(meetingEvent).toBeVisible();
  const label = await meetingEvent.textContent();
  expect(label).toContain("Council meeting");
  expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  await meetingEvent.click({ button: "right" });
  await expect(page.getByTestId("calendar-event-open")).toBeVisible();
  await expect(page.getByTestId("calendar-event-delete")).not.toBeVisible();
  await page.getByTestId("calendar-event-open").click();
  await expect(page.getByTestId("calendar-meeting-preview")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/calendar$/);
  await page.request.delete(`/api/resources/${firstId}`);
  await page.request.delete(`/api/resources/${secondId}`);
});

// @verifies-requirement HALL-FR-CAL-080
test("calendar deletes a future appointment after two confirmations with one request", async ({ appPage: page }) => {
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  const response = await page.request.post("/api/resources", {
    data: {
      kind: "event",
      path: "",
      name: `Delete appointment ${Date.now()}`,
      document: {
        content: "",
        location: "",
        schedule: { kind: "allDay", start: "2026-09-20", end: "2026-09-21" },
        participants: [],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const createdRepresentation = await response.json();
  const id = createdRepresentation.properties.id as string;
  const deleteHref = createdRepresentation.actions.find(
    (action: { name: string; href: string }) => action.name === "resource.delete",
  )?.href as string;
  expect(deleteHref).toBeTruthy();
  await page.getByTestId("navigation-calendar").click();
  await page.getByTestId(`calendar-event-${id}`).click({ button: "right" });
  await page.getByTestId("calendar-event-delete").click();
  let deletes = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === deleteHref) deletes += 1;
  });
  await page.getByTestId("calendar-delete-confirm").click();
  await expect(page.getByText("Permanently confirm deletion of this appointment?")).toBeVisible();
  const deleted = page.waitForResponse(
    (candidate) => candidate.request().method() === "DELETE" && new URL(candidate.url()).pathname === deleteHref,
  );
  await page.getByTestId("calendar-delete-confirm").dblclick();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByTestId(`calendar-event-${id}`)).not.toBeVisible();
  expect(deletes).toBe(1);
});

// @verifies-requirement HALL-FR-CAL-100
// @verifies-requirement HALL-FR-CAL-110
// @verifies-requirement HALL-FR-CAL-130
// @verifies-requirement HALL-FR-CAL-160
// @verifies-requirement HALL-FR-CAL-170
// @verifies-requirement HALL-FR-CAL-180
// @verifies-requirement HALL-FR-CAL-190
// @verifies-requirement HALL-FR-SRC-030
test("calendar uses one complete form for business, quarter hours and participant groups", async ({
  appPage: page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-12T12:00:00Z"));
  const businessCollection = await (await page.request.get("/api/council-business/workspace-items")).json();
  const business = businessCollection.entities[0].properties;
  const otherBusiness = businessCollection.entities[1].properties;
  const missingContactResponse = await page.request.post("/api/contacts", {
    data: { firstName: "Sans", lastName: `Courriel-${Date.now()}`, email: null },
  });
  expect(missingContactResponse.status(), await missingContactResponse.text()).toBe(201);
  const missingContact = (await missingContactResponse.json()).properties;
  const membersCollection = await (await page.request.get("/api/council-members")).json();
  const activeMembers = membersCollection.entities
    .map((entry: { properties: { active: boolean } }) => entry.properties)
    .filter((member: { active: boolean }) => member.active);

  await page.reload();
  await page.getByTestId("navigation-calendar").click();
  await page.getByTestId("calendar-new").click();
  await expect(page.getByTestId("calendar-folder")).not.toBeVisible();
  await page.getByTestId("calendar-name").fill(`Complete linked appointment ${Date.now()}`);
  await page.getByTestId("event-council-business").click();
  await page
    .getByTestId("event-council-business-search-result")
    .and(page.locator(`[data-reference-id="${business.id}"]`))
    .click();
  await page.getByTestId("event-all-day").uncheck();
  await expect(page.getByTestId("event-start")).toHaveAttribute("step", "900");
  await page.getByTestId("event-start").fill("2026-09-17T10:10");
  await expect(page.getByTestId("calendar-create")).toBeDisabled();
  await page.getByTestId("event-start").fill("2026-09-17T10:15");
  await expect(page.getByTestId("event-end")).toHaveValue("2026-09-17T11:15");
  await page.getByTestId("event-contact").click();
  await page.getByTestId("event-contact-search-input").fill(missingContact.lastName);
  await page
    .getByTestId("event-contact-search-result")
    .and(page.locator(`[data-reference-id="${missingContact.id}"]`))
    .click();
  await expect(page.getByTestId("event-missing-email-warning")).toContainText(missingContact.lastName);
  await page.getByTestId("event-add-council-members").click();
  await expect(page.getByTestId(/^event-participant-/)).toHaveCount(activeMembers.length + 1);
  const creationResponse = page.waitForResponse(
    (candidate) => candidate.url().endsWith("/api/resources") && candidate.request().method() === "POST",
  );
  await page.getByTestId("calendar-create").click();
  const creation = await creationResponse;
  expect(creation.status(), await creation.text()).toBe(201);
  const created = (await creation.json()).properties;
  expect(created.path).toBe(business.folderPath);
  await page.getByTestId(`calendar-event-${created.id}`).click();
  await expect(page.getByTestId("event-council-business")).toContainText(business.title);
  await expect(page.getByTestId("event-start")).toHaveAttribute("step", "900");
  await expect(page.getByTestId("event-add-council-members")).toBeVisible();
  await expect(page.getByTestId("event-missing-email-warning")).toContainText(missingContact.lastName);
  const eventUrl = page.url();
  for (const testId of ["event-invitation-request", "event-invitation-cancel"] as const) {
    await page.getByTestId(testId).click();
    await expect(page.getByTestId("mail-composer")).toBeVisible();
    await expect(
      page.locator('[data-testid^="mail-attachment-"]').filter({ hasText: "invitation.ics" }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("mail-to")).toContainText(missingContact.lastName);
    await page.goto(eventUrl);
    await page.getByTestId(`calendar-event-${created.id}`).click();
    await expect(page.getByTestId("event-council-business")).toBeVisible();
  }
  const associatedResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(`/api/council-business/${otherBusiness.id}/resources`) &&
      candidate.request().method() === "POST",
  );
  const dissociatedResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(`/api/council-business/${business.id}/resources/dissociate`) &&
      candidate.request().method() === "POST",
  );
  await page.getByTestId("event-council-business").click();
  await page
    .getByTestId("event-council-business-search-result")
    .and(page.locator(`[data-reference-id="${otherBusiness.id}"]`))
    .click();
  await expect(page.getByTestId("event-council-business")).toContainText(otherBusiness.title);
  for (const response of await Promise.all([associatedResponse, dissociatedResponse])) {
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await runItemCommand(page, "workspace-workbench-rename");
  await page.getByTestId("workspace-workbench-title-input").fill("Rendez-vous renommé");
  await page.getByTestId("workspace-workbench-title-input").press("Enter");
  await expect(page.getByTestId("workspace-workbench-title")).toContainText("Rendez-vous renommé");
  await page.getByTestId("resource-preview-close").click();
  await page.reload();
  await page.getByTestId(`calendar-event-${created.id}`).click();
  await expect(page.getByTestId("event-council-business")).toContainText(otherBusiness.title);
  await page.getByTestId("resource-preview-close").click();
  await page.request.delete(`/api/resources/${created.id}`);
});
