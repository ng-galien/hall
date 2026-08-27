import type { DocumentResource, Resource, ResourceDetails, TextResource } from "@mairie/domain";
import type {
  CouncilMeetingRepository,
  CreateDocumentResource,
  CreateTextResource,
  ResourceRepository,
  StoredResource,
  TopicRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface ResourceService {
  list(filters?: {
    folderPath?: string;
    tags?: string[];
    kind?: Resource["kind"];
    meetingId?: string;
  }): Promise<Resource[]>;
  find(id: string): Promise<StoredResource | null>;
  getDetails(id: string): Promise<ResourceDetails>;
  listFolderPaths(): Promise<string[]>;
  createText(input: CreateTextResource): Promise<TextResource>;
  createDocument(input: CreateDocumentResource): Promise<DocumentResource>;
  delete(id: string): Promise<void>;
}

export function createResourceService({
  resourceRepository,
  councilMeetingRepository,
  unitOfWork,
  topicRepository,
}: {
  resourceRepository: ResourceRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  unitOfWork: UnitOfWork;
  topicRepository: TopicRepository;
}): ResourceService {
  return {
    list(filters) {
      return resourceRepository.list(filters);
    },
    find(id) {
      return resourceRepository.find(id);
    },
    async getDetails(id) {
      const resource = await resourceRepository.findMetadata(id);
      if (!resource) throw new DomainError("resource_not_found", 404);
      return { resource, topics: await topicRepository.list({ resourceId: id }) };
    },
    async listFolderPaths() {
      const storedPaths = [
        ...(await resourceRepository.listFolderPaths()),
        ...(await topicRepository.list()).map((topic) => topic.folderPath),
      ];
      const paths = new Set<string>();
      for (const storedPath of storedPaths) {
        const segments = storedPath.split("/").filter(Boolean);
        segments.forEach((_segment, index) => {
          paths.add(segments.slice(0, index + 1).join("/"));
        });
      }
      return [...paths].sort((left, right) => left.localeCompare(right, "fr-FR"));
    },
    createText(input) {
      return unitOfWork.execute(() => resourceRepository.createText(input));
    },
    createDocument(input) {
      return unitOfWork.execute(async () => {
        if (input.meetingId && !(await councilMeetingRepository.find(input.meetingId))) {
          throw new DomainError("meeting_not_found", 404);
        }
        if (input.category === "proxy" && !input.meetingId) throw new DomainError("invalid_request");
        return resourceRepository.createDocument(input);
      });
    },
    delete(id) {
      return unitOfWork.execute(async () => {
        if (!(await resourceRepository.delete(id))) throw new DomainError("resource_not_found", 404);
      });
    },
  };
}
