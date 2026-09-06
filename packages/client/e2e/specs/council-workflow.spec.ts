import type { APIResponse, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

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

async function declareRecusal(
  page: Page,
  memberId: string,
  basis: "personalInterest" | "designatedRepresentativeConflict",
) {
  await expect(page.getByTestId("recusal-submit")).toBeDisabled();
  await page.getByTestId("recusal-member").click();
  await page.getByTestId(`recusal-member-${memberId}`).click();
  await page.getByTestId(`recusal-basis-${basis}`).check();
  await page.getByTestId("recusal-submit").click();
  await expect(page.getByTestId("recusal-form")).toBeHidden();
  await expect(page.getByTestId(`agenda-item-recusal-${memberId}`)).toBeVisible();
}

test("conducts public and secret ballots and provisions the previous minutes approval", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(150_000);

  const meetings = await sirenItems<{
    id: string;
    slug: string;
    number: number;
    scheduledAt: string | null;
    startedAt: string | null;
    closedAt: string | null;
    previousCouncilMeetingId: string | null;
  }>(await page.request.get("/api/council-meetings"));
  const meeting = meetings.find(
    (candidate) => candidate.scheduledAt && !candidate.startedAt && !candidate.closedAt && candidate.slug,
  );
  expect(meeting).toBeTruthy();

  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  expect(businesses.length).toBeGreaterThanOrEqual(2);
  const publicItem = await scheduleVotingItem(page, meeting!.slug, businesses[0]!.id, 1);
  const secretItem = await scheduleVotingItem(page, meeting!.slug, businesses[1]!.id, 2);

  const deferredItem = await sirenProperties<{ id: string }>(
    await page.request.post(`/api/council-meetings/${meeting!.slug}/agenda-items`, {
      data: { kind: "openQuestion", councilBusinessId: businesses[0]!.id, position: 3 },
    }),
  );
  await page.goto(`/app/meetings/${meeting!.slug}`);
  await page.getByTestId(`agenda-item-expand-${publicItem.id}`).click();
  await page
    .getByTestId("agenda-proposal-editor")
    .getByTestId("editor-writing-area")
    .fill("Proposal text distinct from the report");
  await page.screenshot({ path: "/tmp/hall-preparation-connected.png", fullPage: true });
  await page.getByTestId("agenda-item-save").click();
  await expect(page.getByTestId("agenda-item-save")).toBeHidden();
  const proposal = await sirenProperties<{ subject: { textResourceId: string; content: string } }>(
    await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}`),
  );
  expect(proposal.subject.content).toContain("Proposal text distinct from the report");
  const business = await sirenProperties<{ reportResourceId: string }>(
    await page.request.get(`/api/council-business/${businesses[0]!.id}`),
  );
  expect(proposal.subject.textResourceId).not.toBe(business.reportResourceId);
  await page.goto(`/app/meetings/${meeting!.slug}/live`);
  await expect(page.getByTestId("live-meeting-page")).toBeVisible();
  await page.getByTestId("live-attendance-all-present").click();
  await expect(page.getByTestId("live-meeting-start")).toBeDisabled();
  const members = await sirenItems<{ id: string }>(await page.request.get("/api/council-members"));
  await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await page.getByTestId("live-meeting-start").click();

  await expect(page.getByTestId("live-agenda-item-" + publicItem.id)).toBeVisible();
  await page.getByTestId("live-agenda-item-" + publicItem.id).click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await declareRecusal(page, members[2]!.id, "personalInterest");
  const publicRecusals = await sirenProperties<{
    quorumImpact: { denominatorReduction: number };
    agendaItem: { startedAt: string | null };
  }>(await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}/recusals`));
  expect(publicRecusals.quorumImpact.denominatorReduction).toBe(0);
  expect(publicRecusals.agendaItem.startedAt).toBeNull();
  await page.getByTestId("live-agenda-start").click();
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
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-ballot-all-for").click();
  await expect(page.getByTestId("live-ballot-record")).toBeEnabled();
  await expect(page.getByTestId(`live-vote-member-${members[2]!.id}`)).toBeHidden();
  await page.getByTestId("live-opening").click();
  await expect(page.getByTestId("live-opening-summary")).toBeVisible();
  await expect(page.getByTestId("live-ballot-record")).toBeHidden();
  await page.getByTestId("live-agenda-toggle").click();
  await page.getByTestId("live-agenda-item-" + publicItem.id).click();
  await expect(page.getByTestId("live-opening-summary")).toBeHidden();
  await expect(page.getByTestId("live-ballot-record")).toBeEnabled();
  await expect(page.getByTestId("live-item-progress")).toBeVisible();
  await page.getByTestId("live-agenda-toggle").click();
  await page.getByTestId("live-ballot-record").click();
  await expect(page.getByTestId("live-ballot-result")).toBeVisible();
  await expect(page.getByTestId("live-ballot-result")).toContainText("Adopted");
  await expect(page.getByTestId("agenda-item-recusal-open")).toBeHidden();
  const lateRecusal = await page.request.post(
    `/api/council-meetings/${meeting!.slug}/agenda-items/${publicItem.id}/recusals`,
    {
      data: { councilMemberId: members[3]!.id, legalBasis: "personalInterest", declaredAt: new Date().toISOString() },
    },
  );
  expect(lateRecusal.status()).toBe(409);

  await page.getByTestId("live-agenda-item-" + secretItem.id).click();
  await page.getByTestId("live-agenda-start").click();
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-ballot-recusal").click();
  await declareRecusal(page, members[3]!.id, "designatedRepresentativeConflict");
  const secretRecusals = await sirenProperties<{ quorumImpact: { denominatorReduction: number } }>(
    await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${secretItem.id}/recusals`),
  );
  expect(secretRecusals.quorumImpact.denominatorReduction).toBe(1);
  await expect(page.getByTestId(`live-vote-member-${members[3]!.id}`)).toBeHidden();
  const memberCount = await page.getByTestId(/^live-vote-member-/).count();
  expect(memberCount).toBeGreaterThan(0);
  await page.getByTestId("live-ballot-mode-secret").click();
  await expect(page.getByTestId(`live-secret-participant-${members[3]!.id}`)).toBeHidden();
  await page.getByTestId(`live-secret-participant-${members[4]!.id}`).uncheck();
  for (let index = 0; index < memberCount - 1; index += 1) {
    await page.getByTestId("live-secret-votesFor-increment").click();
  }
  await expect(page.getByTestId("live-ballot-record")).toBeEnabled();
  await page.getByTestId("live-ballot-record").click();
  await expect(page.getByTestId("live-ballot-result")).toContainText("Adopted");

  await page.getByTestId("live-agenda-item-" + deferredItem.id).click();
  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  await expect(page.getByTestId("live-ballot-open")).toBeHidden();
  await page.getByTestId("live-agenda-actions").click();
  const adjournResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().endsWith(`/agenda-items/${deferredItem.id}/adjourn`),
  );
  await page.getByTestId("live-agenda-adjourn").click();
  expect((await adjournResponse).status()).toBe(200);
  await expect(page.getByTestId("live-agenda-item-" + deferredItem.id)).toContainText("Adjourned");
  const deferred = await sirenProperties<{ adjournedAt: string; completedAt: string | null }>(
    await page.request.get(`/api/council-meetings/${meeting!.slug}/agenda-items/${deferredItem.id}`),
  );
  expect(deferred.adjournedAt).toBeTruthy();
  expect(deferred.completedAt).toBeNull();
  await expect(page.getByTestId("live-meeting-close")).toBeEnabled();
  await page.getByTestId("live-meeting-close").click();
  await page.getByTestId("live-meeting-close").click();
  await expect(page.getByTestId("live-meeting-page")).toContainText("The meeting is closed");

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
  const narrativeEditor = page.getByTestId(`minutes-section-${publicItem.id}`).getByTestId("editor-writing-area");
  await expect(narrativeEditor).toContainText("Discussion recorded during the meeting.");
  await page.screenshot({ path: testInfo.outputPath("minutes-draft.png"), fullPage: true });
  await page.getByTestId("minutes-attendance-toggle").click();
  await expect(page.getByTestId("minutes-attendance")).toHaveAttribute("open", "");
  await page.getByTestId(`minutes-section-facts-toggle-${publicItem.id}`).click();
  await expect(page.getByTestId(`minutes-section-facts-${publicItem.id}`)).toHaveAttribute("open", "");
  await page.screenshot({ path: testInfo.outputPath("minutes-facts-expanded.png"), fullPage: true });
  await page.getByTestId("minutes-attendance-toggle").click();
  await page.getByTestId(`minutes-section-facts-toggle-${publicItem.id}`).click();
  await page.getByTestId("minutes-attendance-toggle").press("Enter");
  await expect(page.getByTestId("minutes-attendance")).toHaveAttribute("open", "");
  const disclosureBounds = await page.getByTestId("minutes-attendance").boundingBox();
  const disclosureContentBounds = await page.getByTestId("minutes-attendance-content").boundingBox();
  expect(disclosureBounds).not.toBeNull();
  expect(disclosureContentBounds).not.toBeNull();
  expect(disclosureContentBounds!.x).toBeGreaterThan(disclosureBounds!.x);
  await page.getByTestId("minutes-attendance-toggle").press("Space");
  await expect(page.getByTestId("minutes-attendance")).not.toHaveAttribute("open");
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
    version: number;
    facts: unknown;
    sections: { agendaItemId: string; content: string }[];
  }>(await page.request.get(`/api/minutes/${minutes.id}`));
  expect(generated.documentId).toBeTruthy();
  expect(generated.generatedAt).toBeTruthy();
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
    councilBusinessId: string | null;
    subject: { kind: string; minutesId?: string; documentId?: string };
  }>(await page.request.get(`/api/council-meetings/${nextMeeting!.id}/agenda-items`));
  expect(approval[0]).toMatchObject({
    councilBusinessId: null,
    subject: { kind: "minutesApproval", minutesId: minutes.id, documentId: generated.documentId },
  });
});
