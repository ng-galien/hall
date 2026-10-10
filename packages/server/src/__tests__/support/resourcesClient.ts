import { createHash, randomUUID } from "node:crypto";
import type {
  EditorAsset,
  ResourceCatalogEntry,
  ResourceDetail,
  ResourceSearchResult,
  ResourceSummary,
  SirenEntity,
} from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import type {
  PersistResource,
  ResourceContent,
  ResourceMutationResult,
  ResourceRepresentation,
  ResourcesClient,
} from "../../clients/resourcesClient.js";

type StoredBinary = ResourceContent;

function checksum(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function slug(id: string): string {
  return `resource-${id.replaceAll("-", "").slice(0, 12)}`;
}

function fullPath(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

function representation<Data extends ResourceDetail>(data: Data): ResourceRepresentation<Data> {
  const value: SirenEntity = {
    class: ["resource"],
    properties: data,
    links: [{ rel: ["self"], href: `/api/resources/${data.id}` }],
  };
  return { data, representation: value };
}

function summary(resource: ResourceDetail): ResourceSummary {
  return resource;
}

/** Current ResourcesClient test double for service tests that do not exercise PostgreSQL itself. */
export function createTestResourcesClient(): ResourcesClient {
  const resources = new Map<string, ResourceDetail>();
  const binaries = new Map<string, StoredBinary>();
  const editorAssets = new Map<string, EditorAsset>();
  const now = () => new Date().toISOString();

  const find = (reference: string): ResourceDetail | null =>
    resources.get(reference) ?? [...resources.values()].find((resource) => resource.slug === reference) ?? null;

  const common = (kind: ResourceDetail["kind"], path: string, name: string) => {
    const id = randomUUID();
    const timestamp = now();
    return {
      id,
      slug: slug(id),
      path,
      name,
      fullPath: fullPath(path, name),
      kind,
      tags: [],
      state: { readiness: "ready" as const, availability: null },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const store = <Data extends ResourceDetail>(resource: Data): ResourceRepresentation<Data> => {
    resources.set(resource.id, resource);
    return representation(resource);
  };

  const mutation = (resource: ResourceDetail | null): ResourceMutationResult =>
    resource ? { status: "updated", resource: representation(resource) } : { status: "notFound" };

  return {
    async listAll() {
      const data: ResourceCatalogEntry[] = [...resources.values()];
      return {
        data,
        representation: {
          class: ["resource-collection"],
          properties: {},
          links: [{ rel: ["self"], href: "/api/resources/catalog" }],
        },
      };
    },
    async listFolder(path) {
      const data = [...resources.values()].filter((resource) => resource.path === path).map(summary);
      return {
        data,
        representation: {
          class: ["resource-collection"],
          properties: {},
          links: [{ rel: ["self"], href: "/api/resources" }],
        },
      };
    },
    async findDocumentsByHashes(hashes) {
      const data = [...resources.values()]
        .filter((resource) => resource.kind === "document" && hashes.includes(resource.binary.contentSha256))
        .map(summary);
      return {
        data,
        representation: {
          class: ["resource-collection"],
          properties: {},
          links: [{ rel: ["self"], href: "/api/resources/documents/by-hashes" }],
        },
      };
    },
    async search(criteria) {
      const query = criteria.query.toLocaleLowerCase();
      const items = [...resources.values()]
        .filter((resource) => !query || resource.name.toLocaleLowerCase().includes(query))
        .map(summary);
      const data: ResourceSearchResult = {
        total: items.length,
        items: items.slice(criteria.offset ?? 0, (criteria.offset ?? 0) + (criteria.limit ?? 100)),
        facets: { paths: [], tags: [], readiness: [], media: [] },
      };
      return {
        data,
        representation: {
          class: ["resource-search"],
          properties: data,
          links: [{ rel: ["self"], href: "/api/resources/search" }],
        },
      };
    },
    async open(reference) {
      const resource = find(reference);
      return resource ? representation(resource) : null;
    },
    async listTextResourceChanges() {
      return [];
    },
    async create(input: PersistResource) {
      return matchDiscriminated(input, "kind", {
        folder: (entry) => store({ ...common("folder", entry.path, entry.name), kind: "folder" }),
        text: (entry) =>
          store({
            ...common("text", entry.path, entry.name),
            kind: "text",
            content: entry.content,
            autosaveEnabled: true,
            version: 1,
            state: { readiness: entry.content.trim() ? "ready" : "empty", availability: null },
          }),
        remote: (entry) =>
          store({
            ...common("remote", entry.path, entry.name),
            kind: "remote",
            target: entry.target,
            autosaveEnabled: true,
            version: 1,
            state: { readiness: entry.target.kind === "url" ? "ready" : "incomplete", availability: null },
          }),
        spreadsheet: (entry) =>
          store({
            ...common("spreadsheet", entry.path, entry.name),
            kind: "spreadsheet",
            document: entry.document,
            autosaveEnabled: true,
            version: 1,
          }),
        geographic: (entry) =>
          store({
            ...common("geographic", entry.path, entry.name),
            kind: "geographic",
            document: entry.document,
            autosaveEnabled: true,
            version: 1,
            overlays: [],
          }),
        event: (entry) =>
          store({
            ...common("event", entry.path, entry.name),
            kind: "event",
            document: entry.document,
            autosaveEnabled: true,
            version: 1,
          }),
        legalReference: (entry) =>
          store({
            ...common("legalReference", entry.path, entry.name),
            kind: "legalReference",
            document: entry.document,
            version: 1,
          }),
      });
    },
    async createDocument(input) {
      const base = common("document", input.path, input.name);
      const binary = {
        content: input.content,
        mediaType: input.mediaType,
        byteSize: input.content.byteLength,
        contentSha256: checksum(input.content),
      };
      binaries.set(base.id, binary);
      return store({
        ...base,
        kind: "document",
        binary: {
          id: base.id,
          mediaType: binary.mediaType,
          byteSize: binary.byteSize,
          contentSha256: binary.contentSha256,
        },
      });
    },
    async relocate(reference, input) {
      const resource = find(reference);
      if (!resource) return { status: "notFound" };
      const updated = {
        ...resource,
        path: input.path,
        name: input.name,
        fullPath: fullPath(input.path, input.name),
        updatedAt: now(),
      };
      resources.set(updated.id, updated);
      return mutation(updated);
    },
    async updateMetadata(reference, input) {
      const resource = find(reference);
      if (!resource) return { status: "notFound" };
      const autosaveEnabled = input.editing.kind === "autosave" ? input.editing.enabled : undefined;
      const updated = {
        ...resource,
        path: input.path,
        name: input.name,
        fullPath: fullPath(input.path, input.name),
        tags: input.tags,
        ...(autosaveEnabled === undefined ? {} : { autosaveEnabled }),
        updatedAt: now(),
      } as ResourceDetail;
      resources.set(updated.id, updated);
      return mutation(updated);
    },
    async updateContent(reference, input) {
      const resource = find(reference);
      if (!resource) return { status: "notFound" };
      if (resource.kind !== input.kind) return { status: "kindMismatch" };
      const updated = { ...resource, ...input, version: input.expectedVersion + 1, updatedAt: now() } as ResourceDetail;
      resources.set(updated.id, updated);
      return mutation(updated);
    },
    async resolveLegalReference() {
      return { status: "kindMismatch" };
    },
    async createEditorAsset(input) {
      const id = randomUUID();
      const data: EditorAsset = {
        id,
        title: input.title,
        fileName: input.fileName,
        mediaType: input.mediaType,
        byteSize: input.content.byteLength,
        contentSha256: checksum(input.content),
        owner: { kind: "textResourceContent", id: input.ownerId },
        createdAt: now(),
      };
      editorAssets.set(id, data);
      binaries.set(id, {
        content: input.content,
        mediaType: input.mediaType,
        byteSize: input.content.byteLength,
        contentSha256: data.contentSha256,
      });
      return {
        data,
        representation: {
          class: ["editor-asset"],
          properties: data,
          links: [{ rel: ["self"], href: `/api/resources/editor-assets/${id}` }],
        },
      };
    },
    async openEditorAsset(id) {
      const data = editorAssets.get(id);
      return data
        ? {
            data,
            representation: {
              class: ["editor-asset"],
              properties: data,
              links: [{ rel: ["self"], href: `/api/resources/editor-assets/${id}` }],
            },
          }
        : null;
    },
    async readEditorAssetContent(id) {
      return binaries.get(id) ?? null;
    },
    async readBinaryReferenceContent(id) {
      return binaries.get(id) ?? null;
    },
    async replaceDocumentContent(reference, input) {
      const resource = find(reference);
      if (!resource) return { status: "notFound" };
      if (resource.kind !== "document") return { status: "kindMismatch" };
      const binary = {
        content: input.content,
        mediaType: input.mediaType,
        byteSize: input.content.byteLength,
        contentSha256: checksum(input.content),
      };
      binaries.set(resource.id, binary);
      const updated: ResourceDetail = {
        ...resource,
        binary: {
          id: resource.id,
          mediaType: binary.mediaType,
          byteSize: binary.byteSize,
          contentSha256: binary.contentSha256,
        },
        updatedAt: now(),
      };
      resources.set(updated.id, updated);
      return mutation(updated);
    },
    async readDocumentContent(reference) {
      const resource = find(reference);
      return resource?.kind === "document" ? (binaries.get(resource.id) ?? null) : null;
    },
    async delete(reference) {
      const resource = find(reference);
      if (!resource) return null;
      resources.delete(resource.id);
      binaries.delete(resource.id);
      return {
        data: summary(resource),
        representation: {
          class: ["resource"],
          properties: summary(resource),
          links: [{ rel: ["self"], href: `/api/resources/${resource.id}` }],
        },
      };
    },
  };
}
