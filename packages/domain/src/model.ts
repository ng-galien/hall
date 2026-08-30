export type Identifier = string;
export type IsoDate = string;
export type IsoDateTime = string;

export type CouncilRole = "mayor" | "deputyMayor" | "councillor";
export type MeetingStatus = "draft" | "scheduled" | "inProgress" | "closed" | "cancelled";
export type MinutesStatus = "notStarted" | "draft" | "ready" | "approved" | "signed" | "published";
export type AttendanceStatus = "present" | "represented" | "excused" | "absent";
export type AgendaItemStatus = "scheduled" | "inProgress" | "examined" | "postponed" | "withdrawn";
export type CouncilDecisionStatus = "draft" | "ready" | "scheduled" | "adopted" | "rejected" | "enforceable";
export type BallotMethod = "public" | "secret";
export type BallotResult = "adopted" | "rejected";
export type VoteChoice = "for" | "against" | "abstain" | "notVoting";
export type TemplateKind = "pdf" | "message";

export interface HallSettings {
  name: string;
  inseeCode: string | null;
  siren: string | null;
  population: number | null;
  populationReferenceDate: string | null;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  geographicPosition: GeographicPosition | null;
  phone: string;
  email: string | null;
  website: string | null;
  defaultMeetingLocation: string;
  timeZone: string;
  outboundEmailSenderName: string;
  outboundEmailSenderAddress: string | null;
  outboundEmailReplyToAddress: string | null;
  updatedAt: IsoDateTime | null;
}

