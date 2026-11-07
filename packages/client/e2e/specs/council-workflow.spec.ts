import { writeFile } from "node:fs/promises";
import type { APIResponse, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";
import { backdateMeetingConduct } from "../fixtures/meetingHistory";

interface SirenItem<T> {
  properties: T;
}

interface SirenCollection<T> {
  entities: Array<SirenItem<T>>;
}

async function sirenProperties<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as SirenItem<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties;
}

async function sirenItems<T>(response: APIResponse): Promise<T[]> {
  const body = (await response.json()) as SirenCollection<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.entities.map((entity) => entity.properties);
}

async function scheduleVotingItem(page: Page, meetingReference: string, councilBusinessId: string, position: number) {
  return sirenProperties<{ id: string }>(
    await page.request.post(`/api/council-meetings/${meetingReference}/agenda-items`, {
      data: { kind: "councilDecisionProposal", councilBusinessId, position },
    }),
  );
}

async function adjournThroughConfirmation(page: Page, itemId: string) {
  const writes: string[] = [];
  const recordWrite = (request: import("@playwright/test").Request) => {
    if (request.method() === "POST" && request.url().endsWith(`/agenda-items/${itemId}/adjourn`))
      writes.push(request.url());
  };
  page.on("request", recordWrite);
  await page.getByTestId("live-agenda-adjourn").click();
  await expect(page.getByTestId("live-adjourn-dialog")).toBeVisible();
  await page.getByTestId("live-adjourn-cancel").click();
  await expect(page.getByTestId("live-adjourn-dialog")).toBeHidden();
  expect(writes).toHaveLength(0);
  await page.getByTestId("live-agenda-adjourn").click();
  await page.screenshot({ path: test.info().outputPath("adjourn-confirmation.png"), animations: "disabled" });
  const response = page.waitForResponse(
    (entry) => entry.request().method() === "POST" && entry.url().endsWith(`/agenda-items/${itemId}/adjourn`),
  );
  await page.getByTestId("live-adjourn-confirm").click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId("live-adjourn-dialog")).toBeHidden();
  expect(writes).toHaveLength(1);
  page.off("request", recordWrite);
}

async function verifyPersistentCommandBar(page: Page) {
  const scroll = page.getByTestId("live-item-scroll");
  const bar = page.getByTestId("live-item-actions");
  const header = page.getByTestId("live-item-header");
  await expect.poll(() => scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  const top = await bar.boundingBox();
  const headerBefore = await header.boundingBox();
  await expect(bar).toBeInViewport();
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const bottom = await bar.boundingBox();
  const content = await scroll.boundingBox();
  const headerAfter = await header.boundingBox();
  expect(top).not.toBeNull();
  expect(bottom).not.toBeNull();
  expect(content).not.toBeNull();
  expect(headerBefore).not.toBeNull();
  expect(headerAfter).not.toBeNull();
  expect(headerAfter!.y).toBeCloseTo(headerBefore!.y, 0);
  expect(headerAfter!.height).toBeCloseTo(headerBefore!.height, 0);
  expect(headerAfter!.y + headerAfter!.height).toBeLessThanOrEqual(content!.y + 1);
  expect(content!.height).toBeGreaterThan(0);
  expect(bottom!.y).toBeCloseTo(top!.y, 0);
  expect(content!.y + content!.height).toBeLessThanOrEqual(bottom!.y + 1);
  await expect(bar).toBeInViewport();
  await expect(header).toBeInViewport();
  await expect(page.getByTestId("live-item-title")).toBeInViewport();
  await expect(page.getByTestId("live-item-progress")).toBeInViewport();
  const title = await page.getByTestId("live-item-title").boundingBox();
  const timer = await page.getByTestId("live-item-timer").boundingBox();
  expect(timer).not.toBeNull();
  expect(timer!.x).toBeGreaterThanOrEqual(title!.x + title!.width);
  expect(timer!.y).toBeLessThan(title!.y + title!.height);
  await expect(page.getByTestId("live-item-continuation").locator("button")).toHaveCount(1);
  const actionStyle = (element: HTMLElement | SVGElement) => {
    const style = getComputedStyle(element);
    return [style.padding, style.borderRadius, style.fontSize];
  };
  await header.hover();
  await expect(page.getByTestId("live-agenda-adjourn-warning")).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.stringify(await page.getByTestId("live-agenda-adjourn").evaluate(actionStyle)) ===
        JSON.stringify(await page.getByTestId("live-item-continuation").locator("button").evaluate(actionStyle)),
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath("persistent-command-bar.png"), animations: "disabled" });
}

async function inspectRecusalInformation(page: Page) {
  const trigger = page.getByTestId("live-recusal-info");
  const content = page.getByTestId("live-recusal-info-content");
  const explanation =
    "These recusals are distinct from abstentions and non-participation. Their impact on declarations is not a complete legal quorum finding.";
  await expect(page.getByTestId("live-item-header")).not.toContainText(explanation);
  await trigger.focus();
  await trigger.press("Enter");
  await expect(content).toBeVisible();
  await expect(content).toContainText(explanation);
  await page.screenshot({ path: test.info().outputPath("recusal-information-popover.png"), animations: "disabled" });
  await content.press("Escape");
  await expect(content).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(content).toBeVisible();
  await trigger.click();
  await expect(content).toBeHidden();
}

