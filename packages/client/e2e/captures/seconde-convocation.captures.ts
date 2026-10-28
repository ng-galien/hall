import type { APIResponse, Page } from "@playwright/test";
import { capture, expect, localDateTimeInput, signIn, test, useAccount } from "./fixtures";

test.setTimeout(4 * 60_000);
test.use({ seedScenario: "preparation" });

interface Entity<T> {
  properties: T;
}

async function properties<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), response.url()).toBeTruthy();
  return ((await response.json()) as Entity<T>).properties;
}

async function items<T>(response: APIResponse): Promise<T[]> {
  expect(response.ok(), response.url()).toBeTruthy();
  return (((await response.json()) as { entities?: Entity<T>[] }).entities ?? []).map((entity) => entity.properties);
}

interface Meeting {
  id: string;
  startedAt: string | null;
  closedAt: string | null;
  previousCouncilMeetingId: string | null;
  scheduledAt: string | null;
  location: string | null;
  minutesId: string | null;
  chairMemberId: string | null;
  secretaryMemberId: string | null;
}

async function prepare(page: Page, meetingId: string, input: Record<string, string>) {
  await properties(await page.request.put(`/api/council-meetings/${meetingId}/prepare`, { data: input }));
  await properties(await page.request.post(`/api/council-meetings/${meetingId}/agenda-freeze`, { data: {} }));
  await properties(await page.request.post(`/api/council-meetings/${meetingId}/notices`, { data: {} }));
}

async function rollCall(page: Page, members: string[], present: Set<string>) {
  for (const memberId of members) {
    await page.getByTestId(`live-attendance-${memberId}-${present.has(memberId) ? "present" : "absent"}`).click();
  }
}

