import type {
  AgendaItem,
  Attendance,
  AttendanceStatus,
  Ballot,
  BallotMethod,
  BallotResult,
  CommitteeMembership,
  CommitteeRole,
  ContentTemplate,
  CouncilBusiness,
  CouncilCommittee,
  CouncilDecision,
  CouncilDecisionListEntry,
  CouncilDecisionStatus,
  CouncilMeeting,
  CouncilMember,
  CouncilRole,
  DocumentCategory,
  DocumentResource,
  EditorAssetOwner,
  GeographicLayer,
  GeographicResource,
  GeographicResourceData,
  GeographicView,
  HallGeoJsonFeatureCollection,
  HallSettings,
  LegalReferenceFund,
  LegalReferenceResource,
  LegalReferenceSnapshot,
  MeetingStatus,
  ParticipationEvidence,
  QuorumFailureEvidence,
  RemoteResource,
  Resource,
  TextResource,
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

export interface CreateCouncilMember {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role: CouncilRole;
  termStartedOn: string;
}

export interface UpdateCouncilMember extends CreateCouncilMember {
  termEndedOn: string | null;
}

export interface CouncilMemberRepository {
  list(): Promise<CouncilMember[]>;
  listActive(): Promise<CouncilMember[]>;
  find(id: string): Promise<CouncilMember | null>;
  create(input: CreateCouncilMember): Promise<CouncilMember>;
  update(id: string, input: UpdateCouncilMember): Promise<CouncilMember>;
}

export interface CreateCouncilCommittee {
  name: string;
  description: string;
}

export interface CouncilCommitteeRepository {
  list(options?: { includeArchived?: boolean }): Promise<CouncilCommittee[]>;
  find(reference: string): Promise<CouncilCommittee | null>;
  create(input: CreateCouncilCommittee): Promise<CouncilCommittee>;
  update(id: string, input: CreateCouncilCommittee): Promise<CouncilCommittee>;
  archive(id: string, archivedAt: string): Promise<CouncilCommittee>;
}

export interface AddCommitteeMembership {
  councilMemberId: string;
  role: CommitteeRole;
  startedOn: string;
}

export interface UpdateCommitteeMembership {
  role: CommitteeRole;
  startedOn: string;
  endedOn: string | null;
}

export interface CommitteeMembershipRepository {
  listForCommittee(committeeId: string): Promise<CommitteeMembership[]>;
  add(committeeId: string, input: AddCommitteeMembership): Promise<CommitteeMembership>;
  update(id: string, input: UpdateCommitteeMembership): Promise<CommitteeMembership>;
  end(id: string, endedOn: string): Promise<CommitteeMembership>;
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

export interface UpdateCouncilBusinessContent {
  title: string;
  report: string;
  folderPath: string;
  resourceIds: string[];
  committeeId?: string | null;
}

export interface SaveCouncilBusiness extends UpdateCouncilBusinessContent {
  councilDecisionId?: string | null;
}

export interface CouncilBusinessRepository {
  list(filters?: { folderPath?: string; resourceId?: string }): Promise<CouncilBusiness[]>;
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

export interface CreateRemoteResource {
  title: string;
  folderPath: string;
  tags: string[];
  url: string | null;
}

export interface CreateGeographicResource {
  title: string;
  folderPath: string;
  tags: string[];
  provider: "ign";
  layers: GeographicLayer[];
  view: GeographicView;
  hallLayer: HallGeoJsonFeatureCollection;
}

export interface UpdateGeographicResource {
  view: GeographicView;
  layers: GeographicLayer[];
  hallLayer: HallGeoJsonFeatureCollection;
  expectedVersion: number;
}

export interface PersistLegalReferenceSnapshot {
  commonId: string;
  versionId: string;
  effectiveAt: string | null;
  fetchedAt: string;
  validFrom: string | null;
  validTo: string | null;
  legalStatus: string;
  rawProviderPayload: string;
  normalizedContent: string;
  contentHash: string;
  snapshotHash: string;
}

export interface CreateLegalReferenceResource {
  title: string;
  folderPath: string;
  tags: string[];
  provider: "legifrance";
  referenceKind: "article";
  fund: LegalReferenceFund;
  sourceUrl: string;
  providerUpdatedAt: string | null;
  citationLabel: string;
  attribution: string;
  snapshot: PersistLegalReferenceSnapshot;
}

export interface CreateLegalReferenceDraft {
  title: string;
  folderPath: string;
  tags: string[];
  provider: "legifrance";
  referenceKind: "article";
}

export interface CreateDocumentResource {
  title: string;
  folderPath: string;
  tags: string[];
  meetingId?: string | null;
  fileName: string;
  category: DocumentCategory;
  content: Buffer;
}

export interface CreateEditorAssetResource {
  title: string;
  fileName: string;
  owner: EditorAssetOwner;
  content: Buffer;
}

export interface PersistDocumentResource extends CreateDocumentResource {
  format: DocumentResource["format"];
  mediaType: string;
  contentSha256: string;
}

export interface PersistEditorAssetResource extends CreateEditorAssetResource {
  folderPath: string;
  format: "jpeg" | "png";
  mediaType: "image/jpeg" | "image/png";
  contentSha256: string;
}

export type StoredDocumentResource = DocumentResource & { content: Buffer };

export interface StoredDocumentPreview {
  sourceContentSha256: string;
  sourceFormat: DocumentResource["format"];
  contentSha256: string;
  byteSize: number;
  content: Buffer;
  createdAt: string;
}

export type StoredResource =
  | TextResource
  | StoredDocumentResource
  | RemoteResource
  | GeographicResource
  | LegalReferenceResource;

export interface WorkspaceFolderRepository {
  list(): Promise<string[]>;
  hasPrefix(folderPath: string): Promise<boolean>;
  ensure(folderPath: string, createdAt: string): Promise<void>;
  rename(sourcePath: string, targetPath: string): Promise<number>;
}

export interface ResourceRepository {
  list(filters?: {
    folderPath?: string;
    tags?: string[];
    kind?: Resource["kind"];
    meetingId?: string;
    usage?: "document" | "editorAsset";
    editorOwner?: EditorAssetOwner;
  }): Promise<Resource[]>;
  find(id: string): Promise<StoredResource | null>;
  findMetadata(id: string): Promise<Resource | null>;
  findGeographicData(id: string): Promise<GeographicResourceData | null>;
  listLegalReferenceSnapshots(id: string): Promise<LegalReferenceSnapshot[]>;
  findPreview(
    sourceContentSha256: string,
    sourceFormat: DocumentResource["format"],
  ): Promise<StoredDocumentPreview | null>;
  savePreview(preview: StoredDocumentPreview): Promise<StoredDocumentPreview>;
  listFolderPaths(): Promise<string[]>;
  hasFolderPathPrefix(folderPath: string): Promise<boolean>;
  renameFolder(sourcePath: string, targetPath: string, updatedAt: string): Promise<number>;
  createText(input: CreateTextResource): Promise<TextResource>;
  createRemote(input: CreateRemoteResource): Promise<RemoteResource>;
  createGeographic(input: CreateGeographicResource): Promise<GeographicResource>;
  updateGeographic(
    id: string,
    input: UpdateGeographicResource,
  ): Promise<
    { status: "updated"; resource: GeographicResource } | { status: "versionConflict" } | { status: "notFound" }
  >;
  createLegalReferenceDraft(input: CreateLegalReferenceDraft): Promise<LegalReferenceResource>;
  resolveLegalReference(id: string, input: CreateLegalReferenceResource): Promise<LegalReferenceResource | null>;
  refreshLegalReference(
    id: string,
    expectedSnapshotHash: string,
    input: Omit<CreateLegalReferenceResource, "title" | "folderPath" | "tags" | "provider" | "referenceKind" | "fund">,
  ): Promise<
    { status: "updated"; resource: LegalReferenceResource } | { status: "versionConflict" } | { status: "notFound" }
  >;
  markLegalReferenceVerificationFailed(id: string, expectedSnapshotHash: string, failedAt: string): Promise<void>;
  createDocument(input: PersistDocumentResource): Promise<DocumentResource>;
  createEditorAsset(input: PersistEditorAssetResource): Promise<DocumentResource>;
  promoteEditorAsset(
    id: string,
    input: { title: string; folderPath: string; tags: string[]; category: DocumentCategory },
  ): Promise<DocumentResource | null>;
  reconcileEditorAssets(owner: EditorAssetOwner, referencedIds: string[]): Promise<string[]>;
  isReferencedByRichText(id: string): Promise<boolean>;
  update(id: string, input: UpdateResource): Promise<Resource>;
  isSnapshotted(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

export interface UpdateResource {
  title: string;
  folderPath: string;
  tags: string[];
  content?: string;
  url?: string | null;
}

export interface UnitOfWork {
  /** Executes the operation atomically. Repository-level conflict claims remain authoritative across connections. */
  execute<T>(operation: () => Promise<T>): Promise<T>;
}
