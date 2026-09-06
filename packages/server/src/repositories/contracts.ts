import type {
  AgendaItem,
  Attendance,
  AttendanceStatus,
  Ballot,
  BallotMethod,
  BallotResult,
  BallotTarget,
  ContentTemplate,
  CouncilBusiness,
  CouncilDecision,
  CouncilDecisionListEntry,
  CouncilDecisionStatus,
  CouncilMeeting,
  HallSettings,
  MeetingStatus,
  ParticipationEvidence,
  QuorumFailureEvidence,
  VoteInput,
} from "@hall/domain";

export type SaveContentTemplate = Omit<ContentTemplate, "id" | "createdAt" | "updatedAt">;

export interface ContentTemplateRepository {
  list(): Promise<ContentTemplate[]>;
  find(id: string): Promise<ContentTemplate | null>;
  create(input: SaveContentTemplate): Promise<ContentTemplate>;
  update(id: string, input: SaveContentTemplate): Promise<ContentTemplate | null>;
  delete(id: string): Promise<boolean>;
}

export type UpdateHallSettings = Omit<HallSettings, "updatedAt">;

export interface HallSettingsRepository {
  get(): Promise<HallSettings>;
  update(input: UpdateHallSettings): Promise<HallSettings>;
}

export interface CreateCouncilMeeting {
  startsAt: string;
  location: string;
  chairMemberId?: string | null;
  secretaryMemberId?: string | null;
  meetingNoticeSentAt?: string | null;
  isReconvenedMeeting?: boolean;
  previousMeetingId?: string | null;
}

export interface CouncilMeetingRepository {
  list(): Promise<CouncilMeeting[]>;
  find(id: string): Promise<CouncilMeeting | null>;
  create(input: CreateCouncilMeeting): Promise<CouncilMeeting>;
  updateDetails(id: string, input: { startsAt: string; location: string }): Promise<void>;
  setStatus(id: string, status: MeetingStatus): Promise<void>;
  setOfficers(id: string, chairMemberId: string, secretaryMemberId: string): Promise<void>;
  recordQuorumFailure(id: string, evidence: QuorumFailureEvidence): Promise<void>;
  setMinutes(
    id: string,
    status: CouncilMeeting["minutesStatus"],
    content: string | null,
    occurredAt: string,
  ): Promise<void>;
}

export interface MeetingRosterRepository {
  listMemberIds(meetingId: string): Promise<string[]>;
  snapshot(meetingId: string, memberIds: string[]): Promise<void>;
  copy(sourceMeetingId: string, targetMeetingId: string): Promise<void>;
}

export interface RecordAttendance {
  memberId: string;
  status: AttendanceStatus;
  proxyHolderMemberId?: string | null;
  proxyDocumentId?: string | null;
  expectedVersion?: number | null;
}

export interface AttendanceRepository {
  listForMeeting(meetingId: string): Promise<Attendance[]>;
  isProxyDocumentUsed(resourceId: string): Promise<boolean>;
  record(meetingId: string, input: RecordAttendance): Promise<RecordAttendanceResult>;
}

export type RecordAttendanceResult =
  | { status: "recorded"; attendance: Attendance }
  | { status: "versionConflict" }
  | { status: "proxyHolderConflict" }
  | { status: "proxyDocumentConflict" };

export interface CreateAgendaItem {
  businessId: string;
  position: number;
  addedDuringSession?: boolean;
}

export type CreateCouncilBusiness =
  | {
      kind: "matter";
      councilDecisionId?: string | null;
      committeeId?: string | null;
      title: string;
      report: string;
      folderPath: string;
    }
  | {
      kind: "minutesApproval";
      minutesOfMeetingId: string;
      title: string;
      report: string;
      folderPath: string;
    }
  | {
      kind: "openQuestion";
      title: string;
      report: string;
      folderPath: string;
    };

export interface UpdateCouncilBusinessContent {
  title: string;
  report: string;
  folderPath: string;
  committeeId?: string | null;
}

export interface SaveCouncilBusiness extends UpdateCouncilBusinessContent {
  councilDecisionId?: string | null;
}

