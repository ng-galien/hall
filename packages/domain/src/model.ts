import { defineExhaustiveLiterals } from "./match.js";

type Identifier = string;
type IsoDate = string;
type IsoDateTime = string;

/** Business entities that can be addressed by an internal reference. */
export const referenceEntityKinds = [
  "member",
  "contact",
  "resource",
  "councilBusiness",
  "decision",
  "meeting",
] as const;

export type ReferenceEntityKind = (typeof referenceEntityKinds)[number];

type CouncilRole = "mayor" | "deputyMayor" | "councillor";
export type MeetingStatus = "draft" | "scheduled" | "inProgress" | "closed" | "cancelled";
export type MinutesStatus = "notStarted" | "draft" | "ready" | "approved" | "signed" | "published";
export type AttendanceStatus = "present" | "represented" | "excused" | "absent";
export type AgendaItemStatus = "scheduled" | "inProgress" | "examined" | "postponed" | "withdrawn";
export type CouncilDecisionStatus = "draft" | "ready" | "scheduled" | "adopted" | "rejected" | "enforceable";
export type BallotMethod = "public" | "secret";
type BallotResult = "adopted" | "rejected";
export type VoteChoice = "for" | "against" | "abstain" | "notVoting";
type TemplateKind = "pdf" | "message";

export const templateKinds = defineExhaustiveLiterals<TemplateKind>()(["pdf", "message"] as const);

/** Legacy meeting infrastructure term shape; directory APIs use the PostgreSQL CouncilTerm contract. */
export interface CouncilTerm {
  expectedMemberCount: number | null;
}

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
  /** Ordered venue catalogue; the first location is the default. */
  meetingLocations: string[];
  timeZone: string;
  outboundEmailSenderName: string;
  outboundEmailSenderAddress: string | null;
  outboundEmailReplyToAddress: string | null;
  updatedAt: IsoDateTime | null;
}

/** A Hall document or message template. Its editable source remains Markdown. */
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
  minutesId?: Identifier;
}

