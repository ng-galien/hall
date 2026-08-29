export type Identifier = string;
export type IsoDateTime = string;

export type CouncilRole = "mayor" | "deputyMayor" | "councillor";
export type MeetingStatus = "draft" | "scheduled" | "inProgress" | "closed" | "cancelled";
export type MinutesStatus = "notStarted" | "draft" | "approved" | "signed" | "published";
export type AttendanceStatus = "present" | "represented" | "excused" | "absent";
export type AgendaItemStatus = "scheduled" | "examined" | "postponed" | "withdrawn";
export type CouncilDecisionStatus = "draft" | "ready" | "scheduled" | "adopted" | "rejected" | "enforceable";
export type BallotMethod = "public" | "secret";
export type BallotResult = "adopted" | "rejected";
export type VoteChoice = "for" | "against" | "abstain" | "notVoting";
export type TopicState = "toSchedule" | "scheduled" | "inProgress" | "examined" | "withdrawn";
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
  role: CouncilRole;
  active: boolean;
  termStartedOn: string;
  termEndedOn: string | null;
}

export interface CouncilMeeting {
  id: Identifier;
  number: string;
  slug: string;
  title: string;
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

interface ResourceBase {
  id: Identifier;
  slug: string;
  title: string;
  folderPath: FolderPath;
  tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TextResource extends ResourceBase {
  kind: "text";
  content: string;
}

export type DocumentFormat =
  | "pdf"
  | "jpeg"
  | "png"
  | "docx"
  | "odt"
  | "xlsx"
  | "pptx"
  | "txt"
  | "csv";

export interface DocumentResource extends ResourceBase {
  kind: "document";
  meetingId: Identifier | null;
  fileName: string;
  format: DocumentFormat;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
  category: "report" | "draftCouncilDecision" | "meetingNotice" | "minutes" | "proxy" | "supporting";
}

export type Resource = TextResource | DocumentResource;

export interface AgendaItem {
  id: Identifier;
  topic: Topic;
  meetingId: Identifier;
  position: number;
  /** Point ajouté après l'ouverture : consultable et examinable, mais non soumis au vote. */
  addedDuringSession: boolean;
  discussionSummary: string;
  status: AgendaItemStatus;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  councilDecisionSnapshot: Pick<CouncilDecision, "id" | "title" | "draftText"> | null;
}

export type Topic = SubjectTopic | MinutesApprovalTopic | OpenQuestionTopic;

interface TopicBase {
  id: Identifier;
  slug: string;
  title: string;
  report: string;
  folderPath: FolderPath;
  resources: Resource[];
  state: TopicState;
  currentMeetingId: Identifier | null;
  position: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SubjectTopic extends TopicBase {
  kind: "subject";
  councilDecisionId: Identifier | null;
}

export interface MinutesApprovalTopic extends TopicBase {
  kind: "minutesApproval";
  minutesOfMeetingId: Identifier;
}

export interface OpenQuestionTopic extends TopicBase {
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
  /** Suffrages exprimés (CGCT L2121-20) : pour + contre, calculés par le serveur. */
  votesCast: number;
  chairTieBreakApplied: boolean;
  /** Conseillers déportés pour ce point : présents à la séance, mais exclus du collège des votants. */
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
  activeMemberCount: number;
  rosterMemberIds: Identifier[];
  attendance: Attendance[];
  agendaItems: AgendaItem[];
  councilDecisions: CouncilDecision[];
  ballots: Ballot[];
  quorum: { activeMembers: number; physicallyPresent: number; required: number; reached: boolean };
}

export interface TopicOccurrence {
  meeting: CouncilMeeting;
  agendaItem: AgendaItem;
}

export interface TopicDetails {
  topic: Topic;
  councilDecision: CouncilDecision | null;
  occurrences: TopicOccurrence[];
}

export interface ResourceDetails {
  resource: Resource;
  topics: Topic[];
  snapshotted: boolean;
  usedAsProxy: boolean;
}
