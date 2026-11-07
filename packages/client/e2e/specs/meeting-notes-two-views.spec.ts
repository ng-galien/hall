import type { APIResponse, Page, Request } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface SirenItem<T> {
  properties: T;
}

interface SirenCollection<T> {
  entities: Array<SirenItem<T>>;
}

async function properties<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as SirenItem<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties;
}

async function items<T>(response: APIResponse): Promise<T[]> {
  const body = (await response.json()) as SirenCollection<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.entities.map((entity) => entity.properties);
}

/** Opens a meeting with every member present and one started agenda item of the given kind. */
async function openMeetingWithStartedItem(page: Page, kind: "openQuestion" | "councilDecisionProposal") {
  const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((candidate) => !candidate.startedAt && !candidate.closedAt);
  expect(meeting).toBeTruthy();
  const scheduled = await properties<{ slug: string }>(
    await page.request.put(`/api/council-meetings/${meeting!.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "Notes test room" },
    }),
  );
  const businesses = await items<{ id: string }>(await page.request.get("/api/council-business"));
  expect(businesses.length).toBeGreaterThanOrEqual(2);
  const item = await properties<{ id: string }>(
    await page.request.post(`/api/council-meetings/${scheduled.slug}/agenda-items`, {
      data: { kind, councilBusinessId: businesses[0]!.id, position: 1 },
    }),
  );
  await properties(
    await page.request.post(`/api/council-meetings/${scheduled.slug}/agenda-items`, {
      data: { kind: "openQuestion", councilBusinessId: businesses[1]!.id, position: 2 },
    }),
  );
  await page.goto(`/app/meetings/${scheduled.slug}`);
  await page.getByTestId("meeting-open-notice").click();
  await page.getByTestId("meeting-freeze-agenda").click();
  const noticeResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/notices"),
  );
  await page.getByTestId("meeting-generate-notice").click();
  expect((await noticeResponse).ok()).toBeTruthy();
  await page.goto(`/app/meetings/${scheduled.slug}/live`);
  await page.getByTestId("live-attendance-all-present").click();
  const members = await items<{ id: string }>(await page.request.get("/api/council-members"));
  await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
  await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
  await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
  await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await page.getByTestId("live-meeting-start").click();
  await page.getByTestId(`live-agenda-item-${item.id}`).click();
  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeHidden();
  return { slug: scheduled.slug, itemId: item.id };
}

/** Records the notes saves sent by one view, with the instant each one leaves. */
function recordNotesSaves(page: Page, itemId: string) {
  const saves: Array<{ at: number; body: { discussionSummary: string; clearConfirmed?: true } }> = [];
  page.on("request", (request: Request) => {
    if (request.method() === "PATCH" && request.url().endsWith(`/agenda-items/${itemId}/notes`))
      saves.push({ at: Date.now(), body: request.postDataJSON() });
  });
  return saves;
}

async function storedNotes(page: Page, slug: string, itemId: string) {
  const item = await properties<{ discussionSummary: string }>(
    await page.request.get(`/api/council-meetings/${slug}/agenda-items/${itemId}`),
  );
  return item.discussionSummary;
}

const typedNotes = "Le maire présente le projet. Deux conseillers demandent le coût total.";
const continuedNotes = " Le maire répond que le coût total est de 40 000 euros.";

async function typeNotes(page: Page, text: string) {
  const writingArea = page.getByTestId("live-agenda-notes").getByTestId("editor-writing-area");
  await writingArea.click();
  await writingArea.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page.keyboard.type(text);
}

async function twoViewsKeepTypedNotes(
  writer: Page,
  openReader: () => Promise<Page>,
  slug: string,
  itemId: string,
  readerOpensFirst: boolean,
) {
  const writerSaves = recordNotesSaves(writer, itemId);
  let reader: Page | null = null;
  let readerSaves: ReturnType<typeof recordNotesSaves> = [];
  const openReaderView = async () => {
    reader = await openReader();
    readerSaves = recordNotesSaves(reader, itemId);
    await reader.goto(`/app/meetings/${slug}/live`);
    await reader.getByTestId(`live-agenda-item-${itemId}`).click();
    await expect(reader.getByTestId("live-agenda-notes")).toBeVisible();
  };
  if (readerOpensFirst) {
    await openReaderView();
    await expect(reader!.getByTestId("live-agenda-notes").getByTestId("editor-writing-area")).toHaveText("");
  }
  await typeNotes(writer, typedNotes);
  await expect.poll(() => storedNotes(writer, slug, itemId)).toBe(typedNotes);
  if (!readerOpensFirst) await openReaderView();
  await expect(reader!.getByTestId("live-agenda-notes").getByTestId("editor-writing-area")).toHaveText(typedNotes);
  await typeNotes(writer, continuedNotes);
  const finalNotes = typedNotes + continuedNotes;
  await expect.poll(() => storedNotes(writer, slug, itemId)).toBe(finalNotes);
  await expect(reader!.getByTestId("live-agenda-notes").getByTestId("editor-writing-area")).toHaveText(finalNotes);

  await writer.waitForTimeout(15_000);
  expect(await storedNotes(writer, slug, itemId)).toBe(finalNotes);
  expect(readerSaves, "the view where nothing was typed sends no notes").toHaveLength(0);
  expect(writerSaves.length, "each typing pause leaves one save, not a cadence").toBeLessThanOrEqual(4);
  expect(writerSaves.every((save) => save.body.clearConfirmed === undefined)).toBe(true);
  expect(writerSaves.at(-1)?.body.discussionSummary).toBe(finalNotes);

  const completion = writer.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith(`/agenda-items/${itemId}/complete`),
  );
  await writer.getByTestId("live-agenda-complete").click();
  const completedAt = Date.now();
  expect((await completion).ok()).toBeTruthy();
  await writer.waitForTimeout(6_000);
  expect(await storedNotes(writer, slug, itemId)).toBe(finalNotes);
  expect(
    writerSaves.filter((save) => save.at >= completedAt),
    "no save leaves after completion",
  ).toHaveLength(0);
  expect(readerSaves, "the untouched view still sent nothing").toHaveLength(0);
}

// @verifies-requirement HALL-FR-MTG-380
test("two conduct views of one item keep the notes typed in one of them", async ({ appPage: writer, browser }) => {
  test.setTimeout(150_000);
  const { slug, itemId } = await openMeetingWithStartedItem(writer, "openQuestion");
  const readerContext = await browser.newContext();
  try {
    await twoViewsKeepTypedNotes(writer, () => readerContext.newPage(), slug, itemId, false);
  } finally {
    await readerContext.close();
  }
});

// @verifies-requirement HALL-FR-MTG-380
test("a second conduct view with an empty notes editor does not erase the notes typed elsewhere", async ({
  appPage: writer,
  browser,
}) => {
  test.setTimeout(150_000);
  const { slug, itemId } = await openMeetingWithStartedItem(writer, "openQuestion");
  const readerContext = await browser.newContext();
  try {
    await twoViewsKeepTypedNotes(writer, () => readerContext.newPage(), slug, itemId, true);
  } finally {
    await readerContext.close();
  }
});

// @verifies-requirement HALL-FR-BAL-350
test("a ballot preview stays confirmable when notes are saved before its confirmation", async ({ appPage: page }) => {
  test.setTimeout(150_000);
  const { slug, itemId } = await openMeetingWithStartedItem(page, "councilDecisionProposal");
  await typeNotes(page, typedNotes);
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-ballot-all-for").click();
  const previewResponse = page.waitForResponse(
    (entry) => entry.request().method() === "POST" && entry.url().endsWith("/ballot-previews"),
  );
  await page.getByTestId("live-ballot-preview-open").click();
  expect((await previewResponse).ok()).toBeTruthy();
  await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
  expect(await storedNotes(page, slug, itemId)).toBe(typedNotes);

  const laterNotes = `${typedNotes} Le vote est demandé.`;
  const notesSave = page.request.patch(`/api/council-meetings/${slug}/agenda-items/${itemId}/notes`, {
    data: { discussionSummary: laterNotes },
  });
  const confirmation = page.waitForResponse(
    (entry) => entry.request().method() === "POST" && /\/ballot-previews\/[^/]+\/confirm$/.test(entry.url()),
  );
  await page.getByTestId("live-ballot-preview-confirm").click();
  expect((await notesSave).ok()).toBeTruthy();
  expect((await confirmation).ok()).toBeTruthy();
  await expect(page.getByTestId("live-ballot-preview")).toBeHidden();
  await expect(page.getByTestId("live-ballot-result")).toBeVisible();
  expect(await storedNotes(page, slug, itemId)).toBe(laterNotes);
});

// @verifies-requirement HALL-FR-MTG-380
test("notes typed without a pause are kept when another conduct view completes the item", async ({
  appPage: writer,
  browser,
}) => {
  test.setTimeout(150_000);
  const { slug, itemId } = await openMeetingWithStartedItem(writer, "openQuestion");
  const chairContext = await browser.newContext();
  try {
    const chair = await chairContext.newPage();
    const chairSaves = recordNotesSaves(chair, itemId);
    await chair.goto(`/app/meetings/${slug}/live`);
    await chair.getByTestId(`live-agenda-item-${itemId}`).click();
    await expect(chair.getByTestId("live-agenda-complete")).toBeVisible();

    const writerSaves = recordNotesSaves(writer, itemId);
    const continuousNotes = `${typedNotes}${continuedNotes}${continuedNotes}`;
    await writer.getByTestId("live-agenda-notes").getByTestId("editor-writing-area").click();
    const typing = writer.keyboard.type(continuousNotes, { delay: 60 });
    await writer.waitForTimeout(1_500);
    const completion = chair.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith(`/agenda-items/${itemId}/complete`),
    );
    await chair.getByTestId("live-agenda-complete").click();
    expect((await completion).ok()).toBeTruthy();
    await typing;
    await expect(writer.getByTestId("live-agenda-notes")).toBeHidden();
    await expect
      .poll(async () => (await storedNotes(writer, slug, itemId)).length, { timeout: 15_000 })
      .toBeGreaterThan(10);
    const stored = await storedNotes(writer, slug, itemId);
    expect(continuousNotes.startsWith(stored), "the stored notes are the text typed before completion").toBe(true);
    expect(writerSaves.length).toBeGreaterThanOrEqual(1);
    expect(chairSaves, "the view that completed the item sent no notes").toHaveLength(0);
  } finally {
    await chairContext.close();
  }
});

// @verifies-requirement HALL-FR-MTG-380
test("notes whose saves failed are saved when another conduct view completes the item", async ({
  appPage: writer,
  browser,
}) => {
  test.setTimeout(150_000);
  const { slug, itemId } = await openMeetingWithStartedItem(writer, "openQuestion");
  let refused = 0;
  await writer.route(`**/agenda-items/${itemId}/notes`, async (route) => {
    if (route.request().method() === "PATCH" && refused < 2) {
      refused += 1;
      await route.abort();
      return;
    }
    await route.continue();
  });
  const chairContext = await browser.newContext();
  try {
    const chair = await chairContext.newPage();
    await chair.goto(`/app/meetings/${slug}/live`);
    await chair.getByTestId(`live-agenda-item-${itemId}`).click();
    await expect(chair.getByTestId("live-agenda-complete")).toBeVisible();

    await typeNotes(writer, typedNotes);
    await expect.poll(() => refused, { timeout: 10_000 }).toBe(1);
    await writer.getByTestId("live-item-title").click();
    await expect.poll(() => refused, { timeout: 10_000 }).toBe(2);
    expect(await storedNotes(writer, slug, itemId)).toBe("");

    await chair.getByTestId("live-agenda-complete").click();
    await expect(writer.getByTestId("live-agenda-notes")).toBeHidden();
    await expect.poll(() => storedNotes(writer, slug, itemId), { timeout: 15_000 }).toBe(typedNotes);
  } finally {
    await chairContext.close();
  }
});

// @verifies-requirement HALL-FR-MTG-380
test("notes typed just before a page reload are saved", async ({ appPage: page }) => {
  test.setTimeout(150_000);
  const { slug, itemId } = await openMeetingWithStartedItem(page, "openQuestion");
  await typeNotes(page, typedNotes);
  await page.reload();
  await expect.poll(() => storedNotes(page, slug, itemId), { timeout: 15_000 }).toBe(typedNotes);
});