export interface Contact {
  id: Identifier;
  firstName: string;
  lastName: string;
  organizationName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  notes: string;
  activeCouncilMemberId: Identifier | null;
  archivedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

type ContactSummary = Omit<Contact, "notes" | "activeCouncilMemberId" | "createdAt" | "updatedAt">;

export interface CouncilMember {
  id: Identifier;
  contact: ContactSummary;
  role: CouncilRole;
  active: boolean;
  termStartedOn: string;
  termEndedOn: string | null;
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

interface AttendanceEvidence {
  memberId: Identifier;
  status: AttendanceStatus;
  proxyHolderMemberId: Identifier | null;
  proxyDocumentId: Identifier | null;
  version: number;
}

interface ParticipationEvidence {
  rosterMemberIds: Identifier[];
  attendance: AttendanceEvidence[];
  quorum: { activeMembers: number; physicallyPresent: number; required: number; reached: boolean };
}

interface QuorumFailureEvidence extends ParticipationEvidence {
  recordedAt: IsoDateTime;
}

type FolderPath = string;

type ResourceReadiness = "incomplete" | "empty" | "ready";
type ResourceAvailability = "unchecked" | "available" | "unavailable";

interface ResourceState {
  readiness: ResourceReadiness;
  availability: ResourceAvailability | null;
}

interface ResourceBase {
  id: Identifier;
  slug: string;
  title: string;
  folderPath: FolderPath;
  tags: string[];
  autosaveEnabled: boolean;
  state: ResourceState;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TextResource extends ResourceBase {
  kind: "text";
  content: string;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface SpreadsheetDocument {
  schemaVersion: 2;
  workbook: JsonObject;
}

export interface SpreadsheetResource extends ResourceBase {
  kind: "spreadsheet";
  version: number;
}

export interface RemoteResource extends ResourceBase {
  kind: "remote";
  url: string | null;
}

export type GeographicPosition = [number, number];

type GeographicGeometry =
  | { type: "Point"; coordinates: GeographicPosition }
  | { type: "LineString"; coordinates: GeographicPosition[] }
  | { type: "Polygon"; coordinates: GeographicPosition[][] };

export type GeographicColor = string;

const geographicLayerIds = [
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

export type GeographicLineArrows = "none" | "forward" | "backward" | "both";

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
        style: { color: GeographicColor; width: number; arrows?: GeographicLineArrows };
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

/** A named distance or area measurement saved in the drawings GeoJSON, with its geodesic value at saving time. */
// @implements-requirement HALL-FR-DOC-460
export type HallGeoJsonMeasurement =
  | {
      type: "Feature";
      id: Identifier;
      properties: { kind: "lengthMeasurement"; label: string; length: number };
      geometry: Extract<GeographicGeometry, { type: "LineString" }>;
    }
  | {
      type: "Feature";
      id: Identifier;
      properties: { kind: "areaMeasurement"; label: string; area: number; perimeter: number };
      geometry: Extract<GeographicGeometry, { type: "Polygon" }>;
    };

/** Legend entries travel with the drawings, independently of their geometry. */
export interface GeographicLegendEntry {
  color: GeographicColor;
  label: string;
}

export interface HallGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<HallGeoJsonFeature | HallGeoJsonMeasurement>;
  legend?: GeographicLegendEntry[];
}

export type GeographicView =
  | { kind: "center"; center: GeographicPosition; zoom: number }
  | { kind: "extent"; extent: [number, number, number, number]; zoom: number };

interface GeographicProvenance {
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

/** A reusable geographic dataset whose features are stored outside the resource detail. */
// @implements-requirement HALL-FR-DOC-310
interface GeographicLayerResource extends ResourceBase {
  kind: "geographicLayer";
  featureCount: number;
  version: number;
}

export interface GeographicResourceData {
  view: GeographicView;
  layers: GeographicLayer[];
  hallLayer: HallGeoJsonFeatureCollection;
  provenance: GeographicProvenance;
}

type LegalReferenceKind = "article";
export type LegalReferenceFund = "CODE_ETAT" | "CODE_DATE";
type LegalReferenceVerificationStatus = "current" | "verificationUnavailable";

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

interface LegalReferenceSnapshot {
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

interface LegalReferenceDraftResource extends ResourceBase {
  kind: "legalReference";
  resolutionStatus: "draft";
  provider: "legifrance";
  referenceKind: LegalReferenceKind;
}

interface LegalReferenceResolvedResource extends ResourceBase {
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

export const documentFormats = ["pdf", "jpeg", "png", "docx", "odt", "xlsx", "pptx", "txt", "csv"] as const;

export type DocumentFormat = (typeof documentFormats)[number];

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

interface EditorAssetResource extends DocumentResourceBase {
  usage: "editorAsset";
  category: null;
  editorOwner: EditorAssetOwner;
}

export type DocumentResource = DocumentaryResource | EditorAssetResource;

export type DocumentUsage = DocumentResource["usage"];
export type Resource =
  | TextResource
  | SpreadsheetResource
  | DocumentResource
  | RemoteResource
  | GeographicResource
  | LegalReferenceResource
  | GeographicLayerResource;

export type ResourceKind = Resource["kind"];

export const resourceKinds = defineExhaustiveLiterals<ResourceKind>()([
  "text",
  "spreadsheet",
  "document",
  "remote",
  "geographic",
  "legalReference",
  "geographicLayer",
] as const);

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
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface CouncilMatter extends CouncilBusinessBase {
  kind: "matter";
  councilDecisionId: Identifier | null;
  committeeId: Identifier | null;
}

interface MinutesApproval extends CouncilBusinessBase {
  kind: "minutesApproval";
  minutesOfMeetingId: Identifier;
}

interface OpenQuestion extends CouncilBusinessBase {
  kind: "openQuestion";
}

interface CouncilDecision {
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

interface VoteInput {
  memberId: Identifier;
  castByMemberId: Identifier;
  choice: VoteChoice;
}

interface Vote extends VoteInput {
  id: Identifier;
  ballotId: Identifier;
}

type BallotTarget = { kind: "councilDecision"; id: Identifier } | { kind: "agendaItem"; id: Identifier };

interface BallotBase {
  id: Identifier;
  meetingId: Identifier;
  /** Canonical target validated when the ballot crosses the persistence boundary. */
  target: BallotTarget;
  /** Persistence/API compatibility projection; use `target` for business dispatch. */
  councilDecisionId: Identifier | null;
  /** Persistence/API compatibility projection; use `target` for business dispatch. */
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

interface PublicBallot extends BallotBase {
  method: "public";
  votes: Vote[];
}

interface SecretBallot extends BallotBase {
  method: "secret";
}

export type Ballot = PublicBallot | SecretBallot;

export interface ResourceDetails {
  resource: Resource;
  geography: GeographicResourceData | null;
  spreadsheet: SpreadsheetDocument | null;
  legalSnapshots: LegalReferenceSnapshot[] | null;
  councilBusiness: CouncilBusiness[];
  snapshotted: boolean;
  usedAsProxy: boolean;
  referencedByContent: boolean;
}
