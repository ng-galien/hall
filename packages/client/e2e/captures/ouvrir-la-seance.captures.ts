import { test } from "./fixtures";
import { openMeeting } from "./journeys";

test.setTimeout(10 * 60_000);
test.use({ seedScenario: "preparation" });

test("ouvrir la séance : de la séance programmée à la séance ouverte", async ({ docsPage: page }) => {
  await openMeeting(page, "ouvrir-la-seance");
});
