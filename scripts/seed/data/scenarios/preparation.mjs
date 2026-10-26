import { daysFromNow } from "../common/dates.mjs";
import { seedFirstMeeting } from "./history.mjs";

export async function seedPreparation(api, fixture) {
  console.log("- Une séance close, puis la séance suivante en préparation");
  const { roster } = fixture;
  const { conduct, nextMeeting } = await seedFirstMeeting(api, fixture, {
    chair: roster.chair,
    secretary: roster.alternateSecretary,
  });
  await conduct.plan(nextMeeting, daysFromNow(10, 18, 0), [
    "secondDecision",
    "secretDecision",
    "preparedInformation",
    "pendingQuestion",
  ]);
  console.log(`  Séance en préparation, datée, cinq points : /app/meetings/${nextMeeting.id}`);
}