async function inspectInitialRollCall(page: Page, meetingId: string) {
  const state = await sirenProperties<{ currentAttendance: unknown[]; quorumObservations: unknown[] }>(
    await page.request.get(`/api/council-meetings/${meetingId}/conduct`),
  );
  expect(state.currentAttendance).toHaveLength(0);
  expect(state.quorumObservations).toHaveLength(0);
  await expect(page.getByTestId(/^live-attendance-/).and(page.locator('[aria-pressed="true"]'))).toHaveCount(0);
  await expect(page.getByTestId("live-meeting-start")).toBeDisabled();
  await expect(page.getByText("Quorum not established", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Record attendance for every roster member before opening the meeting.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Everything is in order: the meeting can be opened.", { exact: true })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("opening-initial-empty.png"), fullPage: true });
}

async function inspectPreparedRollCall(page: Page, meetingId: string) {
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await expect(page.getByText("Quorum not established", { exact: true })).toBeVisible();
  const state = await sirenProperties<{ currentAttendance: unknown[]; quorumObservations: unknown[] }>(
    await page.request.get(`/api/council-meetings/${meetingId}/conduct`),
  );
  expect(state.currentAttendance).toHaveLength(0);
  expect(state.quorumObservations).toHaveLength(0);
  await expect(page.getByTestId("live-rollcall-prepared")).toHaveText(
    "Roll call completed. Quorum will be recorded when the meeting opens.",
  );
  await expect(page.getByTestId("live-quorum-observation")).toHaveClass(/live-quorum-chip-pending/);
  await expect(page.getByText("Everything is in order: the meeting can be opened.", { exact: true })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("opening-filled-not-recorded.png"), fullPage: true });
}

async function verifyOpeningAfterReload(page: Page, meetingId: string, verdict: "met" | "notMet") {
  await expect(page.getByTestId("live-meeting-start")).toBeHidden();
  const before = await sirenProperties<{
    currentAttendance: unknown[];
    quorumObservations: Array<{ facts: { verdict: string } }>;
  }>(await page.request.get(`/api/council-meetings/${meetingId}/conduct`));
  expect(before.currentAttendance).toHaveLength(15);
  expect(before.quorumObservations).toHaveLength(1);
  expect(before.quorumObservations[0]!.facts.verdict).toBe(verdict);
  await page.reload();
  await page.getByTestId("live-opening").click();
  await expect(page.getByTestId("live-opening-summary")).toBeVisible();
  await expect(page.getByTestId("live-meeting-start")).toBeHidden();
  await expect(page.getByText("Quorum not established", { exact: true })).toBeHidden();
  const after = await sirenProperties<{ currentAttendance: unknown[]; quorumObservations: unknown[] }>(
    await page.request.get(`/api/council-meetings/${meetingId}/conduct`),
  );
  expect(after.currentAttendance).toEqual(before.currentAttendance);
  expect(after.quorumObservations).toEqual(before.quorumObservations);
  await page.screenshot({ path: test.info().outputPath("opening-persisted-after-reload.png"), fullPage: true });
}

async function declareRecusal(
  page: Page,
  memberId: string,
  basis: "personalInterest" | "designatedRepresentativeConflict",
) {
  await expect(page.getByTestId("recusal-submit")).toBeDisabled();
  await page.getByTestId("recusal-member").click();
  const memberResult = page
    .getByTestId("recusal-member-search-result")
    .and(page.locator(`[data-reference-id="${memberId}"]`));
  const memberName = await memberResult.locator("strong").innerText();
  await page.getByTestId("recusal-member-search-input").fill(memberName);
  await expect(memberResult).toBeVisible();
  await memberResult.click();
  await page.getByTestId(`recusal-basis-${basis}`).check();
  await page.screenshot({ path: test.info().outputPath(`recusal-${basis}.png`), fullPage: true });
  await page.getByTestId("recusal-submit").click();
  await expect(page.getByTestId("recusal-form")).toBeHidden();
  await page.getByTestId("live-recusal-info").click();
  await expect(page.getByTestId(`agenda-item-recusal-${memberId}`)).toBeVisible();
  await page.getByTestId("live-recusal-info-content").press("Escape");
  await expect(page.getByTestId("live-recusal-info-content")).toBeHidden();
  await expect(page.getByTestId("live-recusal-info")).toBeFocused();
}

async function previewAndConfirm(page: Page, meetingId: string, agendaItemId: string, checkStale = false) {
  const response = page.waitForResponse(
    (entry) => entry.request().method() === "POST" && entry.url().endsWith("/ballot-previews"),
  );
  await page.getByTestId("live-ballot-preview-open").click();
  const previewResponse = await response;
  const submitted = previewResponse.request().postDataJSON();
  if (submitted.candidate.mode === "secret") {
    expect(Object.keys(submitted.candidate).sort()).toEqual([
      "mode",
      "participantAttendanceIds",
      "procedure",
      "totals",
    ]);
    expect(Object.keys(submitted.candidate.totals).sort()).toEqual([
      "abstain",
      "approve",
      "blank",
      "invalid",
      "nonParticipation",
      "reject",
    ]);
    expect(Object.values(submitted.candidate.totals).every((value) => typeof value === "number")).toBeTruthy();
  }
  const preview = await sirenProperties<{ id: string; candidate: { chairmanAttendanceId: string } }>(previewResponse);
  await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
  for (const key of ["approve", "reject", "abstain", "nonParticipation"]) {
    await expect(page.getByTestId(`live-ballot-preview-total-${key}`)).toBeVisible();
  }
  for (const key of ["blank", "invalid"]) {
    await expect(page.getByTestId(`live-ballot-preview-total-${key}`)).toHaveCount(
      submitted.candidate.mode === "secret" ? 1 : 0,
    );
  }
  await expect
    .poll(() =>
      page.getByTestId("live-ballot-preview").evaluate((preview) => {
        const correct = preview.querySelector('[data-testid="live-ballot-preview-correct"]');
        const confirm = preview.querySelector('[data-testid="live-ballot-preview-confirm"]');
        if (!correct || !confirm) return Number.POSITIVE_INFINITY;
        return Math.abs(correct.getBoundingClientRect().y - confirm.getBoundingClientRect().y);
      }),
    )
    .toBeLessThan(2);
  const item = await sirenProperties<{ completedAt: string | null }>(
    await page.request.get(`/api/council-meetings/${meetingId}/agenda-items/${agendaItemId}`),
  );
  expect(item.completedAt).toBeNull();
  const ballots = await sirenItems<{ agendaItemId: string }>(
    await page.request.get(`/api/ballots?meetingId=${meetingId}`),
  );
  expect(ballots.some((ballot) => ballot.agendaItemId === agendaItemId)).toBe(false);
  if (checkStale) {
    const { chairmanAttendanceId: determinedChair, ...submitted } = preview.candidate;
    expect(determinedChair).toBeTruthy();
    expect(
      (await page.request.post("/api/ballot-previews", { data: { agendaItemId, candidate: submitted } })).ok(),
    ).toBeTruthy();
    await page.getByTestId("live-ballot-preview-confirm").click();
    await expect(page.getByTestId("live-ballot-preview").getByRole("alert")).toContainText("out of date");
    await page.screenshot({ path: test.info().outputPath("ballot-preview-stale.png"), fullPage: true });
  }
  await page.getByTestId("live-ballot-preview-correct").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeHidden();
  if (checkStale) {
    await page
      .getByTestId(/^live-vote-member-/)
      .first()
      .click();
    await page.getByTestId("live-vote-assign-against").click();
  }
  await page.getByTestId("live-ballot-preview-open").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath(`ballot-preview-${submitted.candidate.mode}.png`),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByTestId("live-ballot-preview-confirm").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeHidden();
}

test("mobile French recusals preserve explicit qualification and show a real refusal", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(120_000);
  // biome-ignore lint/suspicious/noSkippedTests: This scenario is opt-in because it requires a dedicated fresh meeting fixture.
  test.skip(
    process.env.HALL_E2E_MOBILE_RECUSALS !== "1",
    "Dedicated fresh meeting fixture: HALL_E2E_MOBILE_RECUSALS=1 with --grep 'mobile French recusals'",
  );
  const meetings = await sirenItems<{
    id: string;
    scheduledAt: string | null;
    startedAt: string | null;
    closedAt: string | null;
  }>(await page.request.get("/api/council-meetings"));
  const meeting = meetings.find((entry) => !entry.startedAt && !entry.closedAt)!;
  if (!meeting.scheduledAt) {
    await sirenProperties(
      await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
        data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "E2E recusals room" },
      }),
    );
  }
  const members = await sirenItems<{ id: string }>(await page.request.get("/api/council-members"));
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  const item = await scheduleVotingItem(page, meeting.id, businesses[0]!.id, 1);
  await sirenProperties(await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} }));
  await sirenProperties(
    await page.request.post(`/api/council-meetings/${meeting.id}/record-opening`, {
      data: {
        chairMemberId: members[0]!.id,
        secretaryMemberId: members[1]!.id,
        attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
      },
    }),
  );
  await page.evaluate(() => localStorage.setItem("mairie.locale", "fr"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/meetings/${meeting.id}/live`);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.getByTestId(`live-agenda-item-${item.id}`).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await declareRecusal(page, members[2]!.id, "personalInterest");
  await page.getByTestId("live-agenda-start").click();
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await declareRecusal(page, members[3]!.id, "designatedRepresentativeConflict");
  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await page.getByTestId("recusal-member").click();
  await page
    .getByTestId("recusal-member-search-result")
    .and(page.locator(`[data-reference-id="${members[4]!.id}"]`))
    .click();
  await page.getByTestId("recusal-basis-personalInterest").check();
  expect(
    (
      await page.request.post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/recusals`, {
        data: { councilMemberId: members[4]!.id, legalBasis: "personalInterest" },
      })
    ).ok(),
  ).toBeTruthy();
  const refusal = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith(`/agenda-items/${item.id}/recusals`),
  );
  await page.getByTestId("recusal-submit").click();
  expect((await refusal).status()).toBe(409);
  await expect(page.getByTestId("recusal-form").getByRole("alert")).toContainText("déjà");
  await page.screenshot({ path: testInfo.outputPath("mobile-fr-recusal-refusal.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId(`live-agenda-item-${item.id}`).click();
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-ballot-mode-secret").click();
  await expect(page.getByTestId(`live-vote-member-${members[2]!.id}`)).toBeHidden();
  await page.getByTestId(`live-vote-member-${members[5]!.id}`).click();
  await page.getByTestId("live-vote-assign-notVoting").click();
  await page.getByTestId("live-ballot-all-for").click();
  await page.screenshot({ path: testInfo.outputPath("mobile-fr-secret-participation.png"), fullPage: true });
  await page.getByTestId("live-ballot-preview-open").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("live-ballot-preview-open")).toBeVisible();
});

// @verifies-requirement HALL-FR-MTG-340
// @verifies-requirement HALL-FR-ATT-140
// @verifies-requirement HALL-FR-BAL-140
test("records a secretary handover, other persons present and shows the ballot chair", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(120_000);
  const meetings = await sirenItems<{
    id: string;
    scheduledAt: string | null;
    startedAt: string | null;
    closedAt: string | null;
  }>(await page.request.get("/api/council-meetings"));
  const meeting = meetings.find((entry) => !entry.startedAt && !entry.closedAt)!;
  if (!meeting.scheduledAt) {
    await sirenProperties(
      await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
        data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "E2E officers room" },
      }),
    );
  }
  const members = await sirenItems<{ id: string }>(await page.request.get("/api/council-members"));
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  await scheduleVotingItem(page, meeting.id, businesses[0]!.id, 1);
  await sirenProperties(await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} }));
  await sirenProperties(
    await page.request.post(`/api/council-meetings/${meeting.id}/record-opening`, {
      data: {
        chairMemberId: members[0]!.id,
        secretaryMemberId: members[1]!.id,
        attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
      },
    }),
  );
  const contact = await sirenProperties<{ id: string }>(
    await page.request.post("/api/contacts", { data: { firstName: "Claire", lastName: "Assistante" } }),
  );
  await page.evaluate(() => localStorage.setItem("mairie.locale", "fr"));
  await page.goto(`/app/meetings/${meeting.id}/live`);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.getByTestId("live-officers-open").click();
  await expect(page.getByTestId("live-officers-current-secretary")).not.toBeEmpty();
  await page.getByTestId("live-officers-office-secretary").check();
  await page.getByTestId("live-officers-successor").click();
  await page
    .getByTestId("live-officers-successor-search-result")
    .and(page.locator(`[data-reference-id="${members[2]!.id}"]`))
    .click();
  await page.getByTestId("live-officers-handover-submit").click();
  await expect(page.getByTestId("live-officers-history")).toContainText("Nomination par le conseil");
  await page.screenshot({ path: testInfo.outputPath("meeting-officers-dialog.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByTestId("live-attendance-adjust").click();
  await page.getByTestId("live-auxiliaries-contact").click();
  await page
    .getByTestId("live-auxiliaries-contact-search-result")
    .and(page.locator(`[data-reference-id="${contact.id}"]`))
    .click();
  await page.getByTestId("live-auxiliaries-quality").fill("secrétaire de mairie");
  await page.getByTestId("live-auxiliaries-submit").click();
  await expect(page.getByTestId(`live-auxiliary-${contact.id}`)).toContainText("Claire Assistante");
  await expect(page.getByTestId(`live-auxiliary-quality-${contact.id}`)).toHaveValue("secrétaire de mairie");
  await page.getByTestId("live-auxiliaries-first-name").fill("Jean");
  await page.getByTestId("live-auxiliaries-last-name").fill("Libre");
  await page.getByTestId("live-auxiliaries-submit").click();
  await expect(page.getByTestId("live-auxiliaries-list")).toContainText("Jean Libre");
  await page.screenshot({ path: testInfo.outputPath("meeting-attending-persons.png"), fullPage: true });
  await page.getByTestId("live-attendance-save").click();
  await page
    .getByTestId(/^live-agenda-item-/)
    .first()
    .click();
  await page.getByTestId("live-agenda-start").click();
  await page.getByTestId("live-ballot-open").click();
  await expect(page.getByTestId("live-ballot-chairman-basis")).toHaveText("Président de séance en titre");
  await expect(page.getByTestId("live-ballot-chairman").locator("select")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("determined-ballot-chair.png"), fullPage: true });
});

