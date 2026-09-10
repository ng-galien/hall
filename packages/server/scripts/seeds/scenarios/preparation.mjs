import { daysFromNow } from "../common/dates.mjs";

export async function seedPreparation({ post, put }, { meetingLocation }) {
  console.log("- Séance en préparation");
  const meeting = await post("/council-meetings", {});
  await put(`/council-meetings/${meeting.id}/schedule`, {
    scheduledAt: daysFromNow(65),
    location: meetingLocation,
  });
}
