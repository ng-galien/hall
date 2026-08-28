import { type AwilixContainer, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import { createSqlExecutor } from "../infrastructure/database/factory.js";
import { createAgendaRepository } from "../repositories/agendaRepository.js";
import { createAttendanceRepository } from "../repositories/attendanceRepository.js";
import { createBallotRepository } from "../repositories/ballotRepository.js";
import type {
  AgendaRepository,
  AttendanceRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  MeetingRosterRepository,
  ResourceRepository,
  TopicRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { createCouncilDecisionRepository } from "../repositories/councilDecisionRepository.js";
import { createCouncilMeetingRepository } from "../repositories/councilMeetingRepository.js";
import { createCouncilMemberRepository } from "../repositories/councilMemberRepository.js";
import { createMeetingRosterRepository } from "../repositories/meetingRosterRepository.js";
import { createResourceRepository } from "../repositories/resourceRepository.js";
import { createSecurityRepository, type SecurityRepository } from "../repositories/securityRepository.js";
import { createTopicRepository } from "../repositories/topicRepository.js";
import { RequestContextStore } from "../security/requestContext.js";
import { type AuthService, createAuthService } from "../services/authService.js";
import { type BallotService, createBallotService } from "../services/ballotService.js";
import { type CouncilMeetingService, createCouncilMeetingService } from "../services/councilMeetingService.js";
import { createMeetingAgendaService, type MeetingAgendaService } from "../services/meetingAgendaService.js";
import { createMeetingLifecycleService, type MeetingLifecycleService } from "../services/meetingLifecycleService.js";
import {
  createMeetingPreparationService,
  type MeetingPreparationService,
} from "../services/meetingPreparationService.js";
import { createResourceService, type ResourceService } from "../services/resourceService.js";
import { createTopicService, type TopicService } from "../services/topicService.js";
import type { ServerConfig } from "./config.js";

export interface Cradle {
  config: ServerConfig;
  requestContext: RequestContextStore;
  sqlExecutor: SqlExecutor;
  unitOfWork: UnitOfWork;
  councilMemberRepository: CouncilMemberRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  attendanceRepository: AttendanceRepository;
  agendaRepository: AgendaRepository;
  ballotRepository: BallotRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  resourceRepository: ResourceRepository;
  meetingRosterRepository: MeetingRosterRepository;
  topicRepository: TopicRepository;
  securityRepository: SecurityRepository;
  councilMeetingService: CouncilMeetingService;
  meetingLifecycleService: MeetingLifecycleService;
  meetingAgendaService: MeetingAgendaService;
  meetingPreparationService: MeetingPreparationService;
  ballotService: BallotService;
  topicService: TopicService;
  resourceService: ResourceService;
  authService: AuthService;
}

export function buildContainer(config: ServerConfig): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    requestContext: asFunction(() => new RequestContextStore()).singleton(),
    sqlExecutor: asFunction(createSqlExecutor).singleton(),
    unitOfWork: asFunction(({ sqlExecutor }: { sqlExecutor: SqlExecutor }) => sqlExecutor).singleton(),
    councilMemberRepository: asFunction(createCouncilMemberRepository).singleton(),
    councilMeetingRepository: asFunction(createCouncilMeetingRepository).singleton(),
    attendanceRepository: asFunction(createAttendanceRepository).singleton(),
    agendaRepository: asFunction(createAgendaRepository).singleton(),
    ballotRepository: asFunction(createBallotRepository).singleton(),
    councilDecisionRepository: asFunction(createCouncilDecisionRepository).singleton(),
    resourceRepository: asFunction(createResourceRepository).singleton(),
    meetingRosterRepository: asFunction(createMeetingRosterRepository).singleton(),
    topicRepository: asFunction(createTopicRepository).singleton(),
    securityRepository: asFunction(createSecurityRepository).singleton(),
    councilMeetingService: asFunction(createCouncilMeetingService).singleton(),
    meetingLifecycleService: asFunction(createMeetingLifecycleService).singleton(),
    meetingAgendaService: asFunction(createMeetingAgendaService).singleton(),
    meetingPreparationService: asFunction(createMeetingPreparationService).singleton(),
    ballotService: asFunction(createBallotService).singleton(),
    topicService: asFunction(createTopicService).singleton(),
    resourceService: asFunction(createResourceService).singleton(),
    authService: asFunction(createAuthService).singleton(),
  });
  return container;
}
