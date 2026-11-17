import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";
import { type PdfTextRun, pdfTextRuns } from "../fixtures/pdfText";

test.use({ seedScenario: "minutes" });

interface MinutesProperties {
  id: string;
  generatedAt: string | null;
  facts: {
    meeting: { chair: { name: string } | null; secretary: { name: string } | null };
    agenda: { id: string; discussionSummary: string }[];
  };
  sections: { agendaItemId: string; content: string }[];
}

async function draftMinutes(page: Page): Promise<MinutesProperties> {
  const list = (await (await page.request.get("/api/minutes")).json()) as {
    entities: { properties: { id: string; generatedAt: string | null } }[];
  };
  const draft = list.entities.map((entity) => entity.properties).find((entry) => !entry.generatedAt);
  expect(draft, "The minutes scenario keeps a minutes draft").toBeTruthy();
  return minutesProperties(page, draft!.id);
}

async function minutesProperties(page: Page, id: string): Promise<MinutesProperties> {
  const response = await page.request.get(`/api/minutes/${id}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { properties: MinutesProperties }).properties;
}

async function savedSection(page: Page, minutesId: string, pointId: string) {
  return (await minutesProperties(page, minutesId)).sections.find((section) => section.agendaItemId === pointId)
    ?.content;
}

test.describe("minutes on a computer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // @verifies-requirement HALL-FR-MIN-250
  test("one command of the proceedings shows and hides the meeting notes of every point and the text is saved", async ({
    appPage: page,
  }) => {
    test.setTimeout(120_000);
    const minutes = await draftMinutes(page);
    const agenda = minutes.facts.agenda;
    expect(agenda.length).toBeGreaterThan(1);
    await page.goto(`/app/minutes/${minutes.id}`);
    await expect(page.getByTestId("minutes-detail")).toBeVisible();
    const toggle = page.getByTestId("minutes-source-notes-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId(/^minutes-source-notes-[0-9a-f]{8}-/)).toHaveCount(0);
    for (const point of agenda) await expect(page.getByTestId(`minutes-section-${point.id}`)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("minutes-notes-hidden.png") });

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    for (const point of agenda) await expect(page.getByTestId(`minutes-source-notes-${point.id}`)).toBeVisible();
    // Wide enough, the notes of a point stand beside its text.
    const first = agenda[0]!;
    const notes = (await page.getByTestId(`minutes-source-notes-${first.id}`).boundingBox())!;
    const text = (await page.getByTestId(`minutes-section-${first.id}`).boundingBox())!;
    expect(notes.x + notes.width).toBeLessThanOrEqual(text.x + 1);
    expect(Math.abs(notes.y - text.y)).toBeLessThan(40);
    await page.screenshot({ path: test.info().outputPath("minutes-notes-shown.png") });

    // The choice is kept by the browser for the screen.
    await page.reload();
    await expect(page.getByTestId("minutes-source-notes-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`minutes-source-notes-${first.id}`)).toBeVisible();

    await page.getByTestId("minutes-source-notes-toggle").click();
    await expect(page.getByTestId("minutes-source-notes-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId(/^minutes-source-notes-[0-9a-f]{8}-/)).toHaveCount(0);

    const written = "Rédaction écrite directement sous les faits du point.";
    await page.getByTestId(`minutes-section-${first.id}`).getByTestId("editor-writing-area").fill(written);
    await expect.poll(() => savedSection(page, minutes.id, first.id)).toContain(written);
    await expect(page.getByTestId(`minutes-section-save-status-${first.id}`)).toBeVisible();
    await expect(page.getByTestId(`minutes-restore-source-${first.id}`)).toBeVisible();
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("the meeting notes stand above the text of a point", async ({ appPage: page }) => {
      const minutes = await draftMinutes(page);
      const first = minutes.facts.agenda[0]!;
      await page.goto(`/app/minutes/${minutes.id}`);
      await page.getByTestId("minutes-source-notes-toggle").click();
      const notes = (await page.getByTestId(`minutes-source-notes-${first.id}`).boundingBox())!;
      const text = (await page.getByTestId(`minutes-section-${first.id}`).boundingBox())!;
      expect(notes.y + notes.height).toBeLessThanOrEqual(text.y + 1);
      await page.getByTestId(`minutes-point-${first.id}`).evaluate((point) => point.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: test.info().outputPath("tablet-notes-shown.png") });
    });
  });
});

test.describe("minutes on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // @verifies-requirement HALL-FR-MIN-250
  test("a point is written on its own screen, the next point follows and the back command returns to the minutes", async ({
    appPage: page,
  }) => {
    test.setTimeout(120_000);
    const minutes = await draftMinutes(page);
    const agenda = minutes.facts.agenda;
    expect(agenda.length).toBeGreaterThan(1);
    const [first, second] = [agenda[0]!, agenda[1]!];
    await page.goto(`/app/minutes/${minutes.id}`);
    await expect(page.getByTestId("minutes-detail")).toBeVisible();
    // The minutes are read: no editor is open and no notes command stands in the proceedings.
    await expect(page.getByTestId(`minutes-editorial-text-${first.id}`)).toBeVisible();
    await expect(page.getByTestId(`minutes-section-${first.id}`)).toHaveCount(0);
    await expect(page.getByTestId("minutes-source-notes-toggle")).toHaveCount(0);

    await page.getByTestId(`minutes-point-edit-${first.id}`).click();
    const writing = page.getByTestId("minutes-point-writing");
    await expect(writing).toBeVisible();
    await expect(page.getByTestId("minutes-point-writing-previous")).toBeDisabled();
    const area = page.getByTestId(`minutes-section-${first.id}`).getByTestId("editor-writing-area");
    await expect(area).toBeEditable();
    // The text takes the height of the screen under the title and the commands of the point.
    const editorBox = (await page.getByTestId(`minutes-section-${first.id}`).boundingBox())!;
    expect(editorBox.height).toBeGreaterThan(844 * 0.5);
    await page.screenshot({ path: test.info().outputPath("phone-point-writing.png") });

    await page.getByTestId("minutes-point-writing-notes").click();
    const notes = page.getByTestId(`minutes-source-notes-${first.id}`);
    await expect(notes).toBeVisible();
    const notesBox = (await notes.boundingBox())!;
    expect(notesBox.y + notesBox.height).toBeLessThanOrEqual(
      (await page.getByTestId(`minutes-section-${first.id}`).boundingBox())!.y + 1,
    );
    await page.screenshot({ path: test.info().outputPath("phone-point-writing-notes.png") });
    await page.getByTestId("minutes-point-writing-notes").click();
    await expect(notes).toHaveCount(0);

    const firstText = "Rédaction du premier point au téléphone.";
    await area.fill(firstText);
    await expect(page.getByTestId(`minutes-section-save-status-${first.id}`)).toBeVisible();
    await expect(page.getByTestId(`minutes-restore-source-${first.id}`)).toBeVisible();
    await page.getByTestId("minutes-point-writing-next").click();
    await expect(page.getByTestId(`minutes-section-${second.id}`)).toBeVisible();
    await expect.poll(() => savedSection(page, minutes.id, first.id)).toContain(firstText);
    const secondText = "Rédaction du deuxième point au téléphone.";
    await page.getByTestId(`minutes-section-${second.id}`).getByTestId("editor-writing-area").fill(secondText);
    await expect(page.getByTestId("minutes-point-writing-previous")).toBeEnabled();

    await page.goBack();
    await expect(writing).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/minutes/${minutes.id}$`));
    await expect(page.getByTestId(`minutes-point-${second.id}`)).toBeInViewport();
    await expect.poll(() => savedSection(page, minutes.id, second.id)).toContain(secondText);
    await expect(page.getByTestId(`minutes-editorial-text-${second.id}`)).toContainText(secondText);
    await expect(page.getByTestId(`minutes-editorial-text-${first.id}`)).toContainText(firstText);
    await page.screenshot({ path: test.info().outputPath("phone-point-returned.png") });

    // « Terminé » closes the writing screen in the same way.
    await page.getByTestId(`minutes-point-edit-${first.id}`).click();
    await expect(writing).toBeVisible();
    await page.getByTestId("text-finish-editing").click();
    await expect(writing).toHaveCount(0);
    await expect(page.getByTestId(`minutes-point-${first.id}`)).toBeInViewport();
  });

  // @verifies-requirement HALL-FR-MIN-250
  test("the back arrow of the header ends the writing of a point on the minutes, a second press returns to the list", async ({
    appPage: page,
  }) => {
    test.setTimeout(120_000);
    const minutes = await draftMinutes(page);
    const [first, second] = [minutes.facts.agenda[0]!, minutes.facts.agenda[1]!];
    const listed = (await (await page.request.get("/api/minutes")).json()) as {
      entities: { properties: { id: string; councilMeetingId: string } }[];
    };
    const meetingId = listed.entities.find((entity) => entity.properties.id === minutes.id)!.properties
      .councilMeetingId;

    await page.goto("/app/minutes");
    await page.getByTestId(`minutes-open-${meetingId}`).click();
    await expect(page).toHaveURL(new RegExp(`/minutes/${minutes.id}$`));
    await expect(page.getByTestId("minutes-detail")).toBeVisible();
    const back = page.getByTestId("phone-header-back");

    await page.getByTestId(`minutes-point-edit-${first.id}`).click();
    const writing = page.getByTestId("minutes-point-writing");
    await expect(writing).toBeVisible();
    await page.getByTestId("minutes-point-writing-next").click();
    const secondText = "Rédaction terminée par la flèche du bandeau.";
    await page.getByTestId(`minutes-section-${second.id}`).getByTestId("editor-writing-area").fill(secondText);

    await back.click();
    await expect(writing).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/minutes/${minutes.id}$`));
    await expect(page.getByTestId("minutes-detail")).toBeVisible();
    await expect(page.getByTestId(`minutes-point-${second.id}`)).toBeInViewport();
    await expect.poll(() => savedSection(page, minutes.id, second.id)).toContain(secondText);
    await expect(page.getByTestId(`minutes-editorial-text-${second.id}`)).toContainText(secondText);
    await page.screenshot({ path: test.info().outputPath("phone-point-header-back.png") });

    await back.click();
    await expect(page).toHaveURL(/\/minutes$/);
    await expect(page.getByTestId("minutes-page")).toBeVisible();
  });
});

const qualities = ["maire", "adjoint au maire", "membre du conseil municipal"];

/** The run of the page that reads exactly the text. */
function exactRun(runs: PdfTextRun[], text: string): PdfTextRun {
  const run = runs.find((entry) => entry.text.trim() === text);
  expect(run, `« ${text} » is printed`).toBeTruthy();
  return run!;
}

/** The signatory block that starts with its office: the name, then the quality, under it at the same left edge. */
function signatory(runs: PdfTextRun[], office: string, name: string) {
  const heading = exactRun(runs, office);
  const column = runs.filter((run) => Math.abs(run.x - heading.x) < 4 && run.y < heading.y).sort((a, b) => b.y - a.y);
  expect(column[0]?.text.trim(), `${office}: name`).toBe(name);
  expect(qualities, `${office}: quality`).toContain(column[1]?.text.trim());
  return heading;
}

// @verifies-requirement HALL-FR-MIN-290
test("the minutes are signed by the meeting secretary on the left and the meeting chair on the right, the decision by the secretary on the left and the mayor on the right", async ({
  appPage: page,
}) => {
  test.setTimeout(180_000);
  const minutes = await draftMinutes(page);
  const preview = await page.request.get(`/api/minutes/${minutes.id}/preview`, { timeout: 120_000 });
  expect(preview.ok()).toBeTruthy();
  const minutesPdf = await preview.body();
  writeFileSync(test.info().outputPath("proces-verbal.pdf"), minutesPdf);
  const pages = await pdfTextRuns(minutesPdf);
  const text = pages
    .flat()
    .map((run) => run.text)
    .join(" ");
  expect(text).toContain("Président de séance :");
  expect(text).toContain("Secrétaire de séance :");
  expect(text).not.toContain("Présidence");
  expect(text).not.toContain("Secrétariat");
  const last = pages.at(-1)!;
  const secretary = signatory(last, "Le secrétaire de séance", minutes.facts.meeting.secretary!.name);
  const chair = signatory(last, "Le président de séance", minutes.facts.meeting.chair!.name);
  expect(secretary.x).toBeLessThan(chair.x);
  expect(Math.abs(secretary.y - chair.y)).toBeLessThan(2);

  const decisions = (await (await page.request.get("/api/council-decisions")).json()) as {
    entities: { properties: { id: string } }[];
  };
  const decision = decisions.entities[0]!.properties;
  const decisionResponse = await page.request.get(`/api/council-decisions/${decision.id}/preview.pdf`, {
    timeout: 120_000,
  });
  expect(decisionResponse.ok()).toBeTruthy();
  const decisionPdf = await decisionResponse.body();
  writeFileSync(test.info().outputPath("deliberation.pdf"), decisionPdf);
  const decisionLast = (await pdfTextRuns(decisionPdf)).at(-1)!;
  const decisionSecretary = exactRun(decisionLast, "Le secrétaire de séance");
  const mayor = exactRun(decisionLast, "Le maire");
  expect(decisionSecretary.x).toBeLessThan(mayor.x);
  expect(Math.abs(decisionSecretary.y - mayor.y)).toBeLessThan(2);
});