test("conducts a meeting without quorum, adjourns voting items and closes without a ballot", async ({
  appPage: page,
}) => {
  test.setTimeout(120_000);
  const meetings = await sirenItems<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((item) => !item.startedAt && !item.closedAt)!;
  expect(meeting).toBeTruthy();
  await sirenProperties(
    await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "E2E no quorum room" },
    }),
  );
  const members = (
    await sirenItems<{ id: string; active: boolean }>(await page.request.get("/api/council-members"))
  ).filter((member) => member.active);
  expect(members).toHaveLength(15);
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  const proposal = await scheduleVotingItem(page, meeting.id, businesses[0]!.id, 1);
  const question = await sirenProperties<{ id: string }>(
    await page.request.post(`/api/council-meetings/${meeting.id}/agenda-items`, {
      data: { kind: "openQuestion", councilBusinessId: businesses[0]!.id, position: 2 },
    }),
  );
  await sirenProperties(await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} }));
  await page.goto(`/app/meetings/${meeting.id}/live`);
  await inspectInitialRollCall(page, meeting.id);
  for (const [index, member] of members.entries())
    await page.getByTestId(`live-attendance-${member.id}-${index < 7 ? "present" : "absent"}`).click();
  await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  const opening = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/record-opening"),
  );
  await inspectPreparedRollCall(page, meeting.id);
  await page.getByTestId("live-meeting-start").click();
  const opened = await sirenProperties<{
    meeting: { startedAt: string | null };
    quorumObservations: Array<{ facts: { verdict: string; presentCount: number; requiredPresent: number } }>;
  }>(await opening);
  expect(opened.meeting.startedAt).not.toBeNull();
  expect(opened.quorumObservations.at(-1)?.facts).toMatchObject({
    verdict: "notMet",
    presentCount: 7,
    requiredPresent: 8,
  });
  await verifyOpeningAfterReload(page, meeting.id, "notMet");
  await page.getByTestId("live-opening").click();
  await expect(page.getByTestId("live-opening-summary")).toBeVisible();
  await page.getByTestId(`live-agenda-item-${proposal.id}`).click();
  await expect(page.getByTestId("conduct-blocker-continue-quorumNotMet")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("proposal-without-quorum-reason.png"), fullPage: true });
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  await expect(page.getByTestId("live-ballot-open")).toBeHidden();
  expect(
    (
      await page.request.post(`/api/council-meetings/${meeting.id}/agenda-items/${proposal.id}/start`, {
        data: {},
      })
    ).status(),
  ).toBe(409);
  const agenda = await sirenItems<{
    id: string;
    position: number;
    subject: { kind: string };
    adjournedAt: string | null;
  }>(await page.request.get(`/api/council-meetings/${meeting.id}/agenda-items`));
  for (const item of agenda.filter(
    (item) => ["minutesApproval", "councilDecisionProposal"].includes(item.subject.kind) && !item.adjournedAt,
  )) {
    await page.getByTestId(`live-agenda-item-${item.id}`).click();
    await adjournThroughConfirmation(page, item.id);
  }
  const informationalItems = agenda
    .filter((item) => item.id === question.id)
    .sort((left, right) => left.position - right.position);
  expect(informationalItems).toHaveLength(1);
  for (const item of informationalItems) {
    await page.getByTestId(`live-agenda-item-${item.id}`).click();
    await expect(page.getByTestId(`live-agenda-item-${item.id}`)).toHaveAttribute("aria-current", "true");
    await page.getByTestId("live-agenda-start").click();
    await expect(page.getByTestId("live-agenda-start")).toBeHidden();
    await expect(page.getByTestId("live-ballot-open")).toBeHidden();
    await expect(page.getByTestId("conduct-blockers-continue")).toHaveCount(0);
    await expect(page.getByTestId("live-item-continuation").locator("button")).toHaveCount(1);
    const completing = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith(`/agenda-items/${item.id}/complete`),
    );
    await page.getByTestId("live-agenda-complete").click();
    expect((await completing).ok()).toBeTruthy();
  }
  await expect(page.getByTestId("live-meeting-close")).toBeEnabled();
  const resolvedAgenda = await sirenItems<{ id: string; completedAt: string | null; adjournedAt: string | null }>(
    await page.request.get(`/api/council-meetings/${meeting.id}/agenda-items`),
  );
  expect(resolvedAgenda.every((item) => item.completedAt || item.adjournedAt)).toBe(true);
  await page.getByTestId("live-agenda-add").click();
  await expect(page.getByTestId("live-add-question-dialog")).toBeVisible();
  const questionName = `Question added during the meeting ${crypto.randomUUID()}`;
  await page.getByTestId("live-add-question-name").fill(questionName);
  await page.screenshot({ path: test.info().outputPath("add-open-question-dialog.png"), animations: "disabled" });
  const addingQuestion = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/open-questions"),
  );
  await page.getByTestId("live-add-question-submit").click();
  const addedResponse = await addingQuestion;
  expect(addedResponse.status()).toBe(201);
  expect(addedResponse.request().postDataJSON()).toEqual({ path: "", name: questionName, content: "" });
  const addedQuestion = await sirenProperties<{
    id: string;
    agendaNumber: number;
    introducedAt: string;
    subject: { kind: string };
  }>(addedResponse);
  expect(addedQuestion.subject.kind).toBe("openQuestion");
  expect(addedQuestion.agendaNumber).toBe(resolvedAgenda.length + 1);
  expect(Number.isFinite(Date.parse(addedQuestion.introducedAt))).toBe(true);
  await expect(page.getByTestId("live-add-question-dialog")).toBeHidden();
  const appendedAgenda = await sirenItems<{ id: string }>(
    await page.request.get(`/api/council-meetings/${meeting.id}/agenda-items`),
  );
  expect(appendedAgenda.at(-1)?.id).toBe(addedQuestion.id);
  await page.getByTestId(`live-agenda-item-${addedQuestion.id}`).click();
  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  await expect(page.getByTestId("live-ballot-open")).toBeHidden();
  const discussionParagraphs = Array.from(
    { length: 24 },
    (_, index) => `Discussion paragraph ${index + 1}: question introduced during the meeting, without a ballot.`,
  );
  const addedDiscussion = discussionParagraphs.join("\n\n");
  await page.getByTestId("live-agenda-notes").getByTestId("editor-writing-area").fill(addedDiscussion);
  await verifyPersistentCommandBar(page);
  await expect
    .poll(async () =>
      (
        await sirenProperties<{ discussionSummary: string }>(
          await page.request.get(`/api/council-meetings/${meeting.id}/agenda-items/${addedQuestion.id}`),
        )
      ).discussionSummary
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    )
    .toEqual(discussionParagraphs);
  const savedDiscussion = (
    await sirenProperties<{ discussionSummary: string }>(
      await page.request.get(`/api/council-meetings/${meeting.id}/agenda-items/${addedQuestion.id}`),
    )
  ).discussionSummary;
  await page.reload();
  await page.getByTestId(`live-agenda-item-${addedQuestion.id}`).click();
  for (const paragraph of discussionParagraphs)
    await expect(page.getByTestId("live-agenda-notes").getByTestId("editor-writing-area")).toContainText(paragraph);
  await page.screenshot({ path: test.info().outputPath("added-open-question-discussion.png"), animations: "disabled" });
  // Close with the newly introduced question still under discussion.
  let closeRequests = 0;
  let releaseClose!: () => void;
  const closeGate = new Promise<void>((resolve) => {
    releaseClose = resolve;
  });
  await page.route(`**/api/council-meetings/*/close`, async (route) => {
    closeRequests += 1;
    const response = await route.fetch();
    await closeGate;
    await route.fulfill({ response });
  });
  await page.getByTestId("live-meeting-close").click();
  await expect(page.getByTestId("live-meeting-close")).toContainText("not examined");
  const closing = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/close"),
  );
  await page.getByTestId("live-meeting-close").dblclick();
  await expect(page.getByTestId("live-meeting-close")).toBeDisabled();
  await expect(page.getByTestId("live-meeting-close")).toHaveAttribute("aria-busy", "true");
  await expect(page).toHaveURL(/\/live$/);
  releaseClose();
  expect((await closing).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/app\/meetings$/);
  expect(closeRequests).toBe(1);
  const closed = await sirenProperties<{ closedAt: string | null; minutesId: string | null }>(
    await page.request.get(`/api/council-meetings/${meeting.id}`),
  );
  expect(closed.closedAt).not.toBeNull();
  expect(closed.minutesId).not.toBeNull();
  const carriedHistory = await sirenProperties<{
    position: number;
    startedAt: string | null;
    completedAt: string | null;
  }>(await page.request.get(`/api/council-meetings/${meeting.id}/agenda-items/${addedQuestion.id}`));
  expect(carriedHistory.position).toBeLessThan(0);
  expect(carriedHistory.startedAt).not.toBeNull();
  expect(carriedHistory.completedAt).toBeNull();
  const subsequentMeetings = await sirenItems<{ id: string; previousCouncilMeetingId: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const subsequent = subsequentMeetings.find((item) => item.previousCouncilMeetingId === meeting.id);
  expect(subsequent).toBeTruthy();
  const carriedAgenda = await sirenItems<{ title: string; startedAt: string | null }>(
    await page.request.get(`/api/council-meetings/${subsequent!.id}/agenda-items`),
  );
  expect(carriedAgenda.find((item) => item.title === questionName)?.startedAt).toBeNull();
  await page.getByTestId(`meeting-history-${meeting.id}`).click();
  await expect(page.getByTestId("agenda-status-carriedForward")).toBeVisible();
  await expect(page.getByTestId("agenda-status-inProgress")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("closed-meeting-carried-forward.png"),
    animations: "disabled",
    fullPage: true,
  });
  expect(await sirenItems(await page.request.get(`/api/ballots?meetingId=${meeting.id}`))).toHaveLength(0);
  const minutes = await sirenProperties<{
    facts: { agenda: Array<{ id: string; agendaNumber: number; introducedAt: string; kind: string }> };
    sections: Array<{ agendaItemId: string; content: string }>;
  }>(await page.request.get(`/api/minutes/${closed.minutesId}`));
  expect(minutes.facts.agenda.at(-1)).toMatchObject({
    id: addedQuestion.id,
    kind: "openQuestion",
    agendaNumber: addedQuestion.agendaNumber,
    introducedAt: addedQuestion.introducedAt,
  });
  expect(minutes.sections.find((section) => section.agendaItemId === addedQuestion.id)?.content).toContain(
    savedDiscussion,
  );
  await page.goto(`/app/minutes/${closed.minutesId}`);
  for (const paragraph of discussionParagraphs)
    await expect(
      page.getByTestId(`minutes-section-${addedQuestion.id}`).getByTestId("editor-writing-area"),
    ).toContainText(paragraph);
  await page.reload();
  for (const paragraph of discussionParagraphs)
    await expect(
      page.getByTestId(`minutes-section-${addedQuestion.id}`).getByTestId("editor-writing-area"),
    ).toContainText(paragraph);
  await page.getByTestId(`minutes-section-${addedQuestion.id}`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("added-open-question-minutes.png"), animations: "disabled" });
});

