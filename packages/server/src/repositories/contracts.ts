import type {
  AgendaItem,
  Attendance,
  AttendanceStatus,
  Ballot,
  BallotMethod,
  BallotResult,
  CouncilDecision,
  CouncilDecisionListEntry,
  CouncilDecisionStatus,
  CouncilMeeting,
  CouncilMember,
  CouncilRole,
  DocumentResource,
  MeetingStatus,
  ParticipationEvidence,
  QuorumFailureEvidence,
  Resource,
  TextResource,
  Topic,
  TopicState,
  VoteInput,
} from "@hall/domain";

export interface CreateCouncilMember {
  firstName: string;
  lastName: string;
  email?: string | null;
  role: CouncilRole;
  termStartedOn: string;
}

export interface CouncilMemberRepository {
  list(): Promise<CouncilMember[]>;
  listActive(): Promise<CouncilMember[]>;
  find(id: string): Promise<CouncilMember | null>;
  create(input: CreateCouncilMember): Promise<CouncilMember>;
}

export interface CreateCouncilMeeting {
  title: string;
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
  updateDetails(id: string, input: { title: string; startsAt: string; location: string }): Promise<void>;
  setStatus(id: string, status: MeetingStatus): Promise<void>;
  setOfficers(id: string, chairMemberId: string, secretaryMemberId: string): Promise<void>;
  recordQuorumFailure(id: string, evidence: QuorumFailureEvidence): Promise<void>;
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
  topicId: string;
  position: number;
  addedDuringSession?: boolean;
}

export type CreateTopic =
  | {
      kind: "subject";
      councilDecisionId?: string | null;
      title: string;
      report: string;
      folderPath: string;
      resourceIds: string[];
    }
  | {
      kind: "minutesApproval";
      minutesOfMeetingId: string;
      title: string;
      report: string;
      folderPath: string;
      resourceIds: string[];
    }
  | {
      kind: "openQuestion";
      title: string;
      report: string;
      folderPath: string;
      resourceIds: string[];
    };

export interface UpdateTopic {
  title: string;
  report: string;
  folderPath: string;
  resourceIds: string[];
  councilDecisionId?: string | null;
}

export interface TopicRepository {
  list(filters?: { state?: TopicState; folderPath?: string; resourceId?: string }): Promise<Topic[]>;
  find(id: string): Promise<Topic | null>;
  findForCouncilDecision(councilDecisionId: string): Promise<Topic | null>;
  findMinutesApprovalForMeeting(meetingId: string): Promise<Topic | null>;
  create(input: CreateTopic): Promise<Topic>;
  update(id: string, input: UpdateTopic): Promise<Topic>;
  schedule(id: string, meetingId: string, position: number): Promise<Topic>;
  setState(id: string, state: Exclude<TopicState, "scheduled" | "inProgress">): Promise<Topic>;
  start(id: string): Promise<Topic>;
  setPosition(id: string, position: number): Promise<void>;
}

export interface AgendaRepository {
  listForMeeting(meetingId: string): Promise<AgendaItem[]>;
  listForTopic(topicId: string): Promise<AgendaItem[]>;
  find(meetingId: string, itemId: string): Promise<AgendaItem | null>;
  create(meetingId: string, input: CreateAgendaItem): Promise<AgendaItem>;
  remove(meetingId: string, itemId: string): Promise<void>;
  reorder(meetingId: string, itemIds: string[]): Promise<void>;
  start(meetingId: string, itemId: string, startedAt: string): Promise<AgendaItem>;
  saveNotes(meetingId: string, itemId: string, discussionSummary: string): Promise<AgendaItem>;
  complete(
    meetingId: string,
    itemId: string,
    input: { discussionSummary: string; status: Exclude<AgendaItem["status"], "scheduled">; completedAt: string },
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
  setStatus(id: string, status: CouncilDecisionStatus): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface CreateBallot {
  meetingId: string;
  councilDecisionId: string | null;
  agendaItemId: string | null;
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

export interface CreateTextResource {
  title: string;
  folderPath: string;
  tags: string[];
  content: string;
}

export interface CreateDocumentResource {
  title: string;
  folderPath: string;
  tags: string[];
  meetingId?: string | null;
  fileName: string;
  mediaType: string;
  category: DocumentResource["category"];
  content: Buffer;
}

export interface StoredDocumentResource extends DocumentResource {
  content: Buffer;
}

export type StoredResource = TextResource | StoredDocumentResource;

export interface ResourceRepository {
  list(filters?: {
    folderPath?: string;
    tags?: string[];
    kind?: Resource["kind"];
    meetingId?: string;
  }): Promise<Resource[]>;
  find(id: string): Promise<StoredResource | null>;
  findMetadata(id: string): Promise<Resource | null>;
  listFolderPaths(): Promise<string[]>;
  createText(input: CreateTextResource): Promise<TextResource>;
  createDocument(input: CreateDocumentResource): Promise<DocumentResource>;
  update(id: string, input: UpdateResource): Promise<Resource>;
  isSnapshotted(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

export interface UpdateResource {
  title: string;
  folderPath: string;
  tags: string[];
  content?: string;
}

export interface UnitOfWork {
  /** Executes the operation atomically. Repository-level conflict claims remain authoritative across connections. */
  execute<T>(operation: () => Promise<T>): Promise<T>;
}
