import type { Page } from "@playwright/test";
import { expect, signIn, switchAccount, test } from "../captures/fixtures";
import { prepareMeeting } from "../captures/journeys";
import { councillors, items, properties } from "./support";

test.setTimeout(4 * 60_000);
test.use({ seedScenario: "preparation" });

const proxyFile = {
  name: "pouvoir-ecrit.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  ),
};

interface Meeting {
  id: string;
  number: number;
  startedAt: string | null;
  closedAt: string | null;
}

/** The three previous meetings are past state, not the gesture under test: they are recorded through the API. */
async function holdMeetingWithProxy(
  page: Page,
  members: { id: string; role: string }[],
  represented: string,
  holder: string,
  proxyDocumentId: string,
  daysAgo: number,
) {
  const meeting = (await items<Meeting>(await page.request.get("/api/council-meetings"))).find(
    (entry) => !entry.startedAt && !entry.closedAt,
  )!;
  const scheduledAt = new Date(Date.now() - daysAgo * 86_400_000);
  const chair = members.find((member) => member.role === "mayor")!.id;
  const secretary = members.find((member) => member.role === "deputyMayor")!.id;
  await switchAccount(page, "secretariat");
  await properties(
    await page.request.put(`/api/council-meetings/${meeting.id}/prepare`, {
      data: {
        scheduledAt: scheduledAt.toISOString(),
        location: "Maison commune de l’oppidum",
        chairMemberId: chair,
        secretaryMemberId: secretary,
      },
    }),
  );
  await properties(await page.request.post(`/api/council-meetings/${meeting.id}/agenda-freeze`, { data: {} }));
  await properties(await page.request.post(`/api/council-meetings/${meeting.id}/notices`, { data: {} }));
  await switchAccount(page, "conduite");
  await properties(
    await page.request.post(`/api/council-meetings/${meeting.id}/record-opening`, {
      data: {
        observedAt: new Date(scheduledAt.getTime() + 5 * 60_000).toISOString(),
        chairMemberId: chair,
        secretaryMemberId: secretary,
        attendance: members.map((member) =>
          member.id === represented
            ? {
                councilMemberId: member.id,
                status: "represented",
                proxyHolderCouncilMemberId: holder,
                proxyDocumentId,
              }
            : { councilMemberId: member.id, status: "present" },
        ),
      },
    }),
  );
  await properties(
    await page.request.post(`/api/council-meetings/${meeting.id}/close`, {
      data: { closedAt: new Date(scheduledAt.getTime() + 60 * 60_000).toISOString() },
    }),
  );
  return meeting.number;
}

// @verifies-requirement HALL-FR-ATT-160
test("quatrième pouvoir consécutif refusé, puis accepté avec la maladie déclarée", async ({ docsPage: page }) => {
  const members = (
    await items<{ id: string; role: string; active: boolean }>(await page.request.get("/api/council-members"))
  ).filter((member) => member.active);
  const [represented, holder] = await councillors(page);
  const upload = await page.request.post("/api/resources/documents", {
    multipart: { name: proxyFile.name, path: "", file: proxyFile },
  });
  const proxyDocument = await properties<{ id: string }>(upload);
  let last = 0;
  for (const daysAgo of [30, 20, 10]) {
    last = await holdMeetingWithProxy(page, members, represented!.id, holder!.id, proxyDocument.id, daysAgo);
  }

  await signIn(page, "secretariat", "/app/");
  await prepareMeeting(page, undefined, last + 1);
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId(`live-attendance-${represented!.id}-represented`).click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeVisible();
  await page.getByTestId(`live-proxy-holder-${holder!.id}`).click();
  await page.getByTestId("live-proxy-file").setInputFiles(proxyFile);
  await expect(page.getByTestId(`live-proxy-document-${proxyDocument.id}`)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("live-proxy-exception-none").check();
  await page.getByTestId("live-proxy-confirm").click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeHidden();
  await page.getByTestId("live-meeting-start").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ce pouvoir a déjà servi aux trois séances consécutives" }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();

  await page.getByTestId(`live-attendance-${represented!.id}-represented`).click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeVisible();
  await page.getByTestId(`live-proxy-holder-${holder!.id}`).click();
  await page.getByTestId(`live-proxy-document-${proxyDocument.id}`).click();
  await page.getByTestId("live-proxy-exception-illness").check();
  await page.getByTestId("live-proxy-confirm").click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeHidden();
  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeVisible();
});
