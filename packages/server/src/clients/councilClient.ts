import type {
  AddOpenQuestion,
  AgendaItem,
  AgendaItemRecusals,
  Ballot,
  BallotParticipation,
  BallotResultPreview,
  BallotVote,
  CloseCouncilMeeting,
  CompleteAgendaItem,
  CouncilBusiness,
  CouncilBusinessBundleManifest,
  CouncilBusinessCommitteeLink,
  CouncilBusinessResourceAssociation,
  CouncilBusinessResourceItem,
  CouncilBusinessWorkspaceItem,
  CouncilCommitteeBusinessLink,
  CouncilMeeting,
  CouncilMeetingClosure,
  CreateAndScheduleCouncilBusiness,
  CreateBallotResultPreview,
  CreateCouncilBusiness,
  CreatedAndScheduledCouncilBusiness,
  DeclareMeetingAuxiliaryAttendance,
  MeetingAttendance,
  MeetingConductWorkspace,
  MeetingDocumentResourceDetail,
  PrepareCouncilMeeting,
  ProvisionInitialCouncilMeeting,
  RecordAgendaItemPresidency,
  RecordAgendaItemRecusal,
  RecordMeetingAttendance,
  RecordMeetingAttendanceEvents,
  RecordMeetingOfficerChange,
  RecordMeetingOpening,
  RecordMeetingQuorum,
  RecordMeetingReconvocation,
  ReorderCouncilAgenda,
  ReorderCouncilBusinessResources,
  ReprogramAgendaItem,
  ScheduleAgendaItem,
  ScheduleCouncilBusinessSubject,
  ScheduleCouncilMeeting,
  SetCouncilMeetingOfficers,
  StaleCouncilMeetingResult,
  StartAgendaItem,
} from "@hall/api-contract";
import type {
  CreatePreparedCouncilSubject,
  MeetingAgendaFreeze,
  MeetingDocuments,
  MeetingNotice,
  MeetingNoticeFacts,
  MeetingNoticeMeetingFacts,
  PreparedCouncilSubject,
  SchedulePreparedCouncilSubject,
} from "@hall/contracts";

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
  meetingDocuments(id: string): Promise<MeetingDocuments>;
  meetingDocumentResource(id: string, resourceId: string): Promise<MeetingDocumentResourceDetail | null>;
  meetingDocumentContent(
    id: string,
    resourceId: string,
    assetId?: string | null,
  ): Promise<{ content: Buffer; mediaType: string } | null>;

  listPreparedSubjects(meetingId?: string | null, businessId?: string | null): Promise<PreparedCouncilSubject[]>;
  openPreparedSubject(id: string, kind: PreparedCouncilSubject["kind"]): Promise<PreparedCouncilSubject | null>;
  createPreparedSubject(businessId: string, input: CreatePreparedCouncilSubject): Promise<PreparedCouncilSubject>;
  schedulePreparedSubject(meetingId: string, input: SchedulePreparedCouncilSubject): Promise<AgendaItem>;

  reopenAgenda(id: string): Promise<CouncilMeeting>;
  freezeAgenda(id: string): Promise<CouncilMeeting>;
  openAgendaFreeze(id: string): Promise<MeetingAgendaFreeze | null>;
  noticeFacts(id: string): Promise<MeetingNoticeMeetingFacts | null>;
  listNotices(id: string): Promise<MeetingNotice[]>;
  openNotice(id: string): Promise<MeetingNotice | null>;
  generateNotice(id: string, facts: MeetingNoticeFacts, content: Buffer): Promise<MeetingNotice>;
  noticeContent(id: string): Promise<Buffer | null>;

  createBallotResultPreview(input: CreateBallotResultPreview): Promise<BallotResultPreview>;
  openBallotResultPreview(id: string): Promise<BallotResultPreview | null>;
  confirmBallotResultPreview(id: string): Promise<Ballot>;

  addOpenQuestion(meetingId: string, input: AddOpenQuestion): Promise<AgendaItem>;
  meetingConduct(meetingId: string): Promise<MeetingConductWorkspace>;
  recordMeetingAttendanceEvents(
    meetingId: string,
    input: RecordMeetingAttendanceEvents,
  ): Promise<MeetingConductWorkspace>;
  recordMeetingQuorum(meetingId: string, input: RecordMeetingQuorum): Promise<MeetingConductWorkspace>;
  recordMeetingReconvocation(meetingId: string, input: RecordMeetingReconvocation): Promise<MeetingConductWorkspace>;
  recordMeetingOfficerChange(meetingId: string, input: RecordMeetingOfficerChange): Promise<MeetingConductWorkspace>;
  declareMeetingAuxiliaryAttendance(
    meetingId: string,
    input: DeclareMeetingAuxiliaryAttendance,
  ): Promise<MeetingConductWorkspace>;

  listBusinesses(): Promise<CouncilBusiness[]>;
  listBusinessWorkspaceItems(): Promise<CouncilBusinessWorkspaceItem[]>;
  openBusiness(id: string): Promise<CouncilBusiness | null>;
  createBusiness(input: CreateCouncilBusiness): Promise<CouncilBusiness>;
  deleteBusiness(id: string): Promise<CouncilBusiness>;
  listBusinessCommittees(businessId: string): Promise<CouncilBusinessCommitteeLink[]>;
  listCommitteeBusinesses(committeeId: string): Promise<CouncilCommitteeBusinessLink[]>;
  associateBusinessCommittee(businessId: string, committeeId: string): Promise<CouncilBusinessCommitteeLink>;
  dissociateBusinessCommittee(businessId: string, committeeId: string): Promise<CouncilBusinessCommitteeLink>;
  importBusinessBundle(input: {
    manifest: CouncilBusinessBundleManifest;
    files: Record<string, string>;
    path: string;
  }): Promise<CouncilBusiness>;
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
  recordMeetingOpening(id: string, input: RecordMeetingOpening): Promise<MeetingConductWorkspace>;
  // TODO REMOVE_STALE: temporary transition.
  markMeetingStale(id: string): Promise<StaleCouncilMeetingResult>;
  closeMeeting(id: string, input: CloseCouncilMeeting): Promise<CouncilMeetingClosure>;
  listAttendance(meetingId: string): Promise<MeetingAttendance[]>;
  recordAttendance(meetingId: string, input: RecordMeetingAttendance): Promise<MeetingAttendance[]>;
  agendaItemRecusals(id: string): Promise<AgendaItemRecusals>;
  recordAgendaItemRecusal(id: string, input: RecordAgendaItemRecusal): Promise<AgendaItemRecusals>;
  recordAgendaItemPresidency(id: string, input: RecordAgendaItemPresidency): Promise<AgendaItemRecusals>;
  listAgenda(meetingId: string): Promise<AgendaItem[]>;
  openAgendaItem(id: string): Promise<AgendaItem | null>;
  scheduleAgendaItem(meetingId: string, input: ScheduleAgendaItem): Promise<AgendaItem>;
  adjournAgendaItem(id: string, input: import("@hall/api-contract").AdjournAgendaItem): Promise<AgendaItem>;
  deprogramAgendaItem(id: string): Promise<AgendaItem>;
  reprogramAgendaItem(id: string, input: ReprogramAgendaItem): Promise<AgendaItem>;
  reorderAgenda(meetingId: string, input: ReorderCouncilAgenda): Promise<AgendaItem[]>;
  startAgendaItem(id: string, input: StartAgendaItem): Promise<AgendaItem>;
  completeAgendaItem(id: string, input: CompleteAgendaItem): Promise<AgendaItem>;
  updateAgendaItemNotes(id: string, input: { discussionSummary: string }): Promise<AgendaItem>;
  listBallots(meetingId: string): Promise<Ballot[]>;
  openBallot(id: string): Promise<Ballot | null>;
  listBallotParticipations(ballotId: string): Promise<BallotParticipation[]>;
  listBallotVotes(ballotId: string): Promise<BallotVote[]>;
}
