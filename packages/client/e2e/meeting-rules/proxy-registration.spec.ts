import type { Page } from "@playwright/test";
import { expect, signIn, test } from "../captures/fixtures";
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

/** Chooses `file` through the upload control `control`, as the person does from the file picker. */
async function uploadThrough(page: Page, control: string, file: ReturnType<typeof signedProxy>) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId(control).click();
  await (await chooser).setFiles(file);
}

// @verifies-requirement HALL-FR-ATT-190
test("pouvoir écrit téléversé par le secrétaire de séance avant la séance et à l'appel, téléversement absent sans droit d'enregistrer un pouvoir", async ({
  docsPage: page,
}) => {
  const [grantor, holder, lateGrantor, lateHolder] = await councillors(page);
  await prepareMeeting(page);
  const slug = new URL(page.url()).pathname.split("/").at(-2)!;
  // The secretary of the meeting conducts it and registers its proxies, without the right to create a document.
  const refusedDocument = signedProxy("pouvoir-refuse.pdf");
  expect(
    (
      await page.request.post("/api/resources/documents", {
        multipart: {
          name: refusedDocument.name,
          path: "",
          file: refusedDocument,
        },
      })
    ).ok(),
  ).toBeFalsy();

  await page.goto(`/app/meetings/${slug}`);
  const section = page.getByTestId("meeting-proxies");
  await expect(section).toBeVisible();
  await page.getByTestId("meeting-proxy-register").click();
  const dialog = page.getByTestId("meeting-proxy-dialog");
  await expect(dialog).toBeVisible();
  await chooseMember(page, "meeting-proxy-registration-grantor", grantor!.id);
  await chooseMember(page, "meeting-proxy-registration-holder", holder!.id);
  await uploadThrough(page, "meeting-proxy-registration-upload", signedProxy("pouvoir-avant-seance.pdf"));
  await expect(page.getByTestId("meeting-proxy-registration-document")).toContainText("pouvoir-avant-seance.pdf");
  await page.getByTestId("meeting-proxy-registration-submit").click();
  await expect(dialog).toBeHidden();
  await expect(section.getByTestId(`meeting-proxy-${grantor!.id}`)).toContainText("pouvoir-avant-seance.pdf");

  await page.getByTestId("meeting-enter-live").click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId(`live-attendance-${lateGrantor!.id}-represented`).click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeVisible();
  await page.getByTestId(`live-proxy-holder-${lateHolder!.id}`).click();
  await uploadThrough(page, "live-proxy-upload", signedProxy("pouvoir-a-l-appel.pdf"));
  const lateDocument = page.getByTestId(/^live-proxy-document-/).filter({ hasText: "pouvoir-a-l-appel.pdf" });
  await expect(lateDocument).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("live-proxy-confirm").click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeHidden();
  await expect(page.getByTestId(`live-attendance-${lateGrantor!.id}-represented`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId(`live-attendance-${grantor!.id}-represented`)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeVisible();

  const conduct = await properties<{
    currentAttendance: Array<{
      councilMemberId: string;
      status: string;
      proxyDocumentId: string | null;
    }>;
    proxyRegistrations: Array<{
      grantorCouncilMemberId: string;
      proxyDocumentId: string;
    }>;
  }>(await page.request.get(`/api/council-meetings/${slug}/conduct`));
  const registeredDocumentId = conduct.proxyRegistrations.find(
    (registration) => registration.grantorCouncilMemberId === grantor!.id,
  )!.proxyDocumentId;
  const lateAttendance = conduct.currentAttendance.find((entry) => entry.councilMemberId === lateGrantor!.id)!;
  expect(lateAttendance.status).toBe("represented");

  // The secretariat finds both written proxies filed at the root of the workspace, where the proxies are kept.
  await signIn(page, "secretariat", `/app/meetings/${slug}`);
  for (const [id, name] of [
    [registeredDocumentId, "pouvoir-avant-seance.pdf"],
    [lateAttendance.proxyDocumentId!, "pouvoir-a-l-appel.pdf"],
  ] as const) {
    expect(
      await properties<{ name: string; path: string }>(await page.request.get(`/api/resources/${id}`)),
    ).toMatchObject({ name, path: "" });
  }

  // The secretariat registers no proxy for this meeting: neither the registration nor the upload is offered to it.
  await expect(page.getByTestId("meeting-proxies")).toBeVisible();
  await expect(page.getByTestId("meeting-proxy-register")).toHaveCount(0);
  await expect(page.getByTestId("meeting-proxy-registration-upload")).toHaveCount(0);
  const refusedUpload = signedProxy("pouvoir-secretariat.pdf");
  expect(
    (
      await page.request.post(`/api/council-meetings/${slug}/proxy-documents`, {
        multipart: { file: refusedUpload },
      })
    ).ok(),
  ).toBeFalsy();
});
