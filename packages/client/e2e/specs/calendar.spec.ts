import { expect, test } from "../fixtures/application";

test("calendar creates a workspace appointment and opens council sessions", async ({ appPage: page }) => {
  const meetings = await (await page.request.get("/api/council-meetings")).json();
  const meeting = meetings.entities[0].properties;
  const schedule = await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
    data: { scheduledAt: new Date().toISOString(), location: "Council room" },
  });
  expect(schedule.ok()).toBeTruthy();
  await page.getByTestId("navigation-calendar").click();
  await expect(page.getByTestId("calendar-page")).toBeVisible();
  await expect(page.getByTestId(/^calendar-event-meeting-/).first()).toBeVisible();
  await page.getByTestId("calendar-new").click();
  const name = `Calendar acceptance ${Date.now()}`;
  await page.getByTestId("calendar-name").fill(name);
  await page.getByTestId("calendar-folder").fill("seed");
  await page.getByTestId("event-location").fill("Meeting room");
  const contacts = await (await page.request.get("/api/contacts")).json();
  const contact = contacts.entities[0].properties;
  await page.getByTestId("event-contact").fill(contact.lastName);
  await page.getByTestId(`event-contact-option-${contact.id}`).click();
  await expect(page.getByTestId("event-participant-0")).toContainText(contact.lastName);
  await page.getByTestId("event-remove-participant-0").click();
  await expect(page.getByTestId("event-participant-0")).not.toBeVisible();
  await page.getByTestId("event-contact").fill(`${contact.firstName} ${contact.lastName}`);
  await page.getByTestId("event-contact").press("Enter");
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
  await expect(page).toHaveURL(/\/app\/meetings\//);
  await page.request.delete(`/api/resources/${id}`);
});
