import type {
  AgendaItem,
  AgendaItemRecusals,
  RecordAgendaItemRecusal,
  Ballot,
  BallotParticipation,
  BallotVote,
  CloseCouncilMeeting,
  CompleteBallot,
  CompleteOpenQuestion,
  CouncilBusiness,
  CouncilBusinessResourceItem,
  CouncilBusinessResourceAssociation,
  CouncilBusinessWorkspaceItem,
  CouncilMeeting,
  CouncilMeetingClosure,
  CreateBallot,
  CreateAndScheduleCouncilBusiness,
  CreatedAndScheduledCouncilBusiness,
  CreateCouncilBusiness,
  MeetingAttendance,
  ProvisionInitialCouncilMeeting,
  PrepareCouncilMeeting,
  RecordBallotVotes,
  RecordMeetingAttendance,
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
  createBallot(input: CreateBallot): Promise<Ballot>;
  recordBallotVotes(ballotId: string, input: RecordBallotVotes): Promise<BallotVote[]>;
  completeBallot(ballotId: string, input: CompleteBallot): Promise<Ballot>;
}