test("séance sans quorum, seconde convocation et séance reconvoquée", async ({ docsPage: page }) => {
  const journey = "seconde-convocation";
  const members = (await items<{ id: string; active: boolean }>(await page.request.get("/api/council-members")))
    .filter((member) => member.active)
    .map((member) => member.id);
  const first = (await items<Meeting>(await page.request.get("/api/council-meetings"))).find(
    (meeting) => !meeting.startedAt && !meeting.closedAt,
  )!;

  // The new meeting is held at least four days after the second convocation is sent: the first
  // meeting is dated eight days earlier.
  const firstDate = new Date(Date.now() - 8 * 86_400_000);
  firstDate.setHours(18, 30, 0, 0);
  const location = "Maison commune de l’oppidum";
  const [chair, firstSecretary, reconvenedSecretary] = members;
  await prepare(page, first.id, {
    scheduledAt: firstDate.toISOString(),
    location,
    chairMemberId: chair!,
    secretaryMemberId: firstSecretary!,
  });
  const present = new Set([chair!, firstSecretary!, reconvenedSecretary!, members[3]!]);

  // The roll call and the conduct are done by the account with the meeting conduct role.
  await signIn(page, "conduite", `/app/meetings/${first.id}/live`);
  await rollCall(page, members, present);
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await capture(page, `${journey}/01-appel-sans-quorum`);

  // The roll call is recorded at the date of the first meeting through the opening route of the roll-call screen.
  await properties(
    await page.request.post(`/api/council-meetings/${first.id}/record-opening`, {
      data: {
        attendance: members.map((memberId) => ({
          councilMemberId: memberId,
          status: present.has(memberId) ? "present" : "absent",
        })),
        observedAt: new Date(firstDate.getTime() + 5 * 60_000).toISOString(),
        chairMemberId: chair,
        secretaryMemberId: firstSecretary,
      },
    }),
  );
  await page.reload();
  await expect(page.getByText(/Quorum non atteint/).first()).toBeVisible();
  await capture(page, `${journey}/02-quorum-non-atteint`);
  await page.waitForTimeout(500);
  await capture(page, `${journey}/03-point-bloque`);

  const sentAt = new Date(firstDate.getTime() + 60 * 60_000);
  const renewedAt = new Date(sentAt.getTime() + 5 * 86_400_000);
  renewedAt.setHours(18, 30, 0, 0);
  await page.getByTestId("live-reconvocation-open").click();
  await expect(page.getByTestId("live-reconvocation-form")).toBeVisible();
  await page.getByTestId("live-reconvocation-sent-at").fill(localDateTimeInput(sentAt));
  await page.getByTestId("live-reconvocation-scheduled-at").fill(localDateTimeInput(renewedAt));
  await page.getByTestId("live-reconvocation-first-evidence").fill("Convocation affichée en mairie");
  await page.getByTestId("live-reconvocation-renewed-evidence").fill("Seconde convocation remise aux conseillers");
  await capture(page, `${journey}/04-seconde-convocation`);
  await page.getByTestId("live-reconvocation-submit").click();
  await expect(page.getByTestId("live-reconvocation-open")).toHaveCount(0);

  await page.getByTestId("live-meeting-close").click();
  await expect(page.getByTestId("live-meeting-close")).toContainText(/Confirmer|non examiné/);
  await capture(page, `${journey}/05-clore-la-premiere-seance`);
  // The closure is recorded on the evening of the first meeting through the closure route of this button.
  await properties(
    await page.request.post(`/api/council-meetings/${first.id}/close`, {
      data: { closedAt: new Date(firstDate.getTime() + 75 * 60_000).toISOString() },
    }),
  );

  const meetings = await items<Meeting>(await page.request.get("/api/council-meetings"));
  const reconvened = meetings.find((meeting) => meeting.previousCouncilMeetingId === first.id)!;
  const closedFirst = meetings.find((meeting) => meeting.id === first.id)!;
  await signIn(page, "secretariat", `/app/meetings/${reconvened.id}`);
  await expect(page.getByTestId("meeting-reconvened-chip")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/06-seance-reconvoquee`);

  await prepare(page, reconvened.id, {
    scheduledAt: reconvened.scheduledAt!,
    location: reconvened.location!,
    chairMemberId: chair!,
    secretaryMemberId: reconvenedSecretary!,
  });
  // The roll call of the reconvened meeting is recorded at its convened date through the same opening route.
  await useAccount(page, "conduite");
  const reconvenedDate = new Date(reconvened.scheduledAt!);
  const at = (minutes: number) => new Date(reconvenedDate.getTime() + minutes * 60_000).toISOString();
  await properties(
    await page.request.post(`/api/council-meetings/${reconvened.id}/record-opening`, {
      data: {
        attendance: members.map((memberId) => ({
          councilMemberId: memberId,
          status: present.has(memberId) ? "present" : "absent",
        })),
        observedAt: at(5),
        chairMemberId: chair,
        secretaryMemberId: reconvenedSecretary,
      },
    }),
  );
  await page.goto(`/app/meetings/${reconvened.id}/live`);
  await expect(page.getByTestId("live-quorum-observation")).toContainText(/Seconde convocation/);
  await page.waitForTimeout(500);
  await capture(page, `${journey}/07-ouverture-en-seconde-convocation`);

  await signIn(page, "secretariat", `/app/minutes/${closedFirst.minutesId}`);
  await expect(page.getByTestId("minutes-second-convocation")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/08-proces-verbal-premiere-seance`);

  // The carried affair is discussed then adjourned, and the meeting closes on the same evening.
  await useAccount(page, "conduite");
  const carried = (
    await items<{ id: string; position: number }>(
      await page.request.get(`/api/council-meetings/${reconvened.id}/agenda-items`),
    )
  ).find((item) => item.position === 2)!;
  await properties(
    await page.request.post(`/api/council-meetings/${reconvened.id}/agenda-items/${carried.id}/start`, {
      data: { startedAt: at(10) },
    }),
  );
  await properties(
    await page.request.post(`/api/council-meetings/${reconvened.id}/agenda-items/${carried.id}/adjourn`, {
      data: { adjournedAt: at(55) },
    }),
  );
  await properties(
    await page.request.post(`/api/council-meetings/${reconvened.id}/close`, { data: { closedAt: at(70) } }),
  );
  const reconvenedMinutes = (await items<Meeting>(await page.request.get("/api/council-meetings"))).find(
    (meeting) => meeting.id === reconvened.id,
  )!.minutesId;
  await signIn(page, "secretariat", `/app/minutes/${reconvenedMinutes}`);
  await expect(page.getByTestId("minutes-reconvened-from")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/09-proces-verbal-seance-reconvoquee`);
});
