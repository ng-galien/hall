import {
  createPostgresPool,
  PostgresClient,
  type PostgresCouncil,
  type PostgresCouncilDecisions,
  type PostgresDirectory,
  type PostgresMinutes,
  type PostgresResources,
} from "@hall/postgres";
import { type AwilixContainer, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { Pool } from "pg";
import type { CouncilClient } from "../clients/councilClient.js";
import type { CouncilDecisionClient } from "../clients/councilDecisionClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { GeographicLayersClient } from "../clients/geographicLayersClient.js";
import type { MinutesClient } from "../clients/minutesClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { createSqlExecutor } from "../infrastructure/database/factory.js";
import { createMarkdownDocumentPreviewConverter } from "../infrastructure/documents/markdownDocumentPreviewConverter.js";
import { createLegifranceProvider } from "../infrastructure/legal/legifranceProvider.js";
import { createPostgresCouncilClient } from "../infrastructure/postgres/councilClient.js";
import { createPostgresCouncilDecisionClient } from "../infrastructure/postgres/councilDecisionClient.js";
import { createPostgresDirectoryClient } from "../infrastructure/postgres/directoryClient.js";
import { createPostgresGeographicLayersClient } from "../infrastructure/postgres/geographicLayersClient.js";
import { logIdleConnectionFailures } from "../infrastructure/postgres/idleConnectionFailures.js";
import { createPostgresMinutesClient } from "../infrastructure/postgres/minutesClient.js";
import { createPostgresResourcesClient } from "../infrastructure/postgres/resourcesClient.js";
import { createLiveEventBus, type LiveEventBus } from "../realtime/liveEvents.js";
import { createContentTemplateRepository } from "../repositories/contentTemplateRepository.js";
import type { ContentTemplateRepository, HallSettingsRepository, UnitOfWork } from "../repositories/contracts.js";
import { createHallSettingsRepository } from "../repositories/hallSettingsRepository.js";
import { createSecurityRepository, type SecurityRepository } from "../repositories/securityRepository.js";
import { RequestContextStore } from "../security/requestContext.js";
import { type AuthService, createAuthService } from "../services/authService.js";
import { type ContentTemplateService, createContentTemplateService } from "../services/contentTemplateService.js";
import { type CouncilBallotService, createCouncilBallotService } from "../services/councilBallotService.js";
import { createCouncilBusinessBundleExportService } from "../services/councilBusinessBundleExportService.js";
import { createCouncilBusinessBundleImportService } from "../services/councilBusinessBundleImportService.js";
import {
  type CouncilBusinessWorkspaceService,
  createCouncilBusinessWorkspaceService,
} from "../services/councilBusinessWorkspaceService.js";
import { type CouncilDecisionService, createCouncilDecisionService } from "../services/councilDecisionService.js";
import { createDirectoryService, type DirectoryService } from "../services/directoryService.js";
import {
  createDocumentaryResourceService,
  type DocumentaryResourceService,
} from "../services/documentaryResourceService.js";
import type { DocumentPreviewConverter } from "../services/documentPreviewConverter.js";
import { createDocumentRenderer, type DocumentRenderer } from "../services/documentRenderer.js";
import { createEventInvitationService, type EventInvitationService } from "../services/eventInvitationService.js";
import { createGeographicLayerService, type GeographicLayerService } from "../services/geographicLayerService.js";
import { createGeographicMapRenderer, type GeographicMapRenderer } from "../services/geographicMapRenderer.js";
import { createHallSettingsService, type HallSettingsService } from "../services/hallSettingsService.js";
import type { LegalReferenceProvider } from "../services/legalReferenceProvider.js";
import { createMeetingDossierService, type MeetingDossierService } from "../services/meetingDossierService.js";
import { createMeetingNoticeService, type MeetingNoticeService } from "../services/meetingNoticeService.js";
import { createMinutesService, type MinutesService } from "../services/minutesService.js";
import { createReferenceEntityResolver, type ReferenceEntityResolver } from "../services/referenceEntityResolver.js";
import { createTemplateRenderingService, type TemplateRenderingService } from "../services/templateRendering.js";
import type { ServerConfig } from "./config.js";

export interface ServerCompositionOptions {
  postgresPool?: Pool;
  postgresSchemaUpgradeMode?: "automatic" | "verify-only";
  schemaInitializationMode?: "automatic" | "verify-only";
}

export interface Cradle {
  config: ServerConfig;
  postgresPool: Pool | null;
  requestContext: RequestContextStore;
  realtimeEvents: LiveEventBus;
  sqlExecutor: SqlExecutor;
  postgresClient: PostgresClient | null;
  postgresCouncil: PostgresCouncil;
  postgresDirectory: PostgresDirectory;
  postgresResources: PostgresResources;
  postgresMinutes: PostgresMinutes;
  minutesClient: MinutesClient;
  minutesService: MinutesService;
  postgresCouncilDecisions: PostgresCouncilDecisions;
  councilDecisionClient: CouncilDecisionClient;
  councilDecisionService: CouncilDecisionService;
  meetingDossierService: MeetingDossierService;
  meetingNoticeService: MeetingNoticeService;
  directoryClient: DirectoryClient;
  councilClient: CouncilClient;
  unitOfWork: UnitOfWork;
  hallSettingsRepository: HallSettingsRepository;
  resourcesClient: ResourcesClient;
  geographicLayersClient: GeographicLayersClient;
  geographicLayerService: GeographicLayerService;
  contentTemplateRepository: ContentTemplateRepository;
  securityRepository: SecurityRepository;
  directoryService: DirectoryService;
  councilBallotService: CouncilBallotService;
  councilBusinessWorkspaceService: CouncilBusinessWorkspaceService;
  councilBusinessBundleExportService: ReturnType<typeof createCouncilBusinessBundleExportService>;
  councilBusinessBundleImportService: ReturnType<typeof createCouncilBusinessBundleImportService>;
  documentaryResourceService: DocumentaryResourceService;
  eventInvitationService: EventInvitationService;
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

export function buildContainer(config: ServerConfig, options: ServerCompositionOptions = {}): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    postgresPool: asValue(options.postgresPool ?? null),
    requestContext: asFunction(() => new RequestContextStore()).singleton(),
    realtimeEvents: asFunction(createLiveEventBus).singleton(),
    sqlExecutor: asFunction(({ config, requestContext, postgresPool }: Cradle) =>
      createSqlExecutor({ config, requestContext, postgresPool, schemaUpgradeMode: options.schemaInitializationMode }),
    ).singleton(),
    postgresClient: asFunction(({ config, postgresPool }: { config: ServerConfig; postgresPool: Pool | null }) => {
      if (config.database.kind !== "postgres") return null;
      return postgresPool
        ? new PostgresClient(postgresPool, false, options.postgresSchemaUpgradeMode)
        : new PostgresClient(
            logIdleConnectionFailures(createPostgresPool({ connectionString: config.database.url })),
            true,
            options.postgresSchemaUpgradeMode,
          );
    }).singleton(),
    unitOfWork: asFunction(({ sqlExecutor }: { sqlExecutor: SqlExecutor }) => sqlExecutor).singleton(),
    hallSettingsRepository: asFunction(createHallSettingsRepository).singleton(),
    contentTemplateRepository: asFunction(createContentTemplateRepository).singleton(),
    securityRepository: asFunction(createSecurityRepository).singleton(),
    minutesService: asFunction(createMinutesService).singleton(),
    councilDecisionService: asFunction(createCouncilDecisionService).singleton(),
    meetingDossierService: asFunction(createMeetingDossierService).singleton(),
    meetingNoticeService: asFunction(createMeetingNoticeService).singleton(),
    councilBallotService: asFunction(createCouncilBallotService).singleton(),
    councilBusinessWorkspaceService: asFunction(createCouncilBusinessWorkspaceService).singleton(),
    councilBusinessBundleExportService: asFunction(createCouncilBusinessBundleExportService).singleton(),
    councilBusinessBundleImportService: asFunction(createCouncilBusinessBundleImportService).singleton(),
    directoryService: asFunction(createDirectoryService).singleton(),
    documentaryResourceService: asFunction(createDocumentaryResourceService).singleton(),
    geographicLayerService: asFunction(createGeographicLayerService).singleton(),
    eventInvitationService: asFunction(createEventInvitationService).singleton(),
    referenceEntityResolver: asFunction(createReferenceEntityResolver).singleton(),
    authService: asFunction(createAuthService).singleton(),
    hallSettingsService: asFunction(createHallSettingsService).singleton(),
    geographicMapRenderer: asFunction(createGeographicMapRenderer).singleton(),
    templateRenderingService: asFunction(createTemplateRenderingService).singleton(),
    documentRenderer: asFunction(createDocumentRenderer).singleton(),
    documentPreviewConverter: asFunction(createMarkdownDocumentPreviewConverter).singleton(),
    legalReferenceProvider: asFunction(createLegifranceProvider).singleton(),
    contentTemplateService: asFunction(createContentTemplateService).singleton(),
  });
  if (config.database.kind === "postgres") {
    container.register({
      postgresCouncil: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Council PostgreSQL storage is required");
        return postgresClient.council;
      }).singleton(),
      postgresDirectory: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Directory PostgreSQL storage is required");
        return postgresClient.directory;
      }).singleton(),
      postgresResources: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Documentary PostgreSQL storage is required");
        return postgresClient.resources;
      }).singleton(),
      resourcesClient: asFunction(createPostgresResourcesClient).singleton(),
      geographicLayersClient: asFunction(createPostgresGeographicLayersClient).singleton(),
      postgresMinutes: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Minutes PostgreSQL storage is required");
        return postgresClient.minutes;
      }).singleton(),
      minutesClient: asFunction(createPostgresMinutesClient).singleton(),
      postgresCouncilDecisions: asFunction(({ postgresClient }: { postgresClient: PostgresClient | null }) => {
        if (!postgresClient) throw new Error("Decision PostgreSQL storage is required");
        return postgresClient.councilDecisions;
      }).singleton(),
      councilDecisionClient: asFunction(createPostgresCouncilDecisionClient).singleton(),
      councilClient: asFunction(createPostgresCouncilClient).singleton(),
      directoryClient: asFunction(createPostgresDirectoryClient).singleton(),
    });
  }
  return container;
}
