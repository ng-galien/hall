import type {
  CreateResource,
  EditorAsset,
  RelocateResource,
  ResourceCatalogEntry,
  ResourceDetail,
  ResourceJsonObject,
  ResourceSearchCriteria,
  ResourceSearchResult,
  ResourceSummary,
  SirenEntity,
  UpdateResourceContent,
  UpdateResourceMetadata,
} from "@hall/api-contract";

export type ResourceContent = Readonly<{
  content: Buffer;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
}>;

export type ResourceRepresentation<Data> = Readonly<{
  data: Data;
  representation: SirenEntity;
}>;

export type ResourceMutationResult =
  | { status: "updated"; resource: ResourceRepresentation<ResourceDetail> }
  | { status: "notFound" }
  | { status: "versionConflict" }
  | { status: "kindMismatch" };

export type ResourceAuditChange = Readonly<{
  id: string;
  actorId: string | null;
  kind: "content" | "metadata" | "location" | "creation" | "operation";
  changedFields: readonly ("content" | "name" | "path" | "tags" | "autosave" | "color")[];
  occurredAt: string;
}>;

export type PersistResource =
  | Exclude<CreateResource, { kind: "geographic" | "legalReference" }>
  | (Extract<CreateResource, { kind: "geographic" }> & {
      document: Extract<ResourceDetail, { kind: "geographic" }>["document"];
    })
  | (Extract<CreateResource, { kind: "legalReference" }> & {
      document: Extract<ResourceDetail, { kind: "legalReference" }>["document"];
    });

/** Thin server-side client for the resource operations exposed by PostgreSQL. */
export interface ResourcesClient {
  listAll(): Promise<ResourceRepresentation<ResourceCatalogEntry[]>>;
  listFolder(path: string): Promise<ResourceRepresentation<ResourceSummary[]> | null>;
  findDocumentsByHashes(hashes: readonly string[]): Promise<ResourceRepresentation<ResourceSummary[]>>;
  search(criteria: ResourceSearchCriteria): Promise<ResourceRepresentation<ResourceSearchResult>>;
  open(reference: string): Promise<ResourceRepresentation<ResourceDetail> | null>;
  listResourceChanges(id: string): Promise<ResourceAuditChange[]>;
  create(input: PersistResource): Promise<ResourceRepresentation<ResourceDetail>>;
  provisionPersonalWorkspace(contactId: string): Promise<ResourceRepresentation<ResourceDetail>>;
  personalWorkspace(): Promise<ResourceRepresentation<ResourceDetail> | null>;
  createDocument(input: {
    councilBusinessId?: string;
    path: string;
    name: string;
    mediaType: string;
    content: Buffer;
  }): Promise<ResourceRepresentation<ResourceDetail>>;
  relocate(reference: string, input: RelocateResource): Promise<ResourceMutationResult>;
  updateMetadata(reference: string, input: UpdateResourceMetadata): Promise<ResourceMutationResult>;
  updateContent(
    reference: string,
    input: UpdateResourceContent,
    referencedEditorAssetIds?: readonly string[],
  ): Promise<ResourceMutationResult>;
  resolveLegalReference(
    reference: string,
    input: { expectedVersion: number; name: string; document: ResourceJsonObject },
  ): Promise<ResourceMutationResult>;
  createEditorAsset(input: {
    ownerId: string;
    title: string;
    fileName: string;
    mediaType: "image/jpeg" | "image/png";
    content: Buffer;
  }): Promise<ResourceRepresentation<EditorAsset>>;
  openEditorAsset(id: string): Promise<ResourceRepresentation<EditorAsset> | null>;
  readEditorAssetContent(id: string): Promise<ResourceContent | null>;
  readBinaryReferenceContent(id: string): Promise<ResourceContent | null>;
  replaceDocumentContent(
    reference: string,
    input: { mediaType: string; content: Buffer },
  ): Promise<ResourceMutationResult>;
  readDocumentContent(reference: string): Promise<ResourceContent | null>;
  delete(reference: string): Promise<ResourceRepresentation<ResourceSummary> | null>;
}
