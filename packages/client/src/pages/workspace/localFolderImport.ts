import { matchDiscriminated } from "@hall/domain";
export interface LocalFolderImport {
  directories: string[];
  files: { file: File; relativePath: string }[];
}

export function selectedFolder(files: FileList | readonly File[]): LocalFolderImport {
  const directories = new Set<string>();
  const entries = Array.from(files).map((file) => {
    const relativePath = file.webkitRelativePath || file.name;
    const segments = relativePath.split("/");
    for (let index = 1; index < segments.length; index++) directories.add(segments.slice(0, index).join("/"));
    return { file, relativePath };
  });
  return { directories: [...directories], files: entries };
}

/** Read each directory batch until empty: browsers may return only 100 entries per batch. */
export async function droppedFolder(transfer: DataTransfer): Promise<LocalFolderImport> {
  const roots = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (!roots.length) return selectedFolder(Array.from(transfer.files));
  const result: LocalFolderImport = { directories: [], files: [] };
  const walk = async (entry: FileSystemEntry, parent: string): Promise<void> => {
    const relativePath = parent ? `${parent}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      result.files.push({ file, relativePath });
      return;
    }
    result.directories.push(relativePath);
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const child of batch) await walk(child, relativePath);
    }
  };
  for (const root of roots) await walk(root, "");
  return result;
}

export interface LocalDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<LocalDirectoryHandle | LocalFileHandle>;
}
interface LocalFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

export async function pickedFolder(root: LocalDirectoryHandle): Promise<LocalFolderImport> {
  const result: LocalFolderImport = { directories: [], files: [] };
  const walk = async (directory: LocalDirectoryHandle, path: string): Promise<void> => {
    result.directories.push(path);
    for await (const entry of directory.values()) {
      await matchDiscriminated(entry, "kind", {
        file: async (file) => {
          result.files.push({ file: await file.getFile(), relativePath: `${path}/${file.name}` });
        },
        directory: (child) => walk(child, `${path}/${child.name}`),
      });
    }
  };
  await walk(root, root.name);
  return result;
}