export interface CouncilBusinessRepository {
  list(filters?: { folderPath?: string }): Promise<CouncilBusiness[]>;
  hasFolderPathPrefix(folderPath: string): Promise<boolean>;
  renameFolder(sourcePath: string, targetPath: string, updatedAt: string): Promise<number>;
  find(id: string): Promise<CouncilBusiness | null>;
  findForCouncilDecision(councilDecisionId: string): Promise<CouncilBusiness | null>;
  findMinutesApprovalForMeeting(meetingId: string): Promise<CouncilBusiness | null>;
  create(input: CreateCouncilBusiness): Promise<CouncilBusiness>;
  update(id: string, input: SaveCouncilBusiness): Promise<CouncilBusiness>;
}

export interface AgendaItemRepository {
  listForMeeting(meetingId: string): Promise<AgendaItem[]>;
  listForBusiness(businessId: string): Promise<AgendaItem[]>;
  find(meetingId: string, itemId: string): Promise<AgendaItem | null>;
  findById(itemId: string): Promise<AgendaItem | null>;
  create(meetingId: string, input: CreateAgendaItem): Promise<AgendaItem>;
  remove(meetingId: string, itemId: string): Promise<void>;
  reorder(meetingId: string, itemIds: string[]): Promise<void>;
  start(meetingId: string, itemId: string, startedAt: string): Promise<AgendaItem>;
  saveNotes(meetingId: string, itemId: string, discussionSummary: string): Promise<AgendaItem>;
  complete(
    meetingId: string,
    itemId: string,
    input: {
      discussionSummary: string;
      status: Extract<AgendaItem["status"], "examined" | "postponed" | "withdrawn">;
      completedAt: string;
    },
  ): Promise<AgendaItem>;
  completeOpenItems(meetingId: string, status: "postponed" | "withdrawn", completedAt: string): Promise<AgendaItem[]>;
  snapshotOpenItems(meetingId: string): Promise<void>;
  copy(sourceMeetingId: string, targetMeetingId: string): Promise<void>;
}

export interface CreateCouncilDecision {
  title: string;
  draftText: string;
  legalityReviewRequired: boolean;
}

export interface CouncilDecisionRepository {
  list(): Promise<CouncilDecisionListEntry[]>;
  find(id: string): Promise<CouncilDecision | null>;
  create(input: CreateCouncilDecision): Promise<CouncilDecision>;
  update(id: string, input: { title: string; draftText: string }): Promise<CouncilDecision>;
  assignNumber(id: string, year: number): Promise<CouncilDecision>;
  setStatus(id: string, status: CouncilDecisionStatus): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface CreateBallot {
  meetingId: string;
  target: BallotTarget;
  idempotencyKey: string;
  commandFingerprint: string;
  method: BallotMethod;
  result: BallotResult;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  notVoting: number;
  chairTieBreakApplied: boolean;
  recusedMemberIds: string[];
  votes: VoteInput[];
  participationEvidence: ParticipationEvidence;
}

export interface IdempotentBallot {
  ballot: Ballot;
  commandFingerprint: string;
}

export type RecordFinalBallotResult =
  | { status: "created"; ballot: Ballot }
  | { status: "replayed"; ballot: Ballot }
  | { status: "idempotencyConflict" }
  | { status: "decisionAlreadyFinalized" };

export interface BallotRepository {
  listForMeeting(meetingId: string): Promise<Ballot[]>;
  findById(ballotId: string): Promise<Ballot | null>;
  cancel(ballotId: string, cancelledAt: string): Promise<void>;
  findFinalForDecision(councilDecisionId: string): Promise<Ballot | null>;
  findForAgendaItem(agendaItemId: string): Promise<Ballot | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<IdempotentBallot | null>;
  recordFinal(input: CreateBallot): Promise<RecordFinalBallotResult>;
}

export interface UnitOfWork {
  /** Executes the operation atomically. Repository-level conflict claims remain authoritative across connections. */
  execute<T>(operation: () => Promise<T>): Promise<T>;
}
