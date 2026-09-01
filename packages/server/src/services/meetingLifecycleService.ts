import {
  type CouncilMeeting,
  councilBusinessAgendaProfile,
  isAttendanceComplete,
  type MeetingEvent,
  type MeetingStatus,
  transitionAgendaItem,
  transitionCouncilDecision,
  transitionMeeting,
  transitionMinutes,
} from "@hall/domain";
import type {
  AgendaItemRepository,
  AttendanceRepository,
  CouncilBusinessRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  CreateCouncilMeeting,
  MeetingRosterRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { agendaReadiness, followingCouncilMeeting } from "./agendaOrderPolicy.js";
import type { CouncilMeetingService } from "./councilMeetingService.js";
import { DomainError } from "./errors.js";
import { participationForMeeting, requireMeeting } from "./meetingContext.js";
import { renderMeetingMinutesDraft } from "./meetingMinutesDraft.js";
import type { MeetingPreparationService } from "./meetingPreparationService.js";
import { hasThreeClearDays } from "./reconvocationPolicy.js";

export interface MeetingLifecycleService {
  changeStatus(meetingId: string, status: MeetingStatus): Promise<CouncilMeeting>;
  recordQuorumFailure(meetingId: string): Promise<CouncilMeeting>;
  reconveneMeeting(previousMeetingId: string, input: CreateCouncilMeeting): Promise<CouncilMeeting>;
  finalizeMinutesDraft(meetingId: string): Promise<CouncilMeeting>;
}

export function createMeetingLifecycleService({
  councilMeetingRepository,
  councilMemberRepository,
  meetingRosterRepository,
  attendanceRepository,
  agendaItemRepository,
  councilDecisionRepository,
  councilBusinessRepository,
  councilMeetingService,
  meetingPreparationService,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  councilMemberRepository: CouncilMemberRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  agendaItemRepository: AgendaItemRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  councilMeetingService: CouncilMeetingService;
  meetingPreparationService: MeetingPreparationService;
  unitOfWork: UnitOfWork;
}): MeetingLifecycleService {
  const statusEvent = (status: MeetingStatus): MeetingEvent | null => {
    if (status === "scheduled") return { type: "SCHEDULE" };
    if (status === "inProgress") return { type: "OPEN" };
    if (status === "closed") return { type: "CLOSE" };
    if (status === "cancelled") return { type: "CANCEL" };
    return null;
  };

  const releaseOpenAgendaItems = async (meetingId: string, agendaStatus: "postponed" | "withdrawn") => {
    const agenda = await agendaItemRepository.listForMeeting(meetingId);
    const openItems = agenda.filter((item) => !item.completedAt);
    if (
      agendaStatus === "postponed" &&
      openItems.some((item) => councilBusinessAgendaProfile(item.business).role === "minutesApproval")
    ) {
      throw new DomainError("minutes_approval_required", 409);
    }
    for (const item of openItems) {
      const event = agendaStatus === "postponed" ? ({ type: "POSTPONE" } as const) : ({ type: "WITHDRAW" } as const);
      if (transitionAgendaItem(item.status, event) !== agendaStatus) throw new DomainError("agenda_inconsistent", 409);
      const councilDecisionId = councilBusinessAgendaProfile(item.business).councilDecisionId;
      if (councilDecisionId) {
        const decision = await councilDecisionRepository.find(councilDecisionId);
        const next = decision ? transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" }) : null;
        if (!decision || !next) throw new DomainError("agenda_inconsistent", 409);
        await councilDecisionRepository.setStatus(decision.id, next);
      }
    }
    if (openItems.length > 0) {
      await agendaItemRepository.completeOpenItems(meetingId, agendaStatus, new Date().toISOString());
    }
  };

  return {
    async changeStatus(meetingId, status) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        const event = statusEvent(status);
        if (!event || transitionMeeting(meeting.status, event) !== status) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (status === "cancelled" && meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (status === "scheduled") {
          const agendaItems = await agendaItemRepository.listForMeeting(id);
          const readiness = agendaReadiness(meeting, agendaItems, await councilMeetingRepository.list());
          if (!readiness.agendaReady) {
            throw new DomainError(
              readiness.requiredMinutesOfMeetingId ? "minutes_approval_required" : "agenda_order_invalid",
              409,
            );
          }
          const roster = await councilMemberRepository.listActive();
          if (roster.length === 0) throw new DomainError("meeting_roster_locked", 409);
          for (const officerId of [meeting.chairMemberId, meeting.secretaryMemberId]) {
            if (officerId && !roster.some((member) => member.id === officerId)) {
              throw new DomainError("council_member_not_found", 409);
            }
          }
          await meetingRosterRepository.snapshot(
            meeting.id,
            roster.map((member) => member.id),
          );
        }
        if (status === "inProgress") {
          const evidence = await participationForMeeting(meeting, meetingRosterRepository, attendanceRepository);
          if (!isAttendanceComplete(evidence)) throw new DomainError("attendance_incomplete", 409);
          if (!evidence.quorum.reached) throw new DomainError("quorum_not_reached", 409);
          if (meeting.quorumFailure || !meeting.chairMemberId || !meeting.secretaryMemberId) {
            throw new DomainError("meeting_officers_required", 409);
          }
          if (
            !evidence.rosterMemberIds.includes(meeting.chairMemberId) ||
            !evidence.rosterMemberIds.includes(meeting.secretaryMemberId)
          ) {
            throw new DomainError("meeting_officers_required", 409);
          }
          const physicallyPresentMemberIds = new Set(
            evidence.attendance.filter((item) => item.status === "present").map((item) => item.memberId),
          );
          if (
            !physicallyPresentMemberIds.has(meeting.chairMemberId) ||
            !physicallyPresentMemberIds.has(meeting.secretaryMemberId)
          ) {
            throw new DomainError("meeting_officers_required", 409);
          }
        }
        if (status === "closed") await releaseOpenAgendaItems(id, "postponed");
        if (status === "cancelled") await releaseOpenAgendaItems(id, "withdrawn");
        await councilMeetingRepository.setStatus(id, status);
        if (status === "closed" && meeting.status === "inProgress") {
          const draftStatus = transitionMinutes(meeting.minutesStatus, { type: "GENERATE_DRAFT" });
          if (draftStatus !== "draft") throw new DomainError("invalid_meeting_transition", 409);
          const aggregate = await councilMeetingService.getMeeting(id);
          const minutesDraft = renderMeetingMinutesDraft(aggregate, await councilMemberRepository.list());
          const existing = await councilBusinessRepository.findMinutesApprovalForMeeting(id);
          if (existing) {
            await councilBusinessRepository.update(existing.id, {
              title: existing.title,
              report: minutesDraft,
              folderPath: existing.folderPath,
              resourceIds: existing.resources.map((resource) => resource.id),
            });
          } else {
            await councilBusinessRepository.create({
              kind: "minutesApproval",
              minutesOfMeetingId: id,
              title: `Approbation du procès-verbal - ${meeting.startsAt.slice(0, 10)}`,
              report: minutesDraft,
              folderPath: "",
              resourceIds: [],
            });
          }
          await councilMeetingRepository.setMinutes(id, draftStatus, minutesDraft, new Date().toISOString());

          const nextMeeting = followingCouncilMeeting(await councilMeetingRepository.list(), meeting);
          if (nextMeeting?.status === "draft") {
            await meetingPreparationService.provisionFromPreviousMeeting(nextMeeting.id);
          }
        }
        return (await councilMeetingRepository.find(id))!;
      });
    },
    async recordQuorumFailure(meetingId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        if (meeting.status !== "scheduled" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const evidence = await participationForMeeting(meeting, meetingRosterRepository, attendanceRepository);
        if (!isAttendanceComplete(evidence)) {
          throw new DomainError("attendance_incomplete", 409);
        }
        if (evidence.quorum.reached) throw new DomainError("invalid_meeting_transition", 409);
        await agendaItemRepository.snapshotOpenItems(id);
        await councilMeetingRepository.recordQuorumFailure(id, {
          ...evidence,
          recordedAt: new Date().toISOString(),
        });
        return (await councilMeetingRepository.find(id))!;
      });
    },
    async reconveneMeeting(previousMeetingId, input) {
      return unitOfWork.execute(async () => {
        const previousMeeting = await requireMeeting(councilMeetingRepository, previousMeetingId);
        const sourceId = previousMeeting.id;
        if (previousMeeting.isReconvenedMeeting || previousMeeting.status !== "scheduled") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (!previousMeeting.quorumFailure || previousMeeting.quorumFailure.quorum.reached) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        if (
          !input.meetingNoticeSentAt ||
          Date.parse(input.meetingNoticeSentAt) < Date.parse(previousMeeting.quorumFailure.recordedAt) ||
          !hasThreeClearDays(input.meetingNoticeSentAt, input.startsAt)
        ) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const previousRoster = await meetingRosterRepository.listMemberIds(sourceId);
        for (const officerId of [input.chairMemberId, input.secretaryMemberId]) {
          if (officerId && !previousRoster.includes(officerId)) {
            throw new DomainError("council_member_not_found", 409);
          }
        }
        if (transitionMeeting(previousMeeting.status, { type: "CLOSE_AFTER_QUORUM_FAILURE" }) !== "closed") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        await councilMeetingRepository.setStatus(sourceId, "closed");
        const meeting = await councilMeetingRepository.create({
          ...input,
          isReconvenedMeeting: true,
          previousMeetingId: sourceId,
        });
        await meetingRosterRepository.copy(sourceId, meeting.id);
        await agendaItemRepository.completeOpenItems(sourceId, "postponed", new Date().toISOString());
        await agendaItemRepository.copy(sourceId, meeting.id);
        if (transitionMeeting(meeting.status, { type: "SCHEDULE" }) !== "scheduled") {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        await councilMeetingRepository.setStatus(meeting.id, "scheduled");
        return (await councilMeetingRepository.find(meeting.id))!;
      });
    },
    async finalizeMinutesDraft(meetingId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        if (meeting.status !== "closed") throw new DomainError("invalid_meeting_transition", 409);
        const nextMinutesStatus = transitionMinutes(meeting.minutesStatus, { type: "FINALIZE" });
        if (nextMinutesStatus !== "ready") throw new DomainError("invalid_meeting_transition", 409);
        const minutesApproval = await councilBusinessRepository.findMinutesApprovalForMeeting(meeting.id);
        if (minutesApproval?.kind !== "minutesApproval" || !minutesApproval.report.trim()) {
          throw new DomainError("minutes_not_ready", 409);
        }
        await councilMeetingRepository.setMinutes(
          meeting.id,
          nextMinutesStatus,
          minutesApproval.report,
          new Date().toISOString(),
        );

        const nextMeeting = followingCouncilMeeting(await councilMeetingRepository.list(), meeting);
        if (nextMeeting?.status === "draft") {
          await meetingPreparationService.provisionFromPreviousMeeting(nextMeeting.id);
        }
        return (await councilMeetingRepository.find(meeting.id))!;
      });
    },
  };
}
