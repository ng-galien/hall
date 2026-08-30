import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { WorkspaceFolderRepository } from "./contracts.js";

export function createWorkspaceFolderRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): WorkspaceFolderRepository {
  return {
    async list() {
      return (await sqlExecutor.all("workspaceFolder.list")).map((row) => String(row.path));
    },
    hasPrefix(folderPath) {
      return sqlExecutor
        .get("workspaceFolder.existsPrefix", { folderPath, folderPrefix: `${folderPath}/` })
        .then(Boolean);
    },
    async ensure(folderPath, createdAt) {
      const segments = folderPath.split("/").filter(Boolean);
      for (let index = 0; index < segments.length; index += 1) {
        await sqlExecutor.run("workspaceFolder.insert", {
          path: segments.slice(0, index + 1).join("/"),
          createdAt,
        });
      }
    },
    rename(sourcePath, targetPath) {
      return sqlExecutor
        .run("workspaceFolder.rename", {
          sourcePath,
          sourcePrefix: `${sourcePath}/`,
          targetPath,
        })
        .then((result) => result.changes);
    },
  };
}
