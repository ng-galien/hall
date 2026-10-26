import { capture, expect, test } from "./fixtures";
import { prepareMeeting } from "./journeys";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

test("pouvoir écrit à l’appel : porteur et pièce", async ({ docsPage: page }) => {
  const journey = "convocation";
  await prepareMeeting(page);
  const response = await page.request.get("/api/council-members");
  const members = ((await response.json()) as { entities: Array<{ properties: { id: string } }> }).entities.map(
    (entity) => entity.properties.id,
  );
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId(`live-attendance-${members[1]}-represented`).click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeVisible();
  await capture(page, `${journey}/01-pouvoir-porteur`);
  await page.getByTestId(`live-proxy-holder-${members[0]}`).click();
  await capture(page, `${journey}/02-pouvoir-porteur-choisi`);
  await page.getByTestId("live-proxy-cancel").click();
  await expect(page.getByTestId("live-proxy-dialog")).toBeHidden();
});
