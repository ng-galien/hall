import { createMeetingNoticeService, type MeetingNoticeService } from "../services/meetingNoticeService.js";
import {
  createPostgresClient,
  type PostgresClient,
  type PostgresCouncil,
  type PostgresDirectory,
  type PostgresMinutes,
  type PostgresResources,
} from "@hall/postgres";
import { type AwilixContainer, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { CouncilClient } from "../clients/councilClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { MinutesClient } from "../clients/minutesClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { createSqlExecutor } from "../infrastructure/database/factory.js";
import { createGotenbergDocumentPreviewConverter } from "../infrastructure/documents/gotenbergDocumentPreviewConverter.js";
import { createLegifranceProvider } from "../infrastructure/legal/legifranceProvider.js";
import { createPostgresCouncilClient } from "../infrastructure/postgres/councilClient.js";
import { createPostgresDirectoryClient } from "../infrastructure/postgres/directoryClient.js";
import { createPostgresMinutesClient } from "../infrastructure/postgres/minutesClient.js";
import { createPostgresResourcesClient } from "../infrastructure/postgres/resourcesClient.js";
import { createAgendaItemRepository } from "../repositories/agendaItemRepository.js";
import { createAttendanceRepository } from "../repositories/attendanceRepository.js";
import { createBallotRepository } from "../repositories/ballotRepository.js";
import { createContentTemplateRepository } from "../repositories/contentTemplateRepository.js";
import type {
  AgendaItemRepository,
  AttendanceRepository,
  BallotRepository,
  ContentTemplateRepository,
  CouncilBusinessRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  HallSettingsRepository,
  MeetingRosterRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { createCouncilBusinessRepository } from "../repositories/councilBusinessRepository.js";
import { createCouncilDecisionRepository } from "../repositories/councilDecisionRepository.js";
import { createCouncilMeetingRepository } from "../repositories/councilMeetingRepository.js";
import { createHallSettingsRepository } from "../repositories/hallSettingsRepository.js";
import { createMeetingRosterRepository } from "../repositories/meetingRosterRepository.js";
import { createSecurityRepository, type SecurityRepository } from "../repositories/securityRepository.js";
import { RequestContextStore } from "../security/requestContext.js";
import { type AuthService, createAuthService } from "../services/authService.js";
import { type BallotService, createBallotService } from "../services/ballotService.js";
import { type ContentTemplateService, createContentTemplateService } from "../services/contentTemplateService.js";
import { type CouncilBallotService, createCouncilBallotService } from "../services/councilBallotService.js";
import {
  type CouncilBusinessWorkspaceService,
  createCouncilBusinessWorkspaceService,
} from "../services/councilBusinessWorkspaceService.js";
import { type CouncilMeetingService, createCouncilMeetingService } from "../services/councilMeetingService.js";
import { createDirectoryService, type DirectoryService } from "../services/directoryService.js";
import {
  createDocumentaryResourceService,
  type DocumentaryResourceService,
} from "../services/documentaryResourceService.js";
import type { DocumentPreviewConverter } from "../services/documentPreviewConverter.js";
import { createDocumentRenderer, type DocumentRenderer } from "../services/documentRenderer.js";
import { createGeographicMapRenderer, type GeographicMapRenderer } from "../services/geographicMapRenderer.js";
import { createHallSettingsService, type HallSettingsService } from "../services/hallSettingsService.js";
import type { LegalReferenceProvider } from "../services/legalReferenceProvider.js";
import {
  createMeetingPreparationService,
  type MeetingPreparationService,
} from "../services/meetingPreparationService.js";
import { createMinutesService, type MinutesService } from "../services/minutesService.js";
import { createReferenceEntityResolver, type ReferenceEntityResolver } from "../services/referenceEntityResolver.js";
import { createTemplateRenderingService, type TemplateRenderingService } from "../services/templateRendering.js";
import type { ServerConfig } from "./config.js";

export interface Cradle {
  config: ServerConfig;
  requestContext: RequestContextStore;
  sqlExecutor: SqlExecutor;
  postgresClient: PostgresClient | null;
  postgresCouncil: PostgresCouncil;
  postgresDirectory: PostgresDirectory;
  postgresResources: PostgresResources;
  postgresMinutes: PostgresMinutes;
  minutesClient: MinutesClient;
  minutesService: MinutesService;
  meetingNoticeService: MeetingNoticeService;
  directoryClient: DirectoryClient;
  councilClient: CouncilClient;
  unitOfWork: UnitOfWork;
  hallSettingsRepository: HallSettingsRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  attendanceRepository: AttendanceRepository;
  agendaItemRepository: AgendaItemRepository;
  ballotRepository: BallotRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  resourcesClient: ResourcesClient;
  meetingRosterRepository: MeetingRosterRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  contentTemplateRepository: ContentTemplateRepository;
  securityRepository: SecurityRepository;
  directoryService: DirectoryService;
  councilMeetingService: CouncilMeetingService;
  meetingPreparationService: MeetingPreparationService;
  ballotService: BallotService;
  councilBallotService: CouncilBallotService;
  councilBusinessWorkspaceService: CouncilBusinessWorkspaceService;
  documentaryResourceService: DocumentaryResourceService;
  referenceEntityResolver: ReferenceEntityResolver;
  authService: AuthService;
  hallSettingsService: HallSettingsService;
  geographicMapRenderer: GeographicMapRenderer;
  templateRenderingService: TemplateRenderingService;
  documentRenderer: DocumentRenderer;
  documentPreviewConverter: DocumentPreviewConverter;
  legalReferenceProvider: LegalReferenceProvider;
  contentTemplateService: ContentTemplateService;
}

export function buildContainer(config: ServerConfig): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    requestContext: asFunction(() => new RequestContextStore()).singleton(),
    sqlExecutor: asFunction(createSqlExecutor).singleton(),
    postgresClient: asFunction(({ config }: { config: ServerConfig }) =>
      config.database.kind === "postgres" ? createPostgresClient({ connectionString: config.database.url }) : null,
    ).singleton(),
    unitOfWork: asFunction(({ sqlExecutor }: { sqlExecutor: SqlExecutor }) => sqlExecutor).singleton(),
    hallSettingsRepository: asFunction(createHallSettingsRepository).singleton(),
    councilMeetingRepository: asFunction(createCouncilMeetingRepository).singleton(),
    attendanceRepository: asFunction(createAttendanceRepository).singleton(),
    agendaItemRepository: asFunction(createAgendaItemRepository).singleton(),
    ballotRepository: asFunction(createBallotRepository).singleton(),
    councilDecisionRepository: asFunction(createCouncilDecisionRepository).singleton(),
    meetingRosterRepository: asFunction(createMeetingRosterRepository).singleton(),
    councilBusinessRepository: asFunction(createCouncilBusinessRepository).singleton(),
    contentTemplateRepository: asFunction(createContentTemplateRepository).singleton(),
    securityRepository: asFunction(createSecurityRepository).singleton(),
    councilMeetingService: asFunction(createCouncilMeetingService).singleton(),
    minutesService: asFunction(createMinutesService).singleton(),
    meetingNoticeService: asFunction(createMeetingNoticeService).singleton(),
    meetingPreparationService: asFunction(createMeetingPreparationService).singleton(),
    ballotService: asFunction(createBallotService).singleton(),
    councilBallotService: asFunction(createCouncilBallotService).singleton(),
    councilBusinessWorkspaceService: asFunction(createCouncilBusinessWorkspaceService).singleton(),
    directoryService: asFunction(createDirectoryService).singleton(),
    documentaryResourceService: asFunction(createDocumentaryResourceService).singleton(),
    referenceEntityResolver: asFunction(createReferenceEntityResolver).singleton(),
    authService: asFunction(createAuthService).singleton(),
    hallSettingsService: asFunction(createHallSettingsService).singleton(),
    geographicMapRenderer: asFunction(createGeographicMapRenderer).singleton(),
    templateRenderingService: asFunction(createTemplateRenderingService).singleton(),
    documentRenderer: asFunction(createDocumentRenderer).singleton(),
    documentPreviewConverter: asFunction(createGotenbergDocumentPreviewConverter).singleton(),
    legalReferenceProvider: asFunction(createLegifranceProvider).singleton(),
    contentTemplateService: asFunction(createContentTemplateService).singleton(),
  });
  if (config.database.kind === "postgres") {
    container.register({
      postgresCouncil: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Council PostgreSQL storage requires DATABASE_KIND=postgres");
        return postgresClient.council;
      }).singleton(),
      postgresDirectory: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Directory PostgreSQL storage requires DATABASE_KIND=postgres");
        return postgresClient.directory;
      }).singleton(),
      postgresResources: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Documentary PostgreSQL storage requires DATABASE_KIND=postgres");
        return postgresClient.resources;
      }).singleton(),
      resourcesClient: asFunction(createPostgresResourcesClient).singleton(),
      postgresMinutes: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Minutes PostgreSQL storage requires DATABASE_KIND=postgres");
        return postgresClient.minutes;
      }).singleton(),
      minutesClient: asFunction(createPostgresMinutesClient).singleton(),
      councilClient: asFunction(createPostgresCouncilClient).singleton(),
      directoryClient: asFunction(createPostgresDirectoryClient).singleton(),
    });
  }
  return container;
}
