import type {
  AgendaItem,
  AgendaItemRecusals,
  Ballot,
  BallotParticipation,
  BallotResultPreview,
  BallotVote,
  CloseCouncilMeeting,
  CompleteOpenQuestion,
  CouncilBusiness,
  CouncilBusinessResourceAssociation,
  CouncilBusinessResourceItem,
  CouncilBusinessWorkspaceItem,
  CouncilMeeting,
  CouncilMeetingClosure,
  CreateAndScheduleCouncilBusiness,
  CreateBallotResultPreview,
  CreateCouncilBusiness,
  CreatedAndScheduledCouncilBusiness,
  MeetingAttendance,
  MeetingConductWorkspace,
  PrepareCouncilMeeting,
  ProvisionInitialCouncilMeeting,
  RecordAgendaItemRecusal,
  RecordMeetingAttendance,
  RecordMeetingAttendanceEvents,
  RecordMeetingMembership,
  RecordMeetingQuorum,
  RecordMeetingReconvocation,
  ReorderCouncilAgenda,
  ReorderCouncilBusinessResources,
  ReprogramAgendaItem,
  ScheduleAgendaItem,
  ScheduleCouncilBusinessSubject,
  ScheduleCouncilMeeting,
  SetCouncilMeetingOfficers,
  StartAgendaItem,
  StartCouncilMeeting,
} from "@hall/api-contract";

export type CouncilClientFailure = "invalidResourceLocation" | "conflict";

export class CouncilClientError extends Error {
  constructor(
    readonly failure: CouncilClientFailure,
    options?: ErrorOptions,
  ) {
    super(failure, options);
    this.name = "CouncilClientError";
  }
}

export interface CouncilClient {
  createBallotResultPreview(input: CreateBallotResultPreview): Promise<BallotResultPreview>;
  openBallotResultPreview(id: string): Promise<BallotResultPreview | null>;
  confirmBallotResultPreview(id: string): Promise<Ballot>;

  meetingConduct(meetingId: string): Promise<MeetingConductWorkspace>;
  recordMeetingMembership(meetingId: string, input: RecordMeetingMembership): Promise<MeetingConductWorkspace>;
  recordMeetingAttendanceEvents(
    meetingId: string,
    input: RecordMeetingAttendanceEvents,
  ): Promise<MeetingConductWorkspace>;
  recordMeetingQuorum(meetingId: string, input: RecordMeetingQuorum): Promise<MeetingConductWorkspace>;
  recordMeetingReconvocation(meetingId: string, input: RecordMeetingReconvocation): Promise<MeetingConductWorkspace>;

  listBusinesses(): Promise<CouncilBusiness[]>;
  listBusinessWorkspaceItems(): Promise<CouncilBusinessWorkspaceItem[]>;
  openBusiness(id: string): Promise<CouncilBusiness | null>;
  createBusiness(input: CreateCouncilBusiness): Promise<CouncilBusiness>;
  listBusinessResources(businessId: string): Promise<CouncilBusinessResourceAssociation[]>;
  listBusinessResourceItems(businessIds: readonly string[]): Promise<CouncilBusinessResourceItem[]>;
  associateBusinessResource(businessId: string, resourceId: string): Promise<CouncilBusinessResourceAssociation>;
  dissociateBusinessResource(businessId: string, resourceId: string): Promise<CouncilBusinessResourceAssociation>;
  reorderBusinessResources(
    businessId: string,
    input: ReorderCouncilBusinessResources,
  ): Promise<CouncilBusinessResourceAssociation[]>;
  listBusinessAgendaItems(businessIds: readonly string[]): Promise<AgendaItem[]>;
  scheduleBusinessDecisionProposal(businessId: string, input: ScheduleCouncilBusinessSubject): Promise<AgendaItem>;
  scheduleBusinessOpenQuestion(businessId: string, input: ScheduleCouncilBusinessSubject): Promise<AgendaItem>;
  listMeetings(): Promise<CouncilMeeting[]>;
  provisionInitialMeeting(input: ProvisionInitialCouncilMeeting): Promise<CouncilMeeting>;
  openMeeting(id: string): Promise<CouncilMeeting | null>;
  scheduleMeeting(id: string, input: ScheduleCouncilMeeting): Promise<CouncilMeeting>;
  prepareMeeting(id: string, input: PrepareCouncilMeeting): Promise<CouncilMeeting>;
  setMeetingOfficers(id: string, input: SetCouncilMeetingOfficers): Promise<CouncilMeeting>;
  createAndScheduleBusiness(
    meetingId: string,
    input: CreateAndScheduleCouncilBusiness,
  ): Promise<CreatedAndScheduledCouncilBusiness>;
  startMeeting(id: string, input: StartCouncilMeeting): Promise<CouncilMeeting>;
  closeMeeting(id: string, input: CloseCouncilMeeting): Promise<CouncilMeetingClosure>;
  listAttendance(meetingId: string): Promise<MeetingAttendance[]>;
  recordAttendance(meetingId: string, input: RecordMeetingAttendance): Promise<MeetingAttendance[]>;
  agendaItemRecusals(id: string): Promise<AgendaItemRecusals>;
  recordAgendaItemRecusal(id: string, input: RecordAgendaItemRecusal): Promise<AgendaItemRecusals>;
  listAgenda(meetingId: string): Promise<AgendaItem[]>;
  openAgendaItem(id: string): Promise<AgendaItem | null>;
  scheduleAgendaItem(meetingId: string, input: ScheduleAgendaItem): Promise<AgendaItem>;
  adjournAgendaItem(id: string, input: import("@hall/api-contract").AdjournAgendaItem): Promise<AgendaItem>;
  deprogramAgendaItem(id: string): Promise<AgendaItem>;
  reprogramAgendaItem(id: string, input: ReprogramAgendaItem): Promise<AgendaItem>;
  reorderAgenda(meetingId: string, input: ReorderCouncilAgenda): Promise<AgendaItem[]>;
  startAgendaItem(id: string, input: StartAgendaItem): Promise<AgendaItem>;
  completeOpenQuestion(id: string, input: CompleteOpenQuestion): Promise<AgendaItem>;
  updateAgendaItemNotes(id: string, input: { discussionSummary: string }): Promise<AgendaItem>;
  listBallots(meetingId: string): Promise<Ballot[]>;
  openBallot(id: string): Promise<Ballot | null>;
  listBallotParticipations(ballotId: string): Promise<BallotParticipation[]>;
  listBallotVotes(ballotId: string): Promise<BallotVote[]>;
}
