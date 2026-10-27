import { capture, expect, localDateTimeInput, test } from "./fixtures";
import { prepareMeeting } from "./journeys";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

test("séance sans quorum : constat, points bloqués, seconde convocation, clôture", async ({ docsPage: page }) => {
  const journey = "seconde-convocation";
  await prepareMeeting(page);

  const response = await page.request.get("/api/council-members");
  const members = ((await response.json()) as { entities: Array<{ properties: { id: string } }> }).entities.map(
    (entity) => entity.properties.id,
  );
  const meetings = (await (await page.request.get("/api/council-meetings")).json()) as {
    entities: Array<{ properties: { chairMemberId: string; secretaryMemberId: string } }>;
  };
  const officers = meetings.entities[0]?.properties;
  const present = new Set([officers?.chairMemberId, officers?.secretaryMemberId, ...members.slice(0, 2)]);
  for (const memberId of members) {
    await page.getByTestId(`live-attendance-${memberId}-${present.has(memberId) ? "present" : "absent"}`).click();
  }
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await capture(page, `${journey}/01-appel-sans-quorum`);

  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByText(/Quorum non atteint/).first()).toBeVisible();
  await capture(page, `${journey}/02-quorum-non-atteint`);

  await page.waitForTimeout(500);
  await capture(page, `${journey}/03-point-bloque`);

  await page.getByTestId("live-reconvocation-open").click();
  await expect(page.getByTestId("live-reconvocation-form")).toBeVisible();
  const renewedAt = new Date(Date.now() + 5 * 86_400_000);
  renewedAt.setHours(18, 30, 0, 0);
  await page.getByTestId("live-reconvocation-sent-at").fill(localDateTimeInput(new Date()));
  await page.getByTestId("live-reconvocation-scheduled-at").fill(localDateTimeInput(renewedAt));
  await page.getByTestId("live-reconvocation-first-evidence").fill("Convocation du 12 mars affichée en mairie");
  await page.getByTestId("live-reconvocation-renewed-evidence").fill("Seconde convocation remise aux conseillers");
  await capture(page, `${journey}/04-seconde-convocation`);
  await page.getByTestId("live-reconvocation-cancel").click();
  await expect(page.getByTestId("live-reconvocation-form")).toBeHidden();

  await page.getByTestId("live-meeting-close").click();
  await expect(page.getByTestId("live-meeting-close")).toContainText(/Confirmer|non examiné/);
  await capture(page, `${journey}/05-clore-avec-points-non-examines`);
  await page.getByTestId("live-meeting-close").click();
  await expect(page).not.toHaveURL(/\/live$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/06-seance-suivante-creee`);
});
