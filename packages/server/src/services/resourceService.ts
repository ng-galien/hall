import {
  type DocumentResource,
  type DocumentUsage,
  type EditorAssetOwner,
  type FolderCreateResult,
  type FolderRenameResult,
  type GeographicResource,
  type LegalReferenceResource,
  type LegalReferenceSearchResult,
  matchDiscriminated,
  type RemoteResource,
  type Resource,
  type ResourceDetails,
  type SpreadsheetResource,
  type TextResource,
} from "@hall/domain";
import { inspectDocument } from "../domain/documentPolicy.js";
import type {
  AttendanceRepository,
  CouncilBusinessRepository,
  CouncilMeetingRepository,
  CreateDocumentResource,
  CreateGeographicResource,
  CreateLegalReferenceResource,
  CreateRemoteResource,
  CreateSpreadsheetResource,
  CreateTextResource,
  HallSettingsRepository,
  ResourceRepository,
  StoredResource,
  UnitOfWork,
  UpdateGeographicResource,
  UpdateResource,
  UpdateSpreadsheetResource,
  WorkspaceFolderRepository,
} from "../repositories/contracts.js";
import type { EditorAssetService } from "./editorAssetService.js";
import { DomainError } from "./errors.js";
import type { LegalReferenceProvider } from "./legalReferenceProvider.js";
import { createLegalReferenceResourceOperations } from "./legalReferenceResourceOperations.js";
import { createWorkspaceFolderOperations } from "./workspaceFolderOperations.js";

const DEFAULT_GEOGRAPHIC_RESOURCE_ZOOM = 15;
type UpdateResourceInput = Omit<UpdateResource, "autosaveEnabled"> & { autosaveEnabled?: boolean };

function resourceUpdateFields(resource: Resource, input: UpdateResourceInput) {
  return matchDiscriminated(resource, "kind", {
    text: (entry) => {
      if (input.url !== undefined) throw new DomainError("invalid_request");
      return {
        contentChanged: input.content !== undefined && input.content !== entry.content,
        urlChanged: false,
        content: input.content ?? entry.content,
        url: undefined,
      };
    },
    remote: (entry) => {
      if (input.content !== undefined) throw new DomainError("invalid_request");
      return {
        contentChanged: false,
        urlChanged: input.url !== undefined && input.url !== entry.url,
        content: undefined,
        url: input.url ?? entry.url,
      };
    },
    document: (entry) => {
      if (entry.usage === "editorAsset") throw new DomainError("conflict", 409);
      if (input.content !== undefined || input.url !== undefined) throw new DomainError("invalid_request");
      return { contentChanged: false, urlChanged: false, content: undefined, url: undefined };
    },
    spreadsheet: () => {
      if (input.content !== undefined || input.url !== undefined) throw new DomainError("invalid_request");
      return { contentChanged: false, urlChanged: false, content: undefined, url: undefined };
    },
    geographic: () => {
      if (input.content !== undefined || input.url !== undefined) throw new DomainError("invalid_request");
      return { contentChanged: false, urlChanged: false, content: undefined, url: undefined };
    },
    legalReference: () => {
      if (input.content !== undefined || input.url !== undefined) throw new DomainError("invalid_request");
      return { contentChanged: false, urlChanged: false, content: undefined, url: undefined };
    },
  });
}

