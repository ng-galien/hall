import type { Page } from "@playwright/test";
import { expect, test } from "../captures/fixtures";
import { prepareMeeting } from "../captures/journeys";
import { councillors, properties } from "./support";

test.setTimeout(4 * 60_000);
test.use({ seedScenario: "preparation" });

const signedProxy = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(
    `%PDF-1.4\n% ${name}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  ),
});

async function chooseMember(page: Page, field: string, memberId: string) {
  await page.getByTestId(field).click();
  await page
    .getByTestId(`${field}-search-result`)
    .and(page.locator(`[data-reference-id="${memberId}"]`))
    .click();
}

/** Fills the registration window: the member who gives the proxy, the member who receives it and the stored scan. */
async function fillRegistration(page: Page, grantorId: string, holderId: string, scan: { id: string; name: string }) {
  await page.getByTestId("meeting-proxy-register").click();
  const dialog = page.getByTestId("meeting-proxy-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("meeting-proxy-registration-submit")).toBeDisabled();
  await chooseMember(page, "meeting-proxy-registration-grantor", grantorId);
  await chooseMember(page, "meeting-proxy-registration-holder", holderId);
  await page.getByTestId("meeting-proxy-registration-document").click();
  await page.getByTestId("meeting-proxy-registration-document-search-input").fill(scan.name);
  await page
    .getByTestId("meeting-proxy-registration-document-search-result")
    .and(page.locator(`[data-reference-id="${scan.id}"]`))
    .click();
  await expect(page.getByTestId("meeting-proxy-registration-document")).toContainText(scan.name);
  await expect(page.getByTestId("meeting-proxy-registration-submit")).toBeEnabled();
  return dialog;
}

// @verifies-requirement HALL-FR-ATT-190
test("pouvoir enregistré avant la séance avec sa pièce, second pouvoir du même porteur refusé, retrait, appel prérempli", async ({
  docsPage: page,
}) => {
  const [grantor, holder, other] = await councillors(page);
  // The secretariat files the signed scans; the meeting secretary registers the proxies before the opening.
  const storeScan = async (name: string) => ({
    name,
    ...(await properties<{ id: string }>(
      await page.request.post("/api/resources/documents", {
        multipart: { name, path: "", file: signedProxy(name) },
      }),
    )),
  });
  const firstScan = await storeScan("pouvoir-premier.pdf");
  const secondScan = await storeScan("pouvoir-second.pdf");
  await prepareMeeting(page);
  const slug = new URL(page.url()).pathname.split("/").at(-2)!;
  await page.goto(`/app/meetings/${slug}`);
  const section = page.getByTestId("meeting-proxies");
  await expect(section).toBeVisible();

  let dialog = await fillRegistration(page, grantor!.id, holder!.id, firstScan);
  await page.getByTestId("meeting-proxy-registration-submit").click();
  await expect(dialog).toBeHidden();
  await expect(section.getByTestId(`meeting-proxy-${grantor!.id}`)).toBeVisible();
  await expect(section.getByTestId(`meeting-proxy-${grantor!.id}`)).toContainText("pouvoir-premier.pdf");

  dialog = await fillRegistration(page, other!.id, holder!.id, secondScan);
  await page.getByTestId("meeting-proxy-registration-submit").click();
  await expect(dialog.getByRole("alert")).toContainText("Ce conseiller porte déjà un pouvoir pour cette séance");
  await page.getByTestId("meeting-proxy-registration-cancel").click();
  await expect(dialog).toBeHidden();
  await expect(section.getByTestId(`meeting-proxy-${other!.id}`)).toHaveCount(0);

  await page.getByTestId(`meeting-proxy-withdraw-${grantor!.id}`).click();
  await expect(page.getByTestId("meeting-proxy-withdraw-dialog")).toBeVisible();
  await page.getByTestId("meeting-proxy-withdraw-confirm").click();
  await expect(page.getByTestId("meeting-proxy-withdraw-dialog")).toBeHidden();
  await expect(section.getByTestId(`meeting-proxy-${grantor!.id}`)).toHaveCount(0);

  dialog = await fillRegistration(page, other!.id, holder!.id, secondScan);
  await page.getByTestId("meeting-proxy-registration-submit").click();
  await expect(dialog).toBeHidden();
  await expect(section.getByTestId(`meeting-proxy-${other!.id}`)).toBeVisible();

  await page.getByTestId("meeting-enter-live").click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  const represented = page.getByTestId(`live-attendance-${other!.id}-represented`);
  await expect(represented).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`live-attendance-${grantor!.id}-represented`)).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("live-attendance-all-present").click();
  await expect(represented).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`live-attendance-${holder!.id}-present`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeVisible();

  const conduct = await properties<{
    currentAttendance: Array<{
      id: string;
      councilMemberId: string;
      status: string;
      proxyHolderAttendanceId: string | null;
    }>;
  }>(await page.request.get(`/api/council-meetings/${slug}/conduct`));
  const holderAttendance = conduct.currentAttendance.find((entry) => entry.councilMemberId === holder!.id);
  expect(conduct.currentAttendance.find((entry) => entry.councilMemberId === other!.id)).toMatchObject({
    status: "represented",
    proxyHolderAttendanceId: holderAttendance!.id,
  });
});
