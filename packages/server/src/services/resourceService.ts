import type { DocumentResource, Resource, ResourceDetails, TextResource } from "@hall/domain";
import { inspectDocument } from "../domain/documentPolicy.js";
import type {
  AttendanceRepository,
  CouncilBusinessRepository,
  CouncilMeetingRepository,
  CreateDocumentResource,
  CreateTextResource,
  ResourceRepository,
  StoredResource,
  UnitOfWork,
  UpdateResource,
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
  update(id: string, input: UpdateResource): Promise<Resource>;
  delete(id: string): Promise<void>;
}

export function createResourceService({
  resourceRepository,
  councilMeetingRepository,
  unitOfWork,
  councilBusinessRepository,
  attendanceRepository,
}: {
  resourceRepository: ResourceRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  unitOfWork: UnitOfWork;
  councilBusinessRepository: CouncilBusinessRepository;
  attendanceRepository: AttendanceRepository;
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
      return {
        resource,
        councilBusiness: await councilBusinessRepository.list({ resourceId: resource.id }),
        snapshotted: await resourceRepository.isSnapshotted(resource.id),
        usedAsProxy: await attendanceRepository.isProxyDocumentUsed(resource.id),
      };
    },
    async listFolderPaths() {
      const storedPaths = [
        ...(await resourceRepository.listFolderPaths()),
        ...(await councilBusinessRepository.list()).map((business) => business.folderPath),
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
        return resourceRepository.createDocument({
          ...input,
          ...(await inspectDocument(input.fileName, input.content)),
        });
      });
    },
    update(id, input) {
      return unitOfWork.execute(async () => {
        const resource = await resourceRepository.findMetadata(id);
        if (!resource) throw new DomainError("resource_not_found", 404);
        if (resource.kind !== "text" && input.content !== undefined) throw new DomainError("invalid_request");
        const contentChanged =
          resource.kind === "text" && input.content !== undefined && input.content !== resource.content;
        const titleChanged = input.title !== resource.title;
        // Une ressource photographiée dans une occurrence historique garde titre et contenu ;
        // seul son classement (chemin, tags) reste modifiable.
        if ((contentChanged || titleChanged) && (await resourceRepository.isSnapshotted(resource.id))) {
          throw new DomainError("conflict", 409);
        }
        return resourceRepository.update(resource.id, {
          title: input.title,
          folderPath: input.folderPath,
          tags: input.tags,
          content: resource.kind === "text" ? (input.content ?? resource.content) : undefined,
        });
      });
    },
    delete(id) {
      return unitOfWork.execute(async () => {
        const resource = await resourceRepository.findMetadata(id);
        if (!resource || !(await resourceRepository.delete(resource.id))) {
          throw new DomainError("resource_not_found", 404);
        }
      });
    },
  };
}
