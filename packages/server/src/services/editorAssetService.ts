import { type DocumentCategory, type DocumentResource, type EditorAssetOwner, matchDiscriminated } from "@hall/domain";
import { collectResourceReferences, parse } from "@hall/templating";
import { inspectDocument } from "../domain/documentPolicy.js";
import type {
  AgendaItemRepository,
  CouncilBusinessRepository,
  CouncilDecisionRepository,
  CreateEditorAssetResource,
  ResourceRepository,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface EditorAssetService {
  create(input: CreateEditorAssetResource): Promise<DocumentResource>;
  promote(
    id: string,
    input: { title: string; folderPath: string; tags: string[]; category: DocumentCategory },
  ): Promise<DocumentResource>;
  reconcile(owner: EditorAssetOwner, markdown: string): Promise<string[]>;
  purgeOwner(owner: EditorAssetOwner): Promise<string[]>;
}

export function createEditorAssetService({
  resourceRepository,
  councilBusinessRepository,
  councilDecisionRepository,
  agendaItemRepository,
}: {
  resourceRepository: ResourceRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  agendaItemRepository: AgendaItemRepository;
}): EditorAssetService {
  const ownerFolderPath = (owner: EditorAssetOwner): Promise<string> =>
    matchDiscriminated(owner, "kind", {
      textResourceContent: async (entry) => {
        const resource = await resourceRepository.findMetadata(entry.id);
        if (resource?.kind !== "text") throw new DomainError("resource_not_found", 404);
        return resource.folderPath;
      },
      councilBusinessReport: async (entry) => {
        const business = await councilBusinessRepository.find(entry.id);
        if (!business) throw new DomainError("council_business_not_found", 404);
        return business.folderPath;
      },
      councilDecisionDraft: async (entry) => {
        const decision = await councilDecisionRepository.find(entry.id);
        if (!decision) throw new DomainError("council_decision_not_found", 404);
        return (await councilBusinessRepository.findForCouncilDecision(decision.id))?.folderPath ?? "";
      },
      agendaItemDiscussionSummary: async (entry) => {
        const item = await agendaItemRepository.findById(entry.id);
        if (!item) throw new DomainError("agenda_item_not_found", 404);
        return item.business.folderPath;
      },
    });

  const referencedResourceIds = async (owner: EditorAssetOwner, markdown: string): Promise<string[]> => {
    const ids = new Set<string>();
    for (const reference of collectResourceReferences(parse(markdown))) {
      const resource = await resourceRepository.findMetadata(reference.id);
      if (!resource) throw new DomainError("resource_not_found", 404);
      const isImagePresentation =
        reference.directive === "image" ||
        (reference.directive === "resource-embed" && reference.presentation === "image");
      if (isImagePresentation && (resource.kind !== "document" || !["jpeg", "png"].includes(resource.format))) {
        throw new DomainError("invalid_request");
      }
      if (resource.kind === "document" && resource.usage === "editorAsset") {
        if (!isImagePresentation || resource.editorOwner.kind !== owner.kind || resource.editorOwner.id !== owner.id) {
          throw new DomainError("conflict", 409);
        }
      }
      ids.add(resource.id);
    }
    return [...ids];
  };

  return {
    async create(input) {
      const inspection = await inspectDocument(input.fileName, input.content);
      if (inspection.format !== "jpeg" && inspection.format !== "png") {
        throw new DomainError("unsupported_document_format", 415);
      }
      return resourceRepository.createEditorAsset({
        ...input,
        folderPath: await ownerFolderPath(input.owner),
        format: inspection.format,
        mediaType: inspection.format === "jpeg" ? "image/jpeg" : "image/png",
        contentSha256: inspection.contentSha256,
      });
    },
    async promote(id, input) {
      if (input.category === "proxy") throw new DomainError("invalid_request");
      const promoted = await resourceRepository.promoteEditorAsset(id, input);
      if (!promoted) throw new DomainError("resource_not_found", 404);
      return promoted;
    },
    async reconcile(owner, markdown) {
      await ownerFolderPath(owner);
      return resourceRepository.reconcileEditorAssets(owner, await referencedResourceIds(owner, markdown));
    },
    purgeOwner(owner) {
      return resourceRepository.reconcileEditorAssets(owner, []);
    },
  };
}
