import { type AwilixContainer, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import { createSqliteExecutor } from "../infrastructure/sqlite/database.js";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
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
import { createTopicRepository } from "../repositories/topicRepository.js";
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
  sqliteExecutor: SqliteExecutor;
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
  councilMeetingService: CouncilMeetingService;
  meetingLifecycleService: MeetingLifecycleService;
  meetingAgendaService: MeetingAgendaService;
  meetingPreparationService: MeetingPreparationService;
  ballotService: BallotService;
  topicService: TopicService;
  resourceService: ResourceService;
}

export function buildContainer(config: ServerConfig): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    sqliteExecutor: asFunction(createSqliteExecutor).singleton(),
    unitOfWork: asFunction(({ sqliteExecutor }: { sqliteExecutor: SqliteExecutor }) => sqliteExecutor).singleton(),
    councilMemberRepository: asFunction(createCouncilMemberRepository).singleton(),
    councilMeetingRepository: asFunction(createCouncilMeetingRepository).singleton(),
    attendanceRepository: asFunction(createAttendanceRepository).singleton(),
    agendaRepository: asFunction(createAgendaRepository).singleton(),
    ballotRepository: asFunction(createBallotRepository).singleton(),
    councilDecisionRepository: asFunction(createCouncilDecisionRepository).singleton(),
    resourceRepository: asFunction(createResourceRepository).singleton(),
    meetingRosterRepository: asFunction(createMeetingRosterRepository).singleton(),
    topicRepository: asFunction(createTopicRepository).singleton(),
    councilMeetingService: asFunction(createCouncilMeetingService).singleton(),
    meetingLifecycleService: asFunction(createMeetingLifecycleService).singleton(),
    meetingAgendaService: asFunction(createMeetingAgendaService).singleton(),
    meetingPreparationService: asFunction(createMeetingPreparationService).singleton(),
    ballotService: asFunction(createBallotService).singleton(),
    topicService: asFunction(createTopicService).singleton(),
    resourceService: asFunction(createResourceService).singleton(),
  });
  return container;
}
