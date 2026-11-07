import type { APIResponse, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

/* The municipality's data in Settings, and the indicative notice period it feeds on a scheduled meeting. */

async function properties<T>(response: APIResponse): Promise<T> {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties as T;
}

async function items<T>(response: APIResponse): Promise<T[]> {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return ((body.entities ?? []) as Array<{ properties: T }>).map((entity) => entity.properties);
}

const commune = {
  name: "Alésia",
  inseeCode: "21008",
  siren: "212100085",
  addressLine1: "1 place de l’Oppidum",
  addressLine2: "Mont-Auxois",
  postalCode: "21150",
  city: "Alise-Sainte-Reine",
  population: "4200",
  populationReferenceDate: "2026-01-01",
  phone: "03 80 96 00 00",
  website: "https://alesia.example",
  email: "mairie@alesia.example",
  timeZone: "Europe/Paris",
} as const;

async function settings(page: Page) {
  return properties<Record<string, unknown>>(await page.request.get("/api/settings"));
}

// @verifies-requirement HALL-FR-COM-010
test("an administrator records the municipality and finds it again; another account only reads it", async ({
  appPage: page,
}) => {
  const before = await settings(page);
  await page.goto("/app/settings");
  const section = page.getByTestId("settings-commune");
  await expect(section).toBeVisible();
  for (const [field, value] of Object.entries(commune))
    await section.getByTestId(`settings-commune-${field}`).fill(value);
  await section.getByTestId("settings-commune-save").click();
  await expect(section.getByTestId("settings-commune-saved")).toBeVisible();

  await page.reload();
  for (const [field, value] of Object.entries(commune))
    await expect(page.getByTestId(`settings-commune-${field}`)).toHaveValue(value);
  const after = await settings(page);
  expect(after).toMatchObject({ ...commune, population: 4200 });
  for (const kept of [
    "geographicPosition",
    "outboundEmailSenderName",
    "outboundEmailSenderAddress",
    "outboundEmailReplyToAddress",
    "meetingLocations",
  ])
    expect(after[kept], kept).toEqual(before[kept]);

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.actions = [];
    await route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.reload();
  await expect(page.getByTestId("settings-commune")).toBeVisible();
  await expect(page.getByTestId("settings-commune").locator("input")).toHaveCount(0);
  await expect(page.getByTestId("settings-commune-save")).toHaveCount(0);
  await expect(page.getByTestId("settings-commune-value-siren")).toHaveText(commune.siren);
  await expect(page.getByTestId("settings-commune-value-email")).toHaveText(commune.email);
});

// @verifies-requirement HALL-FR-NOT-130
test("a scheduled meeting shows the indicative notice period computed from the population", async ({
  appPage: page,
}) => {
  const current = await settings(page);
  const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((entry) => !entry.startedAt && !entry.closedAt)!;
  const members = (
    await items<{ id: string; role: string; active: boolean }>(await page.request.get("/api/council-members"))
  ).filter((member) => member.active);
  const scheduledAt = new Date(Date.now() + 20 * 86_400_000);
  scheduledAt.setHours(19, 0, 0, 0);
  await properties(
    await page.request.put(`/api/council-meetings/${meeting.id}/prepare`, {
      data: {
        scheduledAt: scheduledAt.toISOString(),
        location: (current.meetingLocations as string[])[0] ?? "Salle du conseil",
        chairMemberId: members.find((member) => member.role === "mayor")!.id,
        secretaryMemberId: members.find((member) => member.role === "deputyMayor")!.id,
      },
    }),
  );

  await properties(await page.request.put("/api/settings", { data: { ...current, population: null } }));
  await page.goto(`/app/meetings/${meeting.id}`);
  await expect(page.getByTestId("meeting-notice-deadline")).toHaveAttribute("data-status", "indeterminate");
  await expect(page.getByTestId("meeting-notice-deadline-settings")).toHaveAttribute("href", "/app/settings");

  await properties(await page.request.put("/api/settings", { data: { ...current, population: 4200 } }));
  const computed = (
    await properties<{
      noticeDeadline: { status: string; ordinaryReference: { deadlineDate: string; meetingDate: string } };
    }>(await page.request.get(`/api/council-meetings/${meeting.id}`))
  ).noticeDeadline;
  expect(computed).toMatchObject({ status: "qualificationRequired", ordinaryReference: { clearDays: 5 } });
  const meetingDay = new Date(`${computed.ordinaryReference.meetingDate}T12:00:00`);
  const deadlineDay = new Date(`${computed.ordinaryReference.deadlineDate}T12:00:00`);
  expect(Math.round((meetingDay.getTime() - deadlineDay.getTime()) / 86_400_000)).toBe(6);

  await page.reload();
  const panel = page.getByTestId("meeting-notice-deadline");
  await expect(panel).toHaveAttribute("data-status", "qualificationRequired");
  const text = page.getByTestId("meeting-notice-deadline-date");
  await expect(text).toContainText(deadlineDay.toLocaleDateString("en-GB"));
  await page.getByTestId("meeting-notice-deadline-help").hover();
  const explanation = page.getByRole("tooltip");
  await expect(explanation).toContainText("5 clear days");
  await expect(explanation).toContainText("This date is ahead.");
  await expect(explanation).toContainText("Hall checks neither the sending nor the applicable regime.");
  await expect(explanation).not.toContainText(/complian|respect|on time|late/i);
});
