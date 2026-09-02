import type { DatabaseConfig } from "../../core/config.js";
import { buildContainer } from "../../core/container.js";

export async function prepareBallotScenario(
  database: DatabaseConfig = { kind: "sqlite", path: ":memory:" },
  target: "councilDecision" | "agendaItem" = "councilDecision",
) {
  const container = buildContainer({ host: "127.0.0.1", port: 0, database, environment: "test" });
  const {
    contactRepository,
    councilMemberRepository,
    councilDecisionRepository,
    councilMeetingService,
    meetingPreparationService,
    meetingAgendaService,
    meetingLifecycleService,
    councilBusinessService,
    ballotService,
    ballotRepository,
  } = container.cradle;
  await container.cradle.sqlExecutor.ready();
  await container.cradle.councilTermRepository.updateActiveExpectedMemberCount(3);
  const members = await Promise.all(
    ["Alice", "Benoît", "Claire"].map(async (firstName) => {
      const contact = await contactRepository.create({
        firstName,
        lastName: "Martin",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
      return councilMemberRepository.create({
        contactId: contact.id,
        role: "councillor",
        termStartedOn: "2026-03-22",
      });
    }),
  );
  const councilDecision = await councilDecisionRepository.create({
    title: "Concurrent decision",
    draftText: "",
    legalityReviewRequired: true,
  });
  const meeting = await councilMeetingService.createMeeting({
    startsAt: "2026-09-10T18:30:00+02:00",
    location: "Council chamber",
    chairMemberId: members[0].id,
    secretaryMemberId: members[1].id,
  });
  const business = await councilBusinessService.create({
    kind: "matter",
    councilDecisionId: target === "councilDecision" ? councilDecision.id : null,
    title: "Concurrent decision",
    report: "",
    folderPath: "",
    resourceIds: [],
  });
  const agendaItem = await meetingPreparationService.scheduleBusiness(meeting.id, business.id, 1);
  await meetingLifecycleService.changeStatus(meeting.id, "scheduled");
  for (const member of members) {
    await meetingPreparationService.recordAttendance(meeting.id, { memberId: member.id, status: "present" });
  }
  await meetingLifecycleService.changeStatus(meeting.id, "inProgress");
  await meetingAgendaService.startItem(meeting.id, agendaItem.id);
  return {
    container,
    members,
    councilDecision,
    business,
    meeting,
    agendaItem,
    ballotService,
    ballotRepository,
    councilDecisionRepository,
  };
}
