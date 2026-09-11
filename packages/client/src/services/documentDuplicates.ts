import type { ResourceSummary } from "@hall/api-contract";
import { apiSirenRequest } from "./apiClient";

export interface DocumentDuplicate {
  id: string;
  fileName: string;
  existing: Extract<ResourceSummary, { kind: "document" }>[];
}

export async function findDocumentDuplicates(files: readonly File[]): Promise<DocumentDuplicate[]> {
  const hashes: string[] = [];
  for (const file of files) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    hashes.push(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  const unique = [...new Set(hashes)];
  const matches: Extract<ResourceSummary, { kind: "document" }>[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    const query = new URLSearchParams({ sha256: unique.slice(index, index + 100).join(",") });
    const response = await apiSirenRequest<Extract<ResourceSummary, { kind: "document" }>[]>(
      `/resources/documents/by-hashes?${query}`,
    );
    matches.push(...response.data);
  }
  return files.flatMap((file, index) => {
    const existing = matches.filter((resource) => resource.binary.contentSha256 === hashes[index]);
    return existing.length
      ? [{ id: crypto.randomUUID(), fileName: file.webkitRelativePath || file.name, existing }]
      : [];
  });
}