export interface ResourceService {
  list(filters?: {
    folderPath?: string;
    tags?: string[];
    kind?: Resource["kind"];
    meetingId?: string;
    usage?: DocumentUsage;
    editorOwner?: EditorAssetOwner;
  }): Promise<Resource[]>;
  find(id: string): Promise<StoredResource | null>;
  getDetails(id: string): Promise<ResourceDetails>;
  listFolderPaths(): Promise<string[]>;
  createFolder(parentPath: string, name: string): Promise<FolderCreateResult>;
  renameFolder(folderPath: string, name: string): Promise<FolderRenameResult>;
  createText(input: CreateTextResource): Promise<TextResource>;
  createSpreadsheet(input: CreateSpreadsheetResource): Promise<SpreadsheetResource>;
  updateSpreadsheet(id: string, input: UpdateSpreadsheetResource): Promise<SpreadsheetResource>;
  createRemote(input: CreateRemoteResource): Promise<RemoteResource>;
  createGeographic(
    input: Omit<CreateGeographicResource, "view"> & { view?: CreateGeographicResource["view"] },
  ): Promise<GeographicResource>;
  updateGeographic(id: string, input: UpdateGeographicResource): Promise<GeographicResource>;
  searchLegalReferences(input: { query: string; effectiveAt: string | null }): Promise<LegalReferenceSearchResult[]>;
  createLegalReference(
    input: Pick<CreateLegalReferenceResource, "title" | "folderPath" | "tags" | "provider" | "referenceKind">,
  ): Promise<LegalReferenceResource>;
  resolveLegalReference(
    id: string,
    input: Pick<CreateLegalReferenceResource, "title" | "provider" | "referenceKind" | "fund"> & {
      versionId: string;
      effectiveAt: string | null;
    },
  ): Promise<LegalReferenceResource>;
  refreshLegalReference(id: string, expectedSnapshotHash: string): Promise<LegalReferenceResource>;
  createDocument(input: CreateDocumentResource): Promise<DocumentResource>;
  update(id: string, input: UpdateResourceInput): Promise<Resource>;
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
  hallSettingsRepository,
  legalReferenceProvider,
}: {
  resourceRepository: ResourceRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  unitOfWork: UnitOfWork;
  councilBusinessRepository: CouncilBusinessRepository;
  attendanceRepository: AttendanceRepository;
  editorAssetService: EditorAssetService;
  workspaceFolderRepository: WorkspaceFolderRepository;
  hallSettingsRepository: HallSettingsRepository;
  legalReferenceProvider: LegalReferenceProvider;
}): ResourceService {
  const workspaceFolders = createWorkspaceFolderOperations({
    resourceRepository,
    councilBusinessRepository,
    workspaceFolderRepository,
    unitOfWork,
  });
  const legalReferences = createLegalReferenceResourceOperations({
    resourceRepository,
    unitOfWork,
    legalReferenceProvider,
  });
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
      const { geography, spreadsheet, legalSnapshots } = await matchDiscriminated(resource, "kind", {
        geographic: async (entry) => ({
          geography: await resourceRepository.findGeographicData(entry.id),
          spreadsheet: null,
          legalSnapshots: null,
        }),
        spreadsheet: async (entry) => ({
          geography: null,
          spreadsheet: await resourceRepository.findSpreadsheetDocument(entry.id),
          legalSnapshots: null,
        }),
        legalReference: async (entry) => ({
          geography: null,
          spreadsheet: null,
          legalSnapshots: await resourceRepository.listLegalReferenceSnapshots(entry.id),
        }),
        text: async () => ({ geography: null, spreadsheet: null, legalSnapshots: null }),
        document: async () => ({ geography: null, spreadsheet: null, legalSnapshots: null }),
        remote: async () => ({ geography: null, spreadsheet: null, legalSnapshots: null }),
      });
      return {
        resource,
        geography,
        spreadsheet,
        legalSnapshots,
        councilBusiness: await councilBusinessRepository.list({ resourceId: resource.id }),
        snapshotted: await resourceRepository.isSnapshotted(resource.id),
        usedAsProxy: await attendanceRepository.isProxyDocumentUsed(resource.id),
        referencedByContent: await resourceRepository.isReferencedByRichText(resource.id),
      };
    },
    listFolderPaths() {
      return workspaceFolders.list();
    },
    createFolder(parentPath, name) {
      return workspaceFolders.create(parentPath, name);
    },
    renameFolder(folderPath, name) {
      return workspaceFolders.rename(folderPath, name);
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
    createSpreadsheet(input) {
      return unitOfWork.execute(() => resourceRepository.createSpreadsheet(input));
    },
    async updateSpreadsheet(id, input) {
      if (await resourceRepository.isSnapshotted(id)) throw new DomainError("conflict", 409);
      const result = await unitOfWork.execute(() => resourceRepository.updateSpreadsheet(id, input));
      if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
      if (result.status === "versionConflict") throw new DomainError("conflict", 409);
      return result.resource;
    },
    async createGeographic(input) {
      const hall = await hallSettingsRepository.get();
      const view =
        input.view ??
        (hall.geographicPosition
          ? { kind: "center" as const, center: hall.geographicPosition, zoom: DEFAULT_GEOGRAPHIC_RESOURCE_ZOOM }
          : { kind: "center" as const, center: [2.2137, 46.2276] as [number, number], zoom: 6 });
      return unitOfWork.execute(() => resourceRepository.createGeographic({ ...input, view }));
    },
    async updateGeographic(id, input) {
      const result = await unitOfWork.execute(() => resourceRepository.updateGeographic(id, input));
      if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
      if (result.status === "versionConflict") throw new DomainError("conflict", 409);
      return result.resource;
    },
    searchLegalReferences(input) {
      return legalReferences.search(input);
    },
    createLegalReference(input) {
      return legalReferences.create(input);
    },
    resolveLegalReference(id, input) {
      return legalReferences.resolve(id, input);
    },
    refreshLegalReference(id, expectedSnapshotHash) {
      return legalReferences.refresh(id, expectedSnapshotHash);
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
        const fields = resourceUpdateFields(resource, input);
        const titleChanged = input.title !== resource.title;
        if (
          (fields.contentChanged || fields.urlChanged || titleChanged) &&
          (await resourceRepository.isSnapshotted(resource.id))
        ) {
          throw new DomainError("conflict", 409);
        }
        if (resource.folderPath && resource.folderPath !== input.folderPath) {
          await workspaceFolderRepository.ensure(resource.folderPath, new Date().toISOString());
        }
        const updated = await resourceRepository.update(resource.id, {
          title: input.title,
          folderPath: input.folderPath,
          tags: input.tags,
          autosaveEnabled: input.autosaveEnabled ?? resource.autosaveEnabled,
          content: fields.content,
          url: fields.url,
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
