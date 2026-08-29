import {
  type AgendaItem,
  type Attendance,
  type CouncilMeeting,
  type MeetingStatus,
  transitionCouncilDecision,
} from "@hall/domain";
import type {
  AgendaItemRepository,
  AttendanceRepository,
  CouncilBusinessRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CreateCouncilBusiness,
  MeetingRosterRepository,
  RecordAttendance,
  ResourceRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { agendaReadiness, isPartialAgendaValid, normalizedAgendaItemIds } from "./agendaOrderPolicy.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

export interface MeetingPreparationService {
  recordAttendance(meetingId: string, input: RecordAttendance): Promise<Attendance>;
  scheduleBusiness(meetingId: string, businessId: string, position: number): Promise<AgendaItem>;
  createLateBusiness(meetingId: string, input: CreateCouncilBusiness): Promise<AgendaItem>;
  removeAgendaItem(meetingId: string, itemId: string): Promise<void>;
  reorderAgenda(meetingId: string, itemIds: string[]): Promise<void>;
  setOfficers(meetingId: string, chairMemberId: string, secretaryMemberId: string): Promise<CouncilMeeting>;
}

export function createMeetingPreparationService({
  councilMeetingRepository,
  meetingRosterRepository,
  attendanceRepository,
  councilDecisionRepository,
  agendaItemRepository,
  resourceRepository,
  councilBusinessRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  meetingRosterRepository: MeetingRosterRepository;
  attendanceRepository: AttendanceRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  agendaItemRepository: AgendaItemRepository;
  resourceRepository: ResourceRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  unitOfWork: UnitOfWork;
}): MeetingPreparationService {
  const requireComposableMeeting = async (meetingId: string) => {
    const meeting = await requireMeeting(councilMeetingRepository, meetingId);
    if (
      meeting.isReconvenedMeeting ||
      meeting.quorumFailure ||
      !(["draft", "scheduled"] as MeetingStatus[]).includes(meeting.status)
    ) {
      throw new DomainError("agenda_inconsistent", 409);
    }
    return meeting;
  };

  const scheduleExistingBusiness = async (
    meetingId: string,
    businessId: string,
    position: number,
    addedDuringSession = false,
  ) => {
    const business = await councilBusinessRepository.find(businessId);
    if (!business) throw new DomainError("council_business_not_found", 404);
    const openOccurrence = (await agendaItemRepository.listForBusiness(business.id)).find((item) =>
      ["scheduled", "inProgress"].includes(item.status),
    );
    if (openOccurrence) {
      throw new DomainError("agenda_inconsistent", 409);
    }
    const currentAgenda = await agendaItemRepository.listForMeeting(meetingId);
    if (business.kind === "minutesApproval") {
      const meeting = await requireMeeting(councilMeetingRepository, meetingId);
      const readiness = agendaReadiness(meeting, currentAgenda, await councilMeetingRepository.list());
      if (
        !readiness.requiredMinutesOfMeetingId ||
        business.minutesOfMeetingId !== readiness.requiredMinutesOfMeetingId ||
        currentAgenda.some((item) => item.business.kind === "minutesApproval")
      ) {
        throw new DomainError("agenda_order_invalid", 409);
      }
    }
    if (business.kind === "matter" && business.councilDecisionId) {
      const decision = await councilDecisionRepository.find(business.councilDecisionId);
      if (!decision) throw new DomainError("agenda_inconsistent", 409);
      const nextDecisionStatus = transitionCouncilDecision(decision.status, { type: "SCHEDULE" });
      if (nextDecisionStatus !== "scheduled") throw new DomainError("agenda_inconsistent", 409);
      await councilDecisionRepository.setStatus(decision.id, nextDecisionStatus);
    }
    const appendedPosition = Math.max(0, ...currentAgenda.map((item) => item.position)) + 1;
    const created = await agendaItemRepository.create(meetingId, {
      businessId: business.id,
      position: appendedPosition,
      addedDuringSession,
    });
    const preferredAgenda = [...currentAgenda];
    preferredAgenda.splice(Math.max(0, Math.min(position - 1, preferredAgenda.length)), 0, created);
    const normalizedIds = normalizedAgendaItemIds(
      preferredAgenda.map((item, index) => ({ ...item, position: index + 1 })),
    );
    await agendaItemRepository.reorder(meetingId, normalizedIds);
    return (await agendaItemRepository.find(meetingId, created.id))!;
  };
  return {
    async recordAttendance(meetingId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        if (!(["scheduled", "inProgress"] as MeetingStatus[]).includes(meeting.status) || meeting.quorumFailure) {
          throw new DomainError("meeting_roster_locked", 409);
        }
        const memberIds = new Set(await meetingRosterRepository.listMemberIds(id));
        if (!memberIds.has(input.memberId)) throw new DomainError("council_member_not_found", 404);
        if (input.status === "represented") {
          if (!input.proxyHolderMemberId || input.proxyHolderMemberId === input.memberId) {
            throw new DomainError("proxy_invalid");
          }
          if (!memberIds.has(input.proxyHolderMemberId)) throw new DomainError("proxy_invalid");
          const proxyDocument = input.proxyDocumentId ? await resourceRepository.find(input.proxyDocumentId) : null;
          if (
            proxyDocument?.kind !== "document" ||
            proxyDocument.category !== "proxy" ||
            proxyDocument.meetingId !== id
          ) {
            throw new DomainError("proxy_invalid");
          }
        }
        const result = await attendanceRepository.record(id, input);
        if (result.status === "versionConflict") throw new DomainError("conflict", 409);
        if (result.status === "proxyHolderConflict" || result.status === "proxyDocumentConflict") {
          throw new DomainError("proxy_invalid");
        }
        return result.attendance;
      });
    },
    async scheduleBusiness(meetingId, businessId, position) {
      return unitOfWork.execute(async () => {
        const meeting = await requireComposableMeeting(meetingId);
        return scheduleExistingBusiness(meeting.id, businessId, position);
      });
    },
    async createLateBusiness(meetingId, input) {
      return unitOfWork.execute(async () => {
        if (input.kind === "minutesApproval" || (input.kind === "matter" && Boolean(input.councilDecisionId))) {
          throw new DomainError("invalid_request");
        }
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        if (meeting.status !== "inProgress" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        for (const resourceId of input.resourceIds) {
          if (!(await resourceRepository.findMetadata(resourceId))) throw new DomainError("resource_not_found", 404);
        }
        const currentAgenda = await agendaItemRepository.listForMeeting(id);
        if (
          input.kind === "matter" &&
          currentAgenda.some((item) => item.business.kind === "openQuestion" && item.startedAt)
        ) {
          throw new DomainError("agenda_order_invalid", 409);
        }
        const business = await councilBusinessRepository.create(input);
        const position = Math.max(0, ...currentAgenda.map((item) => item.position)) + 1;
        return scheduleExistingBusiness(id, business.id, position, true);
      });
    },
    async removeAgendaItem(meetingId, itemId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireComposableMeeting(meetingId);
        const id = meeting.id;
        const item = await agendaItemRepository.find(id, itemId);
        if (!item) throw new DomainError("agenda_item_not_found", 404);
        if (item.status !== "scheduled") {
          throw new DomainError("agenda_inconsistent", 409);
        }
        const business = item.business;
        if (business.kind === "matter" && business.councilDecisionId) {
          const decision = await councilDecisionRepository.find(business.councilDecisionId);
          const next = decision ? transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" }) : null;
          if (decision && next) await councilDecisionRepository.setStatus(decision.id, next);
        }
        await agendaItemRepository.remove(id, itemId);
        const remaining = await agendaItemRepository.listForMeeting(id);
        if (
          meeting.status === "scheduled" &&
          !agendaReadiness(meeting, remaining, await councilMeetingRepository.list()).agendaReady
        ) {
          throw new DomainError("minutes_approval_required", 409);
        }
        await agendaItemRepository.reorder(
          id,
          remaining.map((item) => item.id),
        );
      });
    },
    async reorderAgenda(meetingId, itemIds) {
      return unitOfWork.execute(async () => {
        const meeting = await requireComposableMeeting(meetingId);
        const id = meeting.id;
        const agenda = await agendaItemRepository.listForMeeting(id);
        const knownIds = new Set(agenda.map((item) => item.id));
        const uniqueIds = new Set(itemIds);
        if (
          agenda.length !== itemIds.length ||
          uniqueIds.size !== itemIds.length ||
          itemIds.some((itemId) => !knownIds.has(itemId))
        ) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        const orderedAgenda = itemIds.map((itemId) => agenda.find((item) => item.id === itemId)!);
        if (!isPartialAgendaValid(orderedAgenda)) throw new DomainError("agenda_order_invalid", 409);
        if (
          meeting.status === "scheduled" &&
          !agendaReadiness(meeting, orderedAgenda, await councilMeetingRepository.list()).agendaReady
        ) {
          throw new DomainError("minutes_approval_required", 409);
        }
        await agendaItemRepository.reorder(id, itemIds);
      });
    },
    async setOfficers(meetingId, chairMemberId, secretaryMemberId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireMeeting(councilMeetingRepository, meetingId);
        const id = meeting.id;
        if (meeting.status !== "scheduled" || meeting.quorumFailure) {
          throw new DomainError("invalid_meeting_transition", 409);
        }
        const rosterMemberIds = await meetingRosterRepository.listMemberIds(id);
        if (!rosterMemberIds.includes(chairMemberId) || !rosterMemberIds.includes(secretaryMemberId)) {
          throw new DomainError("council_member_not_found", 404);
        }
        await councilMeetingRepository.setOfficers(id, chairMemberId, secretaryMemberId);
        return (await councilMeetingRepository.find(id))!;
      });
    },
  };
}