test("shows canonical meeting entry requirements and blocks entry again when the agenda is revised", async ({
  appPage: page,
}) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  const meetings = await sirenItems<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((candidate) => !candidate.startedAt && !candidate.closedAt)!;
  expect(meeting).toBeTruthy();
  const scheduled = await sirenProperties<{ slug: string }>(
    await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), location: "Entry requirements E2E" },
    }),
  );
  const detailUrl = `/app/meetings/${scheduled.slug}`;
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  const preparedItem = await scheduleVotingItem(page, scheduled.slug, businesses[0]!.id, 1);
  const conductUrl = `/api/council-meetings/${meeting.id}/conduct`;
  const initial = await sirenProperties<{ currentAttendance: unknown[]; quorumObservations: unknown[] }>(
    await page.request.get(conductUrl),
  );
  await page.goto(detailUrl);
  await expect(page.getByTestId("meeting-enter-live")).toBeDisabled();
  await expect(page.getByTestId("meeting-entry-blocker-agendaRevisionOpen")).toBeVisible();
  await expect(page.getByTestId("meeting-document-notice-state")).toHaveAttribute("data-tone", "todo");
  await page.goto(`${detailUrl}/live`);
  await expect(page.getByTestId("live-meeting-entry-blocked")).toBeVisible();
  await expect(page.getByTestId("live-meeting-start")).toHaveCount(0);
  await page.getByTestId("live-return-preparation").click();
  const established = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/notices"),
  );
  await page.getByTestId("meeting-generate-notice").click();
  expect((await established).ok()).toBeTruthy();
  await expect(page.getByTestId("meeting-live-entry-reason")).toHaveCount(0);
  await expect(page.getByTestId("meeting-document-notice-state")).toHaveAttribute("data-tone", "done");
  await page.getByTestId("meeting-enter-live").click();
  await expect(page.getByTestId("live-meeting-page")).toBeVisible();
  await expect(page.getByTestId("meeting-entry-blocker-scheduledTimeNotReached")).toBeVisible();
  await expect(page.getByTestId("live-meeting-start")).toBeDisabled();
  await page.getByTestId("live-meeting-exit").click();
  await page.getByTestId("meeting-revise-agenda").click();
  await expect(page.getByTestId("meeting-generate-notice")).toBeVisible();
  await expect(page.getByTestId("meeting-enter-live")).toBeDisabled();
  await expect(page.getByTestId("meeting-entry-blocker-agendaRevisionOpen")).toBeVisible();
  await expect(page.getByTestId("meeting-document-notice-state")).toHaveAttribute("data-tone", "todo");
  await page.goto(`${detailUrl}/live`);
  await expect(page.getByTestId("live-meeting-entry-blocked")).toBeVisible();
  const after = await sirenProperties<typeof initial>(await page.request.get(conductUrl));
  expect(after.currentAttendance).toEqual(initial.currentAttendance);
  expect(after.quorumObservations).toEqual(initial.quorumObservations);
  await page.screenshot({ path: test.info().outputPath("meeting-entry-requirements.png"), fullPage: true });
  await page.goto(detailUrl);
  await page.getByTestId(`agenda-item-open-business-${preparedItem.id}`).click();
  await expect(page.getByTestId("council-business-workbench")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("councilBusiness")).toBe(businesses[0]!.id);
});

