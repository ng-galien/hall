import { seedFirstMeeting } from "./history.mjs";

export async function seedPreparation(api, fixture) {
  console.log("- Une séance close, puis la séance suivante en préparation");
  const { roster } = fixture;
  const { conduct, nextMeeting } = await seedFirstMeeting(api, fixture, {
    chair: roster.chair,
    secretary: roster.alternateSecretary,
  });
  await conduct.plan(nextMeeting, null, ["secondDecision", "secretDecision", "preparedInformation", "pendingQuestion"]);
  console.log(`  Séance en préparation, sans date, cinq points : /app/meetings/${nextMeeting.id}`);
}
