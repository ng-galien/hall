import { type FolderCreateResult, type FolderRenameResult, folderPathSchema } from "@hall/domain";
import type {
  CouncilBusinessRepository,
  ResourceRepository,
  UnitOfWork,
  WorkspaceFolderRepository,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface WorkspaceFolderOperations {
  list(): Promise<string[]>;
  create(parentPath: string, name: string): Promise<FolderCreateResult>;
  rename(folderPath: string, name: string): Promise<FolderRenameResult>;
}

export function createWorkspaceFolderOperations({
  resourceRepository,
  councilBusinessRepository,
  workspaceFolderRepository,
  unitOfWork,
}: {
  resourceRepository: ResourceRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  workspaceFolderRepository: WorkspaceFolderRepository;
  unitOfWork: UnitOfWork;
}): WorkspaceFolderOperations {
  const hasPrefix = async (path: string) =>
    (await workspaceFolderRepository.hasPrefix(path)) ||
    (await resourceRepository.hasFolderPathPrefix(path)) ||
    (await councilBusinessRepository.hasFolderPathPrefix(path));

  return {
    async list() {
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
    create(parentPath, name) {
      return unitOfWork.execute(async () => {
        const path = folderPathSchema.parse(parentPath ? `${parentPath}/${name}` : name);
        if (await hasPrefix(path)) throw new DomainError("workspace_folder_conflict", 409);
        const createdAt = new Date().toISOString();
        await workspaceFolderRepository.ensure(path, createdAt);
        return { path, createdAt };
      });
    },
    rename(folderPath, name) {
      const separator = folderPath.lastIndexOf("/");
      const parentPath = separator < 0 ? "" : folderPath.slice(0, separator);
      const targetPath = folderPathSchema.parse(parentPath ? `${parentPath}/${name}` : name);
      return unitOfWork.execute(async () => {
        if (!(await hasPrefix(folderPath))) throw new DomainError("workspace_folder_not_found", 404);
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
        if (await hasPrefix(targetPath)) throw new DomainError("workspace_folder_conflict", 409);
        const updatedAt = new Date().toISOString();
        const resourceCount = await resourceRepository.renameFolder(folderPath, targetPath, updatedAt);
        const councilBusinessCount = await councilBusinessRepository.renameFolder(folderPath, targetPath, updatedAt);
        const folderCount = await workspaceFolderRepository.rename(folderPath, targetPath);
        return { sourcePath: folderPath, targetPath, folderCount, resourceCount, councilBusinessCount, updatedAt };
      });
    },
  };
}