// @verifies-requirement HALL-FR-MTG-360
test("conducts public and secret ballots and leaves an unexamined previous PV unsettled", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(150_000);
  page.setDefaultTimeout(15_000);

  const meetings = await sirenItems<{
    id: string;
    slug: string | null;
    number: number;
    scheduledAt: string | null;
    startedAt: string | null;
    closedAt: string | null;
    previousCouncilMeetingId: string | null;
  }>(await page.request.get("/api/council-meetings"));
  const meeting = meetings.find((candidate) => !candidate.startedAt && !candidate.closedAt);
  expect(meeting).toBeTruthy();
  const scheduled = await sirenProperties<{ slug: string }>(
    await page.request.put(`/api/council-meetings/${meeting!.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "E2E council room" },
    }),
  );
  meeting!.slug = scheduled.slug;

  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  expect(businesses.length).toBeGreaterThanOrEqual(2);
  const discussionDocument = await sirenProperties<{ id: string }>(
    await page.request.post("/api/resources/documents", {
      multipart: {
        path: "seed",
        councilBusinessId: businesses[0]!.id,
        file: {
          name: "contrat-discussion.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Contrat disponible pendant la discussion"),
        },
      },
    }),
  );
  const publicItem = await scheduleVotingItem(page, meeting!.slug, businesses[0]!.id, 1);
  const secretItem = await scheduleVotingItem(page, meeting!.slug, businesses[1]!.id, 2);

  const deferredItem = await sirenProperties<{ id: string }>(
    await page.request.post(`/api/council-meetings/${meeting!.slug}/agenda-items`, {
      data: { kind: "openQuestion", councilBusinessId: businesses[0]!.id, position: 3 },
    }),
  );
  const documentReference = `:resource[contrat-discussion.txt]{#${discussionDocument.id}}`;
  const writeSubjectText = async (agendaItemId: string, content: string) => {
    const item = await sirenProperties<{ subject: { textResourceId: string } }>(
      await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${agendaItemId}`),
    );
    const text = await sirenProperties<{ version: number }>(
      await page.request.get(`/api/resources/${item.subject.textResourceId}`),
    );
    const written = await page.request.put(`/api/resources/${item.subject.textResourceId}/content`, {
      data: { kind: "text", expectedVersion: text.version, content },
    });
    expect(written.ok()).toBeTruthy();
  };
  await writeSubjectText(deferredItem.id, `Open question text citing the contract ${documentReference}.`);
  await page.goto(`/app/meetings/${meeting!.slug}`);
  await page.getByTestId(`agenda-item-expand-${publicItem.id}`).click();
  await page
    .getByTestId("agenda-subject-editor")
    .getByTestId("editor-writing-area")
    .fill(
      "Proposal text distinct from the report\n\n" +
        Array.from(
          { length: 24 },
          (_, index) =>
            `Article ${index + 1}. Le conseil examine les dispositions du projet et les conditions de sa mise en œuvre. Les moyens nécessaires et le calendrier sont décrits dans le dossier présenté en séance.`,
        ).join("\n\n"),
    );
  await page.screenshot({ path: "/tmp/hall-preparation-connected.png", fullPage: true });
  const savedText = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().endsWith("/content"),
  );
  await page.getByTestId("agenda-item-save").click();
  expect((await savedText).ok()).toBeTruthy();
  await expect(page.getByTestId("agenda-item-save")).toBeEnabled();
  const proposal = await sirenProperties<{ subject: { textResourceId: string; content: string } }>(
    await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}`),
  );
  expect(proposal.subject.content).toContain("Proposal text distinct from the report");
  const business = await sirenProperties<{ reportResourceId: string }>(
    await page.request.get(`/api/council-business/${businesses[0]!.id}`),
  );
  expect(proposal.subject.textResourceId).not.toBe(business.reportResourceId);
  await expect(page.getByTestId("meeting-generate-notice")).toBeVisible();
  const noticeResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/notices"),
  );
  await page.getByTestId("meeting-generate-notice").click();
  expect((await noticeResponse).ok()).toBeTruthy();
  await page.goto(`/app/meetings/${meeting!.slug}/live`);
  await expect(page.getByTestId("live-meeting-page")).toBeVisible();
  await inspectInitialRollCall(page, meeting!.id);
  await page.getByTestId("live-meeting-exit").click();
  await page.getByTestId("navigation-council-decisions").click();
  await expect(page.getByTestId("decisions-empty")).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId("live-meeting-page")).toBeVisible();
  await page.getByTestId("live-attendance-all-present").click();
  await expect(page.getByTestId("live-meeting-start")).toBeDisabled();
  const members = await sirenItems<{ id: string }>(await page.request.get("/api/council-members"));
  await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await inspectPreparedRollCall(page, meeting!.id);
  await page.getByTestId("live-meeting-start").click();
  await verifyOpeningAfterReload(page, meeting!.id, "met");

  await expect(page.getByTestId(`live-agenda-item-${publicItem.id}`)).toBeVisible();
  await page.getByTestId(`live-agenda-item-${publicItem.id}`).click();
  await expect(page.getByTestId("live-item-progress")).toBeVisible();
  const uiFont = await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily);
  await expect(page.getByTestId("live-item-title")).toHaveCSS("font-family", uiFont);
  await expect(page.getByTestId("live-agenda-add")).toHaveCSS("font-size", "14px");
  await expect(page.getByTestId("live-attendance-adjust")).toHaveCSS("font-size", "14px");
  await expect(page.getByTestId("live-attendance-adjust")).toBeEnabled();
  await expect(page.getByTestId("live-agenda-add")).toBeEnabled();
  await expect(page.getByTestId("conduct-blockers-add-agenda-item")).toHaveCount(0);
  const proposalBlock = page.getByTestId("live-proposal-toggle").locator("..");
  await expect(proposalBlock).toHaveAttribute("open", "");
  await expect(proposalBlock).toContainText("Proposal text distinct from the report");
  await page.screenshot({
    path: testInfo.outputPath("conduct-proposal-text.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.screenshot({
    path: testInfo.outputPath("conduct-presentation.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByTestId("live-attendance-adjust").click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await expect(page.getByTestId("live-attendance-save")).toBeEnabled();
  await page.reload();
  await page.getByTestId(`live-agenda-item-${publicItem.id}`).click();
  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await declareRecusal(page, members[2]!.id, "personalInterest");
  const publicRecusals = await sirenProperties<{
    quorumImpact: { denominatorReduction: number };
    agendaItem: { startedAt: string | null };
  }>(await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}/recusals`));
  expect(publicRecusals.quorumImpact.denominatorReduction).toBe(0);
  expect(publicRecusals.agendaItem.startedAt).toBeNull();
  await inspectRecusalInformation(page);
  const discussionDocumentButton = page.getByTestId(`live-document-${discussionDocument.id}`);
  await expect(discussionDocumentButton).toBeVisible();
  await page.locator("body").evaluate((body, documentId) => {
    body.setAttribute("data-discussion-document-missing", "false");
    new MutationObserver(() => {
      if (!body.querySelector(`[data-testid="live-document-${documentId}"]`)) {
        body.setAttribute("data-discussion-document-missing", "true");
      }
    }).observe(body, { childList: true, subtree: true });
  }, discussionDocument.id);
  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  await expect(discussionDocumentButton).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-discussion-document-missing", "false");

  await page
    .getByTestId("live-agenda-notes")
    .getByTestId("editor-writing-area")
    .fill("Discussion recorded during the meeting.");
  await expect
    .poll(async () => {
      const item = await sirenProperties<{ discussionSummary: string }>(
        await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}`),
      );
      return item.discussionSummary;
    })
    .toContain("Discussion recorded during the meeting.");
  await verifyPersistentCommandBar(page);
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-recusal-info").click();
  await expect(page.getByTestId("agenda-item-recusal-open")).toBeVisible();
  await page.getByTestId("live-recusal-info-content").press("Escape");
  await expect(page.getByTestId("live-recusal-info")).toBeFocused();
  await page.getByTestId("live-ballot-all-for").click();
  await verifyPersistentCommandBar(page);
  await expect(page.getByTestId("live-ballot-preview-open")).toBeEnabled();
  await expect(page.getByTestId(`live-vote-member-${members[2]!.id}`)).toBeHidden();
  await page.getByTestId("live-opening").click();
  await expect(page.getByTestId("live-opening-summary")).toBeVisible();
  await expect(page.getByTestId("live-ballot-preview-open")).toBeHidden();
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1440, height: 1044 });
  await page.setViewportSize({ width: 1118, height: 1044 });
  await page.getByTestId("live-agenda-toggle").click();
  const rail = page.getByTestId("live-agenda-rail");
  await expect(rail).toHaveCSS("width", "64px");
  await page.setViewportSize({ width: 1440, height: 1044 });
  await expect(rail).toHaveCSS("width", "64px");
  await page.setViewportSize({ width: 1118, height: 1044 });
  await expect(rail).toHaveCSS("width", "64px");
  await page.getByTestId(`live-agenda-item-${publicItem.id}`).click();
  await expect(page.getByTestId("live-opening-summary")).toBeHidden();
  await expect(page.getByTestId("live-ballot-preview-open")).toBeEnabled();
  await expect(page.getByTestId("live-item-progress")).toBeVisible();
  await page.getByTestId("live-agenda-toggle").click();
  await expect.poll(async () => (await rail.boundingBox())!.width).toBeGreaterThan(64);
  await page.setViewportSize(desktopViewport);
  await previewAndConfirm(page, meeting!.id, publicItem.id, true);
  await expect(page.getByTestId("live-ballot-result")).toBeVisible();
  await expect(page.getByTestId("live-ballot-result")).toContainText("Adopted");
  await expect(page.getByTestId("agenda-item-recusal-open")).toBeHidden();
  const lateRecusal = await page.request.post(
    `/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}/recusals`,
    {
      data: { councilMemberId: members[3]!.id, legalBasis: "personalInterest" },
    },
  );
  expect(lateRecusal.status()).toBe(409);

  await page.getByTestId(`live-agenda-item-${secretItem.id}`).click();
  await page.getByTestId("live-agenda-start").click();
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await declareRecusal(page, members[3]!.id, "designatedRepresentativeConflict");
  const secretRecusals = await sirenProperties<{ quorumImpact: { denominatorReduction: number } }>(
    await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${secretItem.id}/recusals`),
  );
  expect(secretRecusals.quorumImpact.denominatorReduction).toBe(1);
  await expect(page.getByTestId(`live-vote-member-${members[3]!.id}`)).toBeHidden();
  const memberCount = await page.getByTestId(/^live-vote-member-/).count();
  expect(memberCount).toBeGreaterThan(0);
  await page.getByTestId("live-ballot-mode-secret").click();
  await expect(page.getByTestId(`live-vote-member-${members[3]!.id}`)).toBeHidden();
  await page.getByTestId(`live-vote-member-${members[4]!.id}`).click();
  await page.getByTestId("live-vote-assign-notVoting").click();
  await page.screenshot({ path: testInfo.outputPath("secret-participation.png"), fullPage: true });
  await page.getByTestId("live-ballot-all-for").click();
  for (const voter of await page.getByTestId(/^live-vote-member-/).all()) await voter.click();
  await page.getByTestId("live-vote-assign-against").click();
  await expect(page.getByTestId("live-ballot-preview-open")).toBeEnabled();
  await previewAndConfirm(page, meeting!.id, secretItem.id);
  await page.getByTestId(`live-agenda-item-${secretItem.id}`).click();
  await expect(page.getByTestId("live-ballot-result")).toContainText("Rejected");
  const storedBallots = await sirenItems<{ id: string; agendaItemId: string; mode: string }>(
    await page.request.get(`/api/ballots?meetingId=${meeting!.id}`),
  );
  const storedSecret = storedBallots.find((ballot) => ballot.agendaItemId === secretItem.id)!;
  expect(storedSecret.mode).toBe("secret");
  const storedVotes = await sirenItems<{ mode: string; ballotParticipationId: null; count: number }>(
    await page.request.get(`/api/ballots/${storedSecret.id}/votes`),
  );
  expect(storedVotes.length).toBeGreaterThan(0);
  for (const vote of storedVotes) {
    expect(vote.mode).toBe("secret");
    expect(vote.ballotParticipationId).toBeNull();
  }

  await page.getByTestId("live-meeting-exit").click();
  await page.getByTestId("navigation-council-decisions").click();
  await expect(page.getByTestId(/^decision-open-/)).toHaveCount(2);
  await page
    .getByTestId(/^decision-open-/)
    .first()
    .click();
  await expect(page.getByTestId("decision-writing")).toBeVisible();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId("live-meeting-page")).toBeVisible();

  await page.getByTestId(`live-agenda-item-${deferredItem.id}`).click();
  await expect(page.getByTestId("live-proposal-toggle")).toHaveCount(0);
  const openQuestionBlock = page.getByTestId("live-open-question-toggle").locator("..");
  await expect(openQuestionBlock).toHaveAttribute("open", "");
  await expect(page.getByTestId("live-open-question-toggle")).toContainText("Open question");
  await expect(openQuestionBlock).toContainText("Open question text citing the contract");
  const questionDocumentLink = openQuestionBlock.getByTestId(`editor-resource-reference-${discussionDocument.id}`);
  await expect(questionDocumentLink).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("conduct-open-question-text.png"),
    fullPage: true,
    animations: "disabled",
  });
  await questionDocumentLink.click();
  await expect(page.getByTestId("resource-preview")).toBeVisible();
  await page.getByTestId("resource-preview-close").click();
  await expect(page.getByTestId("resource-preview")).toHaveCount(0);
  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  await expect(page.getByTestId("live-ballot-open")).toBeHidden();
  await adjournThroughConfirmation(page, deferredItem.id);
  await expect(page.getByTestId(`live-agenda-item-${deferredItem.id}`)).toContainText("Adjourned");
  const deferred = await sirenProperties<{ adjournedAt: string; completedAt: string | null }>(
    await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${deferredItem.id}`),
  );
  expect(deferred.adjournedAt).toBeTruthy();
  expect(deferred.completedAt).toBeNull();
  await expect(page.getByTestId("live-meeting-close")).toBeEnabled();
  await page.getByTestId("live-meeting-close").click();
  await page.getByTestId("live-meeting-close").click();
  await expect(page).toHaveURL(/\/app\/meetings$/);

  const afterClosure = await sirenItems<{
    id: string;
    number: number;
    previousCouncilMeetingId: string | null;
  }>(await page.request.get("/api/council-meetings"));
  const nextMeeting = afterClosure.find((candidate) => candidate.previousCouncilMeetingId === meeting!.id);
  expect(nextMeeting).toBeTruthy();
  expect(nextMeeting!.number).toBe(meeting!.number + 1);

  const nextAgenda = await sirenItems<{
    position: number;
    subject: { kind: string };
  }>(await page.request.get(`/api/council-meetings/${nextMeeting!.id}/agenda-items`));
  expect(nextAgenda).toHaveLength(2);
  expect(nextAgenda[1]).toMatchObject({ position: 2, subject: { kind: "openQuestion" } });
  expect(nextAgenda[0]).toMatchObject({ position: 1, subject: { kind: "minutesApproval" } });

  await page.goto(`/app/meetings/${meeting!.slug}`);
  await page.getByTestId("navigation-minutes").click();
  await expect(page.getByTestId("minutes-page")).toBeVisible();
  await page.getByTestId(`minutes-open-${meeting!.id}`).click();
  await expect(page.getByTestId("minutes-detail")).toBeVisible();
  await expect(page.getByTestId("minutes-settlement-status")).toHaveText("Not settled");
  const narrativeEditor = page.getByTestId(`minutes-section-${publicItem.id}`).getByTestId("editor-writing-area");
  await expect(narrativeEditor).toContainText("Discussion recorded during the meeting.");
  await page.screenshot({ path: testInfo.outputPath("minutes-draft.png"), fullPage: true });
  await expect(page.getByTestId("minutes-attendance-content")).toBeVisible();
  await page.getByTestId(`minutes-section-vote-toggle-${publicItem.id}`).click();
  await expect(page.getByTestId(`minutes-section-vote-${publicItem.id}`)).toHaveAttribute("open", "");
  await expect(page.getByTestId(`minutes-section-vote-content-${publicItem.id}`)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("minutes-vote-expanded.png"), fullPage: true });
  await page.getByTestId(`minutes-section-vote-toggle-${publicItem.id}`).click();
  await expect(page.getByTestId(`minutes-section-vote-${publicItem.id}`)).not.toHaveAttribute("open");
  const summaries = await sirenItems<{ id: string; councilMeetingId: string }>(await page.request.get("/api/minutes"));
  const minutes = summaries.find((entry) => entry.councilMeetingId === meeting!.id)!;
  expect(minutes).toBeTruthy();
  const beforeCorrection = await sirenProperties<{ facts: unknown; version: number }>(
    await page.request.get(`/api/minutes/${minutes.id}`),
  );
  const corrected = "Discussion corrected after the meeting without changing the recorded votes.";
  await narrativeEditor.fill(corrected);
  await expect
    .poll(
      async () =>
        (
          await sirenProperties<{ sections: { agendaItemId: string; content: string }[] }>(
            await page.request.get(`/api/minutes/${minutes.id}`),
          )
        ).sections.find((section) => section.agendaItemId === publicItem.id)?.content,
    )
    .toContain(corrected);
  await page.reload();
  await expect(page.getByTestId(`minutes-section-${publicItem.id}`)).toContainText(corrected);
  const afterCorrection = await sirenProperties<{ facts: unknown; version: number }>(
    await page.request.get(`/api/minutes/${minutes.id}`),
  );
  expect(afterCorrection.facts).toEqual(beforeCorrection.facts);
  await page.route(`**/api/minutes/${minutes.id}/draft`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ title: "Unavailable", status: 503 }),
    });
  });
  const retriedNarrative = `${corrected}\n\nAdditional correction retained during a network failure.`;
  await page.getByTestId(`minutes-section-${publicItem.id}`).getByTestId("editor-writing-area").fill(retriedNarrative);
  await expect(page.getByTestId("minutes-save-retry")).toBeVisible();
  await expect(page.getByTestId(`minutes-section-${publicItem.id}`)).toContainText("Additional correction retained");
  await page.unroute(`**/api/minutes/${minutes.id}/draft`);
  await page.getByTestId("minutes-save-retry").click();
  await expect
    .poll(
      async () =>
        (
          await sirenProperties<{ sections: { agendaItemId: string; content: string }[] }>(
            await page.request.get(`/api/minutes/${minutes.id}`),
          )
        ).sections.find((section) => section.agendaItemId === publicItem.id)?.content,
    )
    .toContain("Additional correction retained");
  await page
    .getByTestId(`minutes-section-${secretItem.id}`)
    .getByTestId("editor-writing-area")
    .fill("Separate discussion for the secret ballot.");
  await expect
    .poll(
      async () =>
        (
          await sirenProperties<{ sections: { agendaItemId: string; content: string }[] }>(
            await page.request.get(`/api/minutes/${minutes.id}`),
          )
        ).sections.find((section) => section.agendaItemId === secretItem.id)?.content,
    )
    .toContain("Separate discussion");
  const beforePreview = await sirenProperties<{ version: number }>(
    await page.request.get(`/api/minutes/${minutes.id}`),
  );
  const previewResponse = page.waitForResponse((response) => response.url().endsWith(`/minutes/${minutes.id}/preview`));
  await page.getByTestId("minutes-preview").click();
  expect((await previewResponse).status()).toBe(200);
  await expect(page.getByTestId("minutes-document-dialog")).toBeVisible();
  await expect(page.getByTestId("minutes-document-frame")).toBeVisible();
  const previewed = await sirenProperties<{ generatedAt: string | null; documentId: string | null; version: number }>(
    await page.request.get(`/api/minutes/${minutes.id}`),
  );
  expect(previewed.generatedAt).toBeNull();
  expect(previewed.documentId).toBeNull();
  expect(previewed.version).toBe(beforePreview.version);
  await page.getByTestId("minutes-document-close").click();
  await expect(page.getByTestId("minutes-document-dialog")).toHaveCount(0);
  await expect(page.getByTestId("minutes-preview")).toBeFocused();
  await page.getByTestId("minutes-preview").click();
  await expect(page.getByTestId("minutes-document-frame")).toBeVisible();
  await page.getByTestId("minutes-document-close").press("Escape");
  await expect(page.getByTestId("minutes-document-dialog")).toHaveCount(0);
  await expect(page.getByTestId("minutes-preview")).toBeFocused();
  await expect(page.getByTestId(`minutes-section-${publicItem.id}`).getByTestId("editor-writing-area")).toBeEditable();
  await expect(page.getByTestId(`minutes-section-${publicItem.id}`)).toContainText("Additional correction retained");
  await page
    .getByTestId(`minutes-section-${secretItem.id}`)
    .getByTestId("editor-writing-area")
    .fill("Last correction after preview.");
  await expect(page.getByTestId("minutes-document-frame")).toHaveCount(0);
  await page.getByTestId("minutes-generate").click();
  await expect(page.getByTestId("minutes-document-dialog")).toBeVisible();
  await expect(page.getByTestId("minutes-document-frame")).toBeVisible();
  await page.getByTestId("minutes-document-close").click();
  await expect(page.getByTestId("minutes-document-frame")).toHaveCount(0);
  await expect(page.getByTestId("minutes-view-document")).toBeFocused();
  await expect(page.getByTestId("minutes-download")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("minutes-generated.png"), fullPage: true });
  await page.reload();
  await expect(page.getByTestId("minutes-view-document")).toBeVisible();
  await expect(page.getByTestId("minutes-document-frame")).toHaveCount(0);
  await page.getByTestId("minutes-view-document").click();
  await expect(page.getByTestId("minutes-document-dialog")).toBeVisible();
  await page.getByTestId("minutes-document-close").press("Escape");
  await expect(page.getByTestId("minutes-view-document")).toBeFocused();
  await expect(page.getByTestId(`minutes-section-${publicItem.id}`).getByTestId("editor-writing-area")).toHaveCount(0);
  const generated = await sirenProperties<{
    documentId: string;
    generatedAt: string;
    settledAt: string | null;
    version: number;
    facts: unknown;
    sections: { agendaItemId: string; content: string }[];
  }>(await page.request.get(`/api/minutes/${minutes.id}`));
  expect(generated.documentId).toBeTruthy();
  expect(generated.generatedAt).toBeTruthy();
  expect(generated.settledAt).toBeNull();
  expect(generated.facts).toEqual(beforeCorrection.facts);
  expect(generated.sections.find((section) => section.agendaItemId === secretItem.id)?.content).toContain(
    "Last correction after preview.",
  );
  const pdf = await page.request.get(`/api/minutes/${minutes.id}/content`);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const forbiddenEdit = await page.request.patch(`/api/minutes/${minutes.id}/draft`, {
    data: {
      expectedVersion: generated.version,
      agendaItemId: publicItem.id,
      content: "Must not overwrite generated minutes",
    },
  });
  expect(forbiddenEdit.status()).toBe(409);
  const approval = await sirenItems<{
    id: string;
    councilBusinessId: string | null;
    subject: { kind: string; minutesId?: string; documentId?: string };
  }>(await page.request.get(`/api/council-meetings/${nextMeeting!.id}/agenda-items`));
  expect(approval[0]).toMatchObject({
    councilBusinessId: null,
    subject: { kind: "minutesApproval", minutesId: minutes.id, documentId: generated.documentId },
  });

  // Use the genuinely provisioned next meeting and generated previous minutes.
  // A previous PV without quorum stays unresolved in this meeting; closure
  // must not submit that same PV to another vote in the next meeting.
  const nextId = nextMeeting!.id;
  await sirenProperties(
    await page.request.put(`/api/council-meetings/${nextId}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "E2E minutes without quorum" },
    }),
  );
  await sirenProperties(await page.request.post(`/api/council-meetings/${nextId}/notices`, { data: {} }));
  await page.goto(`/app/meetings/${nextId}/live`);
  for (const [index, member] of members.entries()) {
    await page.getByTestId(`live-attendance-${member.id}-${index < 7 ? "present" : "absent"}`).click();
  }
  await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  const nextOpening = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/record-opening"),
  );
  await page.getByTestId("live-meeting-start").click();
  const nextOpened = await sirenProperties<{ quorumObservations: Array<{ facts: { verdict: string } }> }>(
    await nextOpening,
  );
  expect(nextOpened.quorumObservations.at(-1)?.facts.verdict).toBe("notMet");
  const approvalId = approval[0]!.id;
  await page.getByTestId(`live-agenda-item-${approvalId}`).click();
  await expect(page.getByTestId(`live-agenda-item-${approvalId}`)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  await expect(page.getByTestId("live-ballot-open")).toBeHidden();
  await expect(page.getByTestId("conduct-blocker-continue-quorumNotMet")).toBeVisible();
  const refusedApproval = await page.request.post(`/api/council-meetings/${nextId}/agenda-items/${approvalId}/start`, {
    data: {},
  });
  expect(refusedApproval.status()).toBe(409);
  await page.getByTestId("live-agenda-adjourn").click();
  await expect(page.getByTestId("live-adjourn-dialog")).toBeVisible();
  const adjournment = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith(`/agenda-items/${approvalId}/adjourn`),
  );
  await page.getByTestId("live-adjourn-confirm").click();
  expect((await adjournment).status()).toBe(200);
  await expect(page.getByTestId("live-adjourn-dialog")).toBeHidden();
  const pendingApproval = await sirenProperties<{
    position: number;
    adjournedAt: string | null;
    completedAt: string | null;
  }>(await page.request.get(`/api/council-meetings/${nextId}/agenda-items/${approvalId}`));
  expect(pendingApproval.position).toBe(-1);
  expect(pendingApproval.adjournedAt).not.toBeNull();
  expect(pendingApproval.completedAt).toBeNull();
  const retainedAgenda = await sirenItems<{ id: string; position: number; subject: { kind: string } }>(
    await page.request.get(`/api/council-meetings/${nextId}/agenda-items`),
  );
  expect(retainedAgenda[0]).toMatchObject({ id: approvalId, position: -1 });
  expect(retainedAgenda.filter((item) => item.subject.kind === "minutesApproval")).toHaveLength(1);
  await expect(page.getByTestId("live-meeting-close")).toBeEnabled();
  const closure = await page.request.post(`/api/council-meetings/${nextId}/close`, {
    data: {},
  });
  const followingMeeting = await sirenProperties<{ nextMeeting: { id: string } }>(closure);
  const closed = await sirenProperties<{ closedAt: string | null; minutesId: string | null }>(
    await page.request.get(`/api/council-meetings/${nextId}`),
  );
  expect(closed.closedAt).not.toBeNull();
  expect(closed.minutesId).not.toBeNull();
  const followingAgenda = await sirenItems<{ subject: { kind: string; minutesId?: string } }>(
    await page.request.get(`/api/council-meetings/${followingMeeting.nextMeeting.id}/agenda-items`),
  );
  expect(followingAgenda.filter((item) => item.subject.kind === "minutesApproval")).toHaveLength(1);
  expect(followingAgenda[0]?.subject.minutesId).toBe(closed.minutesId);
  expect(followingAgenda.some((item) => item.subject.minutesId === minutes.id)).toBe(false);
  const stillUnsettled = await sirenProperties<{ settledAt: string | null }>(
    await page.request.get(`/api/minutes/${minutes.id}`),
  );
  expect(stillUnsettled.settledAt).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("minutes-without-quorum-reasons.png"), fullPage: true });
  expect(await sirenItems(await page.request.get(`/api/ballots?meetingId=${nextId}`))).toHaveLength(0);
  const documents = await sirenItems<{ id: string; councilMeetingId: string }>(
    await page.request.get("/api/council-decisions"),
  );
  const meetingDocuments = documents.filter((entry) => entry.councilMeetingId === meeting!.id);
  expect(meetingDocuments).toHaveLength(2);
  const outcomes: string[] = [];
  for (const document of meetingDocuments) {
    const original = await sirenProperties<{
      content: string;
      number: string | null;
      facts: { ballot: { mode: string; result: string } };
    }>(await page.request.get(`/api/council-decisions/${document.id}`));
    outcomes.push(`${original.facts.ballot.mode}:${original.facts.ballot.result}`);
    await page.goto(`/app/council-decisions/${document.id}`);
    await expect(page.getByTestId("decision-detail")).toBeVisible();
    const writing = page.getByTestId("decision-writing").getByTestId("editor-writing-area");
    await expect(writing).toBeVisible();
    await writing.fill(`${original.content}\n\nCorrection typographique.`);
    await expect
      .poll(
        async () =>
          (await sirenProperties<{ content: string }>(await page.request.get(`/api/council-decisions/${document.id}`)))
            .content,
      )
      .toContain("Correction typographique.");
    await page.getByTestId("decision-view").click();
    await expect(page.getByTestId("decision-document-dialog")).toBeVisible();
    const previewUrl = await page.getByTestId("decision-document-frame").getAttribute("src");
    expect(previewUrl).toBeTruthy();
    const previewPdf = await page.request.get(previewUrl!);
    expect(previewPdf.ok()).toBeTruthy();
    expect(previewPdf.headers()["content-type"]).toContain("application/pdf");
    await testInfo.attach(`decision-${original.facts.ballot.mode}-preview.pdf`, {
      body: await previewPdf.body(),
      contentType: "application/pdf",
    });
    await page.getByTestId("decision-document-close").click();
    await page.getByTestId("decision-freeze").click();
    await page.getByTestId("decision-freeze-confirm").click();
    await expect(page.getByTestId("decision-freeze-dialog")).toBeHidden();
    await expect(page.getByTestId("decision-writing")).toHaveCount(0);
    const frozen = await sirenProperties<{ state: string; facts: unknown; number: string | null }>(
      await page.request.get(`/api/council-decisions/${document.id}`),
    );
    expect(frozen.state).toBe("frozen");
    expect(frozen.facts).toEqual(original.facts);
    expect(frozen.number).toBe(original.number);
    await expect(page.getByTestId("decision-download")).toBeVisible();
    const downloadHref = await page.getByTestId("decision-download").getAttribute("href");
    const preserved = await page.request.get(downloadHref!);
    expect(preserved.ok()).toBeTruthy();
    expect(preserved.headers()["content-type"]).toContain("application/pdf");
    const preservedBytes = await preserved.body();
    await writeFile(testInfo.outputPath(`decision-${original.facts.ballot.mode}-frozen.pdf`), preservedBytes);
    expect(await (await page.request.get(downloadHref!)).body()).toEqual(preservedBytes);
    await testInfo.attach(`decision-${original.facts.ballot.mode}-frozen.pdf`, {
      body: preservedBytes,
      contentType: "application/pdf",
    });
    await page.getByTestId("decision-view").click();
    await expect(page.getByTestId("decision-document-dialog")).toBeVisible();
    expect(await page.getByTestId("decision-document-frame").getAttribute("src")).toBe(downloadHref);
    await page.getByTestId("decision-document-close").click();
    await expect(page.getByTestId("decision-document-dialog")).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath(`decision-${original.facts.ballot.mode}-frozen.png`),
      fullPage: true,
    });
  }
  expect(outcomes.sort()).toEqual(["public:approve", "secret:reject"]);
});

test("uploads a written proxy and selects the created documentary resource", async ({ appPage: page }) => {
  test.setTimeout(120_000);
  const meetings = await sirenItems<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((entry) => !entry.startedAt && !entry.closedAt)!;
  const members = await sirenItems<{ id: string }>(await page.request.get("/api/council-members"));
  await sirenProperties(
    await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60000).toISOString(), location: "Proxy test room" },
    }),
  );
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  await scheduleVotingItem(page, meeting.id, businesses[0]!.id, 1);
  await sirenProperties(await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} }));
  await page.goto(`/app/meetings/${meeting.id}/live`);
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId(`live-attendance-${members[1]!.id}-represented`).click();
  await page.getByTestId(`live-proxy-holder-${members[0]!.id}`).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("live-proxy-upload").click();
  const uploaded = page.waitForResponse(
    (response) => response.url().endsWith("/api/resources/documents") && response.request().method() === "POST",
  );
  await (await chooser).setFiles({
    name: "proxy-upload-regression.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const response = await uploaded;
  expect(response.status()).toBe(201);
  const document = await sirenProperties<{ id: string }>(response);
  await expect(page.getByTestId(`live-proxy-document-${document.id}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("live-proxy-confirm")).toBeEnabled();
  await page.getByTestId("live-proxy-confirm").click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeHidden();
  await expect(page.getByTestId(`live-attendance-${members[1]!.id}-represented`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId(`live-attendance-${members[1]!.id}-represented`).click();
  await expect(page.getByTestId(`live-proxy-document-${document.id}`)).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId(`live-attendance-${members[1]!.id}-represented`).click();
  await page.getByTestId(`live-proxy-holder-${members[0]!.id}`).click();
  let duplicateUploads = 0;
  await page.route("**/api/resources/documents", async (route) => {
    duplicateUploads++;
    await route.abort();
  });
  await page.getByTestId("live-proxy-file").setInputFiles({
    name: "proxy-upload-regression.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByTestId(`live-proxy-document-${document.id}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("live-proxy-confirm")).toBeEnabled();
  expect(duplicateUploads).toBe(0);
});

test("prepares a meeting through its general properties and follows it when its date changes", async ({
  appPage: page,
}) => {
  test.setTimeout(90_000);
  const meetings = await sirenItems<{
    id: string;
    number: number;
    startedAt: string | null;
    closedAt: string | null;
    chairMemberId: string | null;
    secretaryMemberId: string | null;
  }>(await page.request.get("/api/council-meetings"));
  const meeting = meetings.find(
    (candidate) =>
      !candidate.startedAt && !candidate.closedAt && !candidate.chairMemberId && !candidate.secretaryMemberId,
  )!;
  expect(meeting).toBeTruthy();
  const slug = (date: string) => `${date}-${String(meeting.number).padStart(3, "0")}`;
  const saveGeneralProperties = async (startsAt: string, officers: boolean) => {
    await page.getByTestId("meeting-edit-details").click();
    await page.getByTestId("meeting-edit-starts-at").fill(startsAt);
    if (officers) {
      await page.getByTestId("meeting-edit-chair").click();
      await page.getByRole("option").first().click();
      await page.getByTestId("meeting-edit-secretary").click();
      await page.getByRole("option").nth(1).click();
    }
    await page.getByTestId("meeting-edit-submit").click();
    await expect(page.getByTestId("meeting-edit-submit")).toBeHidden();
  };

  await page.goto(`/app/meetings/${meeting.id}`);
  await saveGeneralProperties("2026-12-03T12:00", false);
  await expect(page).toHaveURL(new RegExp(`/app/meetings/${slug("2026-12-03")}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("03/12/2026");

  await saveGeneralProperties("2026-12-10T12:00", true);
  await expect(page).toHaveURL(new RegExp(`/app/meetings/${slug("2026-12-10")}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("10/12/2026");
  const prepared = await sirenProperties<{ chairMemberId: string | null; secretaryMemberId: string | null }>(
    await page.request.get(`/api/council-meetings/${meeting.id}`),
  );
  expect(prepared.chairMemberId).toBeTruthy();
  expect(prepared.secretaryMemberId).toBeTruthy();

  await page.goto(`/app/meetings/${slug("2026-12-03")}`);
  await expect(page).toHaveURL(new RegExp(`/app/meetings/${slug("2026-12-10")}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("10/12/2026");
  await page.screenshot({ path: test.info().outputPath("meeting-followed-after-date-change.png") });
});

test("records the second convocation from the conduct of a meeting opened without quorum", async ({
  appPage: page,
}) => {
  test.setTimeout(150_000);
  const localInput = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const meetings = await sirenItems<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((item) => !item.startedAt && !item.closedAt)!;
  expect(meeting).toBeTruthy();
  await sirenProperties(
    await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "E2E second convocation room" },
    }),
  );
  const members = (
    await sirenItems<{ id: string; active: boolean }>(await page.request.get("/api/council-members"))
  ).filter((member) => member.active);
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  const proposal = await scheduleVotingItem(page, meeting.id, businesses[0]!.id, 1);
  await sirenProperties(await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} }));

  await page.goto(`/app/meetings/${meeting.id}/live`);
  for (const [index, member] of members.entries())
    await page.getByTestId(`live-attendance-${member.id}-${index < 4 ? "present" : "absent"}`).click();
  await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  const opening = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/record-opening"),
  );
  await page.getByTestId("live-meeting-start").click();
  const opened = await sirenProperties<{
    quorumObservations: Array<{ observedAt: string; facts: { verdict: string } }>;
  }>(await opening);
  const failure = opened.quorumObservations.at(-1)!;
  expect(failure.facts.verdict).toBe("notMet");

  // The notice is sent after the recorded failure, at a whole minute the form can express.
  const sentAt = new Date(Math.ceil((Date.parse(failure.observedAt) + 1) / 60_000) * 60_000);
  const renewedAt = new Date(sentAt.getTime() + 5 * 86_400_000);
  renewedAt.setHours(18, 30, 0, 0);
  await page.getByTestId("live-reconvocation-open").click();
  await expect(page.getByTestId("live-reconvocation-form")).toBeVisible();
  await expect(page.getByTestId("live-reconvocation-agenda")).toContainText(/\S/);
  await page.getByTestId("live-reconvocation-sent-at").fill(localInput(sentAt));
  await page.getByTestId("live-reconvocation-scheduled-at").fill(localInput(renewedAt));
  await page.getByTestId("live-reconvocation-first-evidence").fill("Convocation du conseil affichée en mairie");
  await page.getByTestId("live-reconvocation-renewed-evidence").fill("Seconde convocation remise aux conseillers");
  await page.screenshot({ path: test.info().outputPath("second-convocation-form.png") });
  await expect.poll(() => Date.now(), { timeout: 65_000, intervals: [1_000] }).toBeGreaterThan(sentAt.getTime());
  const recording = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/reconvocations"),
  );
  await page.getByTestId("live-reconvocation-submit").click();
  expect((await recording).ok()).toBeTruthy();
  await expect(page.getByTestId("live-reconvocation-form")).toBeHidden();
  await expect(page.getByTestId("live-reconvocation-open")).toHaveCount(0);
  const conduct = await sirenProperties<{
    reconvocations: Array<{ failedObservationId: string; agendaItemIds: string[]; scheduledAt: string }>;
    quorumObservations: Array<{ id: string; facts: { verdict: string } }>;
  }>(await page.request.get(`/api/council-meetings/${meeting.id}/conduct`));
  expect(conduct.reconvocations).toHaveLength(1);
  expect(conduct.reconvocations[0]!.failedObservationId).toBe(conduct.quorumObservations.at(-1)!.id);
  expect(conduct.reconvocations[0]!.agendaItemIds).toContain(proposal.id);
  expect(Date.parse(conduct.reconvocations[0]!.scheduledAt)).toBe(renewedAt.getTime());
});

// @verifies-requirement HALL-FR-NOT-130
test("holds the meeting after a second convocation as a new linked meeting under the second-convocation regime", async ({
  appPage: page,
}) => {
  test.setTimeout(180_000);
  const localInput = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const meetings = await sirenItems<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const first = meetings.find((item) => !item.startedAt && !item.closedAt)!;
  expect(first).toBeTruthy();
  // The reconvened meeting opens at least four days after the second convocation is sent,
  // so the first meeting is dated eight days ago.
  const firstDate = new Date(Date.now() - 8 * 86_400_000);
  firstDate.setHours(18, 30, 0, 0);
  const location = "E2E reconvened meeting room";
  await sirenProperties(
    await page.request.put(`/api/council-meetings/${first.id}/schedule`, {
      data: { scheduledAt: firstDate.toISOString(), location },
    }),
  );
  const members = (
    await sirenItems<{ id: string; active: boolean }>(await page.request.get("/api/council-members"))
  ).filter((member) => member.active);
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  const proposal = await scheduleVotingItem(page, first.id, businesses[0]!.id, 1);
  await sirenProperties(await page.request.post(`/api/council-meetings/${first.id}/notices`, { data: {} }));

  // Roll call without quorum and its finding: the server dates them now, then the fixture moves them to the first meeting.
  const attendance = members.map((member, index) => ({
    councilMemberId: member.id,
    status: index < 4 ? "present" : "absent",
  }));
  const opened = await sirenProperties<{ quorumObservations: Array<{ facts: { verdict: string } }> }>(
    await page.request.post(`/api/council-meetings/${first.id}/record-opening`, {
      data: {
        attendance,
        chairMemberId: members[0]!.id,
        secretaryMemberId: members[1]!.id,
      },
    }),
  );
  expect(opened.quorumObservations.at(-1)!.facts.verdict).toBe("notMet");
  await backdateMeetingConduct(first.id, new Date(firstDate.getTime() + 5 * 60_000));

  // Second convocation recorded from the conduct, then closure of the first meeting.
  const sentAt = new Date(firstDate.getTime() + 60 * 60_000);
  const renewedAt = new Date(sentAt.getTime() + 5 * 86_400_000);
  renewedAt.setHours(18, 30, 0, 0);
  await page.goto(`/app/meetings/${first.id}/live`);
  await page.getByTestId("live-reconvocation-open").click();
  await expect(page.getByTestId("live-reconvocation-form")).toBeVisible();
  await page.getByTestId("live-reconvocation-sent-at").fill(localInput(sentAt));
  await page.getByTestId("live-reconvocation-scheduled-at").fill(localInput(renewedAt));
  await page.getByTestId("live-reconvocation-first-evidence").fill("Convocation du conseil affichée en mairie");
  await page.getByTestId("live-reconvocation-renewed-evidence").fill("Seconde convocation remise aux conseillers");
  const recording = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/reconvocations"),
  );
  await page.getByTestId("live-reconvocation-submit").click();
  expect((await recording).ok()).toBeTruthy();
  await expect(page.getByTestId("live-reconvocation-open")).toHaveCount(0);
  await page.getByTestId("live-meeting-close").click();
  await page.getByTestId("live-meeting-close").click();
  await expect(page).not.toHaveURL(/\/live$/, { timeout: 30_000 });

  // The reconvened meeting is a new meeting, linked to the first one and dated by the second convocation.
  const conduct = await sirenProperties<{ reconvocations: Array<{ id: string }> }>(
    await page.request.get(`/api/council-meetings/${first.id}/conduct`),
  );
  const reconvened = (
    await sirenItems<{
      id: string;
      previousCouncilMeetingId: string | null;
      reconvocationId: string | null;
      scheduledAt: string | null;
      location: string | null;
    }>(await page.request.get("/api/council-meetings"))
  ).find((item) => item.previousCouncilMeetingId === first.id)!;
  expect(reconvened.reconvocationId).toBe(conduct.reconvocations[0]!.id);
  expect(Date.parse(reconvened.scheduledAt!)).toBe(renewedAt.getTime());
  expect(reconvened.location).toBe(location);
  const agenda = await sirenItems<{ id: string }>(
    await page.request.get(`/api/council-meetings/${reconvened.id}/agenda-items`),
  );
  expect(agenda.map((item) => item.id)).toContain(proposal.id);

  // Its own officers, notice and roll call; the opening applies the second-convocation regime.
  await sirenProperties(
    await page.request.put(`/api/council-meetings/${reconvened.id}/prepare`, {
      data: {
        scheduledAt: reconvened.scheduledAt,
        location,
        chairMemberId: members[0]!.id,
        secretaryMemberId: members[2]!.id,
      },
    }),
  );
  await sirenProperties(await page.request.post(`/api/council-meetings/${reconvened.id}/notices`, { data: {} }));
  await page.goto(`/app/meetings/${reconvened.id}`);
  await expect(page.getByTestId("meeting-reconvened-chip")).toBeVisible();
  const reconvenedDeadline = (
    await sirenProperties<{
      noticeDeadline: { status: string; deadline: { deadlineDate: string; clearDays: number } };
    }>(await page.request.get(`/api/council-meetings/${reconvened.id}`))
  ).noticeDeadline;
  expect(reconvenedDeadline).toMatchObject({ status: "determined", deadline: { clearDays: 3 } });
  await expect(page.getByTestId("meeting-notice-deadline")).toHaveAttribute("data-status", "determined");
  await expect(page.getByTestId("meeting-notice-deadline-date")).toContainText(
    new Date(`${reconvenedDeadline.deadline.deadlineDate}T12:00:00`).toLocaleDateString("en-GB"),
  );
  await expect(page.getByTestId("meeting-notice-deadline-date")).toContainText("3 clear days");
  await page.goto(`/app/meetings/${reconvened.id}/live`);
  for (const [index, member] of members.entries())
    await page.getByTestId(`live-attendance-${member.id}-${index < 4 ? "present" : "absent"}`).click();
  const opening = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/record-opening"),
  );
  await page.getByTestId("live-meeting-start").click();
  const reopened = await sirenProperties<{
    meeting: { secretaryMemberId: string };
    quorumObservations: Array<{ facts: { regime: string; verdict: string } }>;
  }>(await opening);
  expect(reopened.meeting.secretaryMemberId).toBe(members[2]!.id);
  expect(reopened.quorumObservations.at(-1)!.facts).toMatchObject({ regime: "secondConvocation", verdict: "exempt" });
  const started = await page.request.post(`/api/council-meetings/${reconvened.id}/agenda-items/${proposal.id}/start`, {
    data: {},
  });
  expect(started.ok()).toBeTruthy();

  // The minutes of the first meeting state the failed quorum and the second convocation.
  const firstMeeting = await sirenProperties<{ minutesId: string }>(
    await page.request.get(`/api/council-meetings/${first.id}`),
  );
  await page.goto(`/app/minutes/${firstMeeting.minutesId}`);
  await expect(page.getByTestId("minutes-opening-quorum")).toBeVisible();
  await expect(page.getByTestId("minutes-second-convocation")).toBeVisible();
});
