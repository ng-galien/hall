import type {
  DocumentResource,
  EditorAssetOwner,
  FolderCreateResult,
  FolderRenameResult,
  RemoteResource,
  Resource,
  ResourceDetails,
  TextResource,
} from "@hall/domain";
import { folderPathSchema } from "@hall/domain";
import { inspectDocument } from "../domain/documentPolicy.js";
import type {
  AttendanceRepository,
  CouncilBusinessRepository,
  CouncilMeetingRepository,
  CreateDocumentResource,
  CreateRemoteResource,
  CreateTextResource,
  ResourceRepository,
  StoredResource,
  UnitOfWork,
  UpdateResource,
  WorkspaceFolderRepository,
} from "../repositories/contracts.js";
import type { EditorAssetService } from "./editorAssetService.js";
import { DomainError } from "./errors.js";

export interface ResourceService {
  list(filters?: {
    folderPath?: string;
    tags?: string[];
    kind?: Resource["kind"];
    meetingId?: string;
    usage?: "document" | "editorAsset";
    editorOwner?: EditorAssetOwner;
  }): Promise<Resource[]>;
  find(id: string): Promise<StoredResource | null>;
  getDetails(id: string): Promise<ResourceDetails>;
  listFolderPaths(): Promise<string[]>;
  createFolder(parentPath: string, name: string): Promise<FolderCreateResult>;
  renameFolder(folderPath: string, name: string): Promise<FolderRenameResult>;
  createText(input: CreateTextResource): Promise<TextResource>;
  createRemote(input: CreateRemoteResource): Promise<RemoteResource>;
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
  editorAssetService,
  workspaceFolderRepository,
}: {
  resourceRepository: ResourceRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  unitOfWork: UnitOfWork;
  councilBusinessRepository: CouncilBusinessRepository;
  attendanceRepository: AttendanceRepository;
  editorAssetService: EditorAssetService;
  workspaceFolderRepository: WorkspaceFolderRepository;
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
        referencedByContent: await resourceRepository.isReferencedByRichText(resource.id),
      };
    },
    async listFolderPaths() {
      const storedPaths = [
        ...(await workspaceFolderRepository.list()),
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
    createFolder(parentPath, name) {
      return unitOfWork.execute(async () => {
        const path = parentPath ? `${parentPath}/${name}` : name;
        const exists =
          (await workspaceFolderRepository.hasPrefix(path)) ||
          (await resourceRepository.hasFolderPathPrefix(path)) ||
          (await councilBusinessRepository.hasFolderPathPrefix(path));
        if (exists) throw new DomainError("workspace_folder_conflict", 409);
        const createdAt = new Date().toISOString();
        await workspaceFolderRepository.ensure(path, createdAt);
        return { path, createdAt };
      });
    },
    renameFolder(folderPath, name) {
      const separator = folderPath.lastIndexOf("/");
      const parentPath = separator < 0 ? "" : folderPath.slice(0, separator);
      const targetPath = folderPathSchema.parse(parentPath ? `${parentPath}/${name}` : name);
      return unitOfWork.execute(async () => {
        const sourceExists =
          (await workspaceFolderRepository.hasPrefix(folderPath)) ||
          (await resourceRepository.hasFolderPathPrefix(folderPath)) ||
          (await councilBusinessRepository.hasFolderPathPrefix(folderPath));
        if (!sourceExists) throw new DomainError("workspace_folder_not_found", 404);
        if (targetPath === folderPath) {
          return {
            sourcePath: folderPath,
            targetPath,
            folderCount: 0,
            resourceCount: 0,
            councilBusinessCount: 0,
            updatedAt: new Date().toISOString(),
          };
        }
        const targetExists =
          (await workspaceFolderRepository.hasPrefix(targetPath)) ||
          (await resourceRepository.hasFolderPathPrefix(targetPath)) ||
          (await councilBusinessRepository.hasFolderPathPrefix(targetPath));
        if (targetExists) throw new DomainError("workspace_folder_conflict", 409);
        const updatedAt = new Date().toISOString();
        const resourceCount = await resourceRepository.renameFolder(folderPath, targetPath, updatedAt);
        const councilBusinessCount = await councilBusinessRepository.renameFolder(folderPath, targetPath, updatedAt);
        const folderCount = await workspaceFolderRepository.rename(folderPath, targetPath);
        return { sourcePath: folderPath, targetPath, folderCount, resourceCount, councilBusinessCount, updatedAt };
      });
    },
    createText(input) {
      return unitOfWork.execute(async () => {
        const resource = await resourceRepository.createText(input);
        await editorAssetService.reconcile({ kind: "textResourceContent", id: resource.id }, resource.content);
        return resource;
      });
    },
    createRemote(input) {
      return unitOfWork.execute(() => resourceRepository.createRemote(input));
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
        if (resource.kind === "document" && resource.usage === "editorAsset") throw new DomainError("conflict", 409);
        if (resource.kind !== "text" && input.content !== undefined) throw new DomainError("invalid_request");
        if (resource.kind !== "remote" && input.url !== undefined) throw new DomainError("invalid_request");
        const contentChanged =
          resource.kind === "text" && input.content !== undefined && input.content !== resource.content;
        const urlChanged = resource.kind === "remote" && input.url !== undefined && input.url !== resource.url;
        const titleChanged = input.title !== resource.title;
        if ((contentChanged || urlChanged || titleChanged) && (await resourceRepository.isSnapshotted(resource.id))) {
          throw new DomainError("conflict", 409);
        }
        if (resource.folderPath && resource.folderPath !== input.folderPath) {
          await workspaceFolderRepository.ensure(resource.folderPath, new Date().toISOString());
        }
        const updated = await resourceRepository.update(resource.id, {
          title: input.title,
          folderPath: input.folderPath,
          tags: input.tags,
          content: resource.kind === "text" ? (input.content ?? resource.content) : undefined,
          url: resource.kind === "remote" ? (input.url ?? resource.url) : undefined,
        });
        if (updated.kind === "text") {
          await editorAssetService.reconcile({ kind: "textResourceContent", id: updated.id }, updated.content);
        }
        return updated;
      });
    },
    delete(id) {
      return unitOfWork.execute(async () => {
        const resource = await resourceRepository.findMetadata(id);
        if (resource?.kind === "document" && resource.usage === "editorAsset") throw new DomainError("conflict", 409);
        if (resource && (await resourceRepository.isReferencedByRichText(resource.id)))
          throw new DomainError("conflict", 409);
        if (resource?.kind === "text") {
          await editorAssetService.purgeOwner({ kind: "textResourceContent", id: resource.id });
        }
        if (!resource || !(await resourceRepository.delete(resource.id))) {
          throw new DomainError("resource_not_found", 404);
        }
      });
    },
  };
}