/** A municipal document or message template. Its editable source remains Markdown. */
export interface ContentTemplate {
  id: Identifier;
  kind: TemplateKind;
  documentType: string;
  name: string;
  bodyMarkdown: string;
  /** Only message templates carry a subject. It uses the same inline directive grammar. */
  subject: string | null;
  /** PDF-only presentation data, stored with the template rather than in application code. */
  stylesheet: string;
  headerHtml: string;
  footerHtml: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TemplateRenderContext {
  meetingId?: Identifier;
}

export interface CouncilMember {
  id: Identifier;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: CouncilRole;
  active: boolean;
  termStartedOn: string;
  termEndedOn: string | null;
}

export type CommitteeRole = "chair" | "viceChair" | "member";

export interface CouncilCommittee {
  id: Identifier;
  slug: string;
  name: string;
  description: string;
  archivedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CommitteeMembership {
  id: Identifier;
  committeeId: Identifier;
  councilMemberId: Identifier;
  role: CommitteeRole;
  startedOn: string;
  endedOn: string | null;
}

export interface CouncilMeeting {
  id: Identifier;
  number: string;
  slug: string;
  startsAt: IsoDateTime;
  location: string;
  status: MeetingStatus;
  chairMemberId: Identifier | null;
  secretaryMemberId: Identifier | null;
  meetingNoticeSentAt: IsoDateTime | null;
  meetingNoticePublishedAt: IsoDateTime | null;
  isUrgent: boolean;
  urgencyApproved: boolean | null;
  isReconvenedMeeting: boolean;
  previousMeetingId: Identifier | null;
  quorumFailure: QuorumFailureEvidence | null;
  openedAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
  minutesStatus: MinutesStatus;
  minutesContent: string;
  minutesApprovedAt: IsoDateTime | null;
  minutesSignedAt: IsoDateTime | null;
  minutesPublishedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Attendance {
  id: Identifier;
  meetingId: Identifier;
  memberId: Identifier;
  status: AttendanceStatus;
  proxyHolderMemberId: Identifier | null;
  proxyDocumentId: Identifier | null;
  version: number;
}

export interface AttendanceEvidence {
  memberId: Identifier;
  status: AttendanceStatus;
  proxyHolderMemberId: Identifier | null;
  proxyDocumentId: Identifier | null;
  version: number;
}

export interface ParticipationEvidence {
  rosterMemberIds: Identifier[];
  attendance: AttendanceEvidence[];
  quorum: { activeMembers: number; physicallyPresent: number; required: number; reached: boolean };
}

export interface QuorumFailureEvidence extends ParticipationEvidence {
  recordedAt: IsoDateTime;
}

export type FolderPath = string;

export interface FolderCreateResult {
  path: FolderPath;
  createdAt: IsoDateTime;
}

export interface FolderRenameResult {
  sourcePath: FolderPath;
  targetPath: FolderPath;
  folderCount: number;
  resourceCount: number;
  councilBusinessCount: number;
  updatedAt: IsoDateTime;
}

export type ResourceReadiness = "incomplete" | "empty" | "ready";
export type ResourceAvailability = "unchecked" | "available" | "unavailable";

export interface ResourceState {
  readiness: ResourceReadiness;
  availability: ResourceAvailability | null;
}

interface ResourceBase {
  id: Identifier;
  slug: string;
  title: string;
  folderPath: FolderPath;
  tags: string[];
  state: ResourceState;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TextResource extends ResourceBase {
  kind: "text";
  content: string;
}

export interface RemoteResource extends ResourceBase {
  kind: "remote";
  url: string | null;
}

export type GeographicPosition = [number, number];

export type GeographicGeometry =
  | { type: "Point"; coordinates: GeographicPosition }
  | { type: "LineString"; coordinates: GeographicPosition[] }
  | { type: "Polygon"; coordinates: GeographicPosition[][] };

export type GeographicColor = string;

export const geographicLayerIds = [
  "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
  "ORTHOIMAGERY.ORTHOPHOTOS",
  "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
] as const;

export const geographicLayerOptions = [
  { id: geographicLayerIds[0], title: "IGN" },
  { id: geographicLayerIds[1], title: "Aérien" },
  { id: geographicLayerIds[2], title: "Cadastre" },
] as const;

export type GeographicLayerId = (typeof geographicLayerIds)[number];

export interface GeographicLayer {
  id: GeographicLayerId;
  visible: boolean;
  opacity: number;
}

export type HallGeoJsonFeature =
  | {
      type: "Feature";
      id: Identifier;
      properties: {
        kind: "marker";
        visible: boolean;
        label: string | null;
        style: { color: GeographicColor; size: "small" | "medium" | "large" };
      };
      geometry: Extract<GeographicGeometry, { type: "Point" }>;
    }
  | {
      type: "Feature";
      id: Identifier;
      properties: {
        kind: "line";
        visible: boolean;
        label: string | null;
        style: { color: GeographicColor; width: number };
      };
      geometry: Extract<GeographicGeometry, { type: "LineString" }>;
    }
  | {
      type: "Feature";
      id: Identifier;
      properties: {
        kind: "area";
        visible: boolean;
        label: string | null;
        style: { fillColor: GeographicColor; strokeColor: GeographicColor; strokeWidth: number; fillOpacity: number };
      };
      geometry: Extract<GeographicGeometry, { type: "Polygon" }>;
    };

export interface HallGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: HallGeoJsonFeature[];
}

export type GeographicView =
  | { kind: "center"; center: GeographicPosition; zoom: number }
  | { kind: "extent"; extent: [number, number, number, number]; zoom: number };

export interface GeographicProvenance {
  attribution: string;
  license: "Licence Ouverte 2.0";
  metadataUrl: string;
  configuredAt: IsoDateTime;
  sourceUpdatedAt: IsoDateTime | null;
}

export interface GeographicResource extends ResourceBase {
  kind: "geographic";
  provider: "ign";
  version: number;
}

export interface GeographicResourceData {
  view: GeographicView;
  layers: GeographicLayer[];
  hallLayer: HallGeoJsonFeatureCollection;
  provenance: GeographicProvenance;
}

export type LegalReferenceKind = "article";
export type LegalReferenceFund = "CODE_ETAT" | "CODE_DATE";
export type LegalReferenceVerificationStatus = "current" | "verificationUnavailable";

export interface LegalReferenceSearchResult {
  provider: "legifrance";
  referenceKind: "article";
  fund: LegalReferenceFund;
  versionId: string;
  title: string;
  citationLabel: string;
  effectiveAt: IsoDate | null;
  legalStatus: string;
  sourceUrl: string;
}

export interface LegalReferenceSnapshot {
  id: Identifier;
  commonId: string;
  versionId: string;
  effectiveAt: IsoDate | null;
  fetchedAt: IsoDateTime;
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
  legalStatus: string;
  normalizedContent: string;
  contentHash: string;
  snapshotHash: string;
}

export interface LegalReferenceDraftResource extends ResourceBase {
  kind: "legalReference";
  resolutionStatus: "draft";
  provider: "legifrance";
  referenceKind: LegalReferenceKind;
}

export interface LegalReferenceResolvedResource extends ResourceBase {
  kind: "legalReference";
  resolutionStatus: "resolved";
  provider: "legifrance";
  referenceKind: LegalReferenceKind;
  fund: LegalReferenceFund;
  commonId: string;
  versionId: string;
  effectiveAt: IsoDate | null;
  legalStatus: string;
  sourceUrl: string;
  fetchedAt: IsoDateTime;
  providerUpdatedAt: IsoDateTime | null;
  citationLabel: string;
  attribution: string;
  snapshotHash: string;
  verificationDueAt: IsoDateTime;
  verificationStatus: LegalReferenceVerificationStatus;
  verificationFailedAt: IsoDateTime | null;
}

export type LegalReferenceResource = LegalReferenceDraftResource | LegalReferenceResolvedResource;

export type DocumentFormat = "pdf" | "jpeg" | "png" | "docx" | "odt" | "xlsx" | "pptx" | "txt" | "csv";

export type DocumentCategory = "report" | "draftCouncilDecision" | "meetingNotice" | "minutes" | "proxy" | "supporting";

export type EditorAssetOwner =
  | { kind: "textResourceContent"; id: Identifier }
  | { kind: "councilBusinessReport"; id: Identifier }
  | { kind: "councilDecisionDraft"; id: Identifier }
  | { kind: "agendaItemDiscussionSummary"; id: Identifier };

interface DocumentResourceBase extends ResourceBase {
  kind: "document";
  meetingId: Identifier | null;
  fileName: string;
  format: DocumentFormat;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
}

export interface DocumentaryResource extends DocumentResourceBase {
  usage: "document";
  category: DocumentCategory;
  editorOwner: null;
}

export interface EditorAssetResource extends DocumentResourceBase {
  usage: "editorAsset";
  category: null;
  editorOwner: EditorAssetOwner;
}

export type DocumentResource = DocumentaryResource | EditorAssetResource;

export type Resource = TextResource | DocumentResource | RemoteResource | GeographicResource | LegalReferenceResource;

export interface AgendaItem {
  id: Identifier;
  business: CouncilBusiness;
  meetingId: Identifier;
  position: number;
  /** Item added after opening: it can be reviewed but cannot be submitted to a ballot. */
  addedDuringSession: boolean;
  discussionSummary: string;
  status: AgendaItemStatus;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  councilDecisionSnapshot: Pick<CouncilDecision, "id" | "title" | "draftText"> | null;
}

export type CouncilBusiness = CouncilMatter | MinutesApproval | OpenQuestion;

interface CouncilBusinessBase {
  id: Identifier;
  slug: string;
  title: string;
  report: string;
  folderPath: FolderPath;
  resources: Resource[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CouncilMatter extends CouncilBusinessBase {
  kind: "matter";
  councilDecisionId: Identifier | null;
  committeeId: Identifier | null;
}

export interface MinutesApproval extends CouncilBusinessBase {
  kind: "minutesApproval";
  minutesOfMeetingId: Identifier;
}

export interface OpenQuestion extends CouncilBusinessBase {
  kind: "openQuestion";
}

export interface CouncilDecision {
  id: Identifier;
  number: string | null;
  slug: string;
  title: string;
  draftText: string;
  status: CouncilDecisionStatus;
  legalityReviewRequired: boolean;
  submittedForLegalityReviewAt: IsoDateTime | null;
  publishedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CouncilDecisionListEntry extends CouncilDecision {
  meetingId: Identifier | null;
}

export interface VoteInput {
  memberId: Identifier;
  castByMemberId: Identifier;
  choice: VoteChoice;
}

export interface Vote extends VoteInput {
  id: Identifier;
  ballotId: Identifier;
}

interface BallotBase {
  id: Identifier;
  meetingId: Identifier;
  councilDecisionId: Identifier | null;
  agendaItemId: Identifier | null;
  result: BallotResult;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  notVoting: number;
  /** Votes cast under CGCT L2121-20: votes for plus votes against, computed by the server. */
  votesCast: number;
  chairTieBreakApplied: boolean;
  /** Recused members remain present at the meeting but are excluded from this ballot. */
  recusedMemberIds: Identifier[];
  participationEvidence: ParticipationEvidence;
  createdAt: IsoDateTime;
  cancelledAt: IsoDateTime | null;
}

export interface PublicBallot extends BallotBase {
  method: "public";
  votes: Vote[];
}

export interface SecretBallot extends BallotBase {
  method: "secret";
}

export type Ballot = PublicBallot | SecretBallot;

export interface MeetingAggregate {
  meeting: CouncilMeeting;
  agendaReady: boolean;
  requiredMinutesOfMeetingId: Identifier | null;
  activeMemberCount: number;
  rosterMemberIds: Identifier[];
  attendance: Attendance[];
  agendaItems: AgendaItem[];
  councilDecisions: CouncilDecision[];
  ballots: Ballot[];
  quorum: { activeMembers: number; physicallyPresent: number; required: number; reached: boolean };
}

export interface CouncilBusinessOccurrence {
  meeting: CouncilMeeting;
  agendaItem: AgendaItem;
}

export interface CouncilBusinessDetails {
  business: CouncilBusiness;
  councilDecision: CouncilDecision | null;
  occurrences: CouncilBusinessOccurrence[];
}

export interface ResourceDetails {
  resource: Resource;
  geography: GeographicResourceData | null;
  legalSnapshots: LegalReferenceSnapshot[] | null;
  councilBusiness: CouncilBusiness[];
  snapshotted: boolean;
  usedAsProxy: boolean;
  referencedByContent: boolean;
}
