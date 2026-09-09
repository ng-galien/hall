import type { PostgresCouncil, PostgresCouncilRequest } from "../../src/council.js";

/** Persist a real notice through the public boundary; PDF rendering is tested separately. */
export async function prepareMeetingNotice(
  council: PostgresCouncil,
  request: PostgresCouncilRequest,
  meetingId: string,
): Promise<void> {
  await council.freezeAgenda(request, meetingId);
  const facts = await council.noticeFacts(request, meetingId);
  if (!facts) throw new Error("A prepared meeting must expose its frozen notice facts");
  await council.generateNotice(
    request,
    meetingId,
    { issuedOn: null, meeting: facts, hall: { name: "Fixture commune", timeZone: "Europe/Paris" } },
    Buffer.from("%PDF-fixture"),
  );
}
