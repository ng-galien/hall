import { createHash } from "node:crypto";
import type { LegalReferenceResource, LegalReferenceSearchResult } from "@hall/domain";
import type { CreateLegalReferenceResource, ResourceRepository, UnitOfWork } from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import {
  type LegalReferenceProvider,
  type LegalReferenceProviderSnapshot,
  OfficialSourceError,
} from "./legalReferenceProvider.js";

type LegalReferenceDraftInput = Pick<
  CreateLegalReferenceResource,
  "title" | "folderPath" | "tags" | "provider" | "referenceKind"
>;
type LegalReferenceResolutionInput = Pick<
  CreateLegalReferenceResource,
  "title" | "provider" | "referenceKind" | "fund"
> & {
  versionId: string;
  effectiveAt: string | null;
};

export interface LegalReferenceResourceOperations {
  search(input: { query: string; effectiveAt: string | null }): Promise<LegalReferenceSearchResult[]>;
  create(input: LegalReferenceDraftInput): Promise<LegalReferenceResource>;
  resolve(id: string, input: LegalReferenceResolutionInput): Promise<LegalReferenceResource>;
  refresh(id: string, expectedSnapshotHash: string): Promise<LegalReferenceResource>;
}

function officialSourceFailure(error: unknown): DomainError {
  if (error instanceof OfficialSourceError && error.reason === "accessDenied") {
    return new DomainError("official_source_access_denied", 503);
  }
  if (error instanceof OfficialSourceError && error.reason === "invalidResponse") {
    return new DomainError("official_source_invalid_response", 502);
  }
  return new DomainError("official_source_unavailable", 503);
}

function snapshotHash(snapshot: LegalReferenceProviderSnapshot): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        commonId: snapshot.commonId,
        versionId: snapshot.versionId,
        effectiveAt: snapshot.effectiveAt,
        fetchedAt: snapshot.fetchedAt,
        validFrom: snapshot.validFrom,
        validTo: snapshot.validTo,
        legalStatus: snapshot.legalStatus,
        normalizedContent: snapshot.normalizedContent,
      }),
    )
    .digest("hex");
}

export function createLegalReferenceResourceOperations({
  resourceRepository,
  unitOfWork,
  legalReferenceProvider,
}: {
  resourceRepository: ResourceRepository;
  unitOfWork: UnitOfWork;
  legalReferenceProvider: LegalReferenceProvider;
}): LegalReferenceResourceOperations {
  const providerSnapshot = async (
    input:
      | { fund: CreateLegalReferenceResource["fund"]; versionId: string; effectiveAt: string | null }
      | { fund: CreateLegalReferenceResource["fund"]; commonId: string; effectiveAt: string | null },
  ) => {
    const snapshot =
      "versionId" in input
        ? await legalReferenceProvider.fetchArticle(input)
        : await legalReferenceProvider.refreshArticle(input);
    if (
      ("versionId" in input ? snapshot.versionId !== input.versionId : snapshot.commonId !== input.commonId) ||
      snapshot.effectiveAt !== input.effectiveAt
    ) {
      throw new OfficialSourceError("invalidResponse");
    }
    return {
      sourceUrl: snapshot.sourceUrl,
      providerUpdatedAt: snapshot.providerUpdatedAt,
      citationLabel: snapshot.citationLabel,
      attribution: snapshot.attribution,
      snapshot: {
        commonId: snapshot.commonId,
        versionId: snapshot.versionId,
        effectiveAt: snapshot.effectiveAt,
        fetchedAt: snapshot.fetchedAt,
        validFrom: snapshot.validFrom,
        validTo: snapshot.validTo,
        legalStatus: snapshot.legalStatus,
        rawProviderPayload: JSON.stringify(snapshot.rawProviderPayload),
        normalizedContent: snapshot.normalizedContent,
        contentHash: createHash("sha256").update(snapshot.normalizedContent).digest("hex"),
        snapshotHash: snapshotHash(snapshot),
      },
    };
  };

  return {
    async search(input) {
      try {
        return await legalReferenceProvider.search(input);
      } catch (error) {
        throw officialSourceFailure(error);
      }
    },
    create(input) {
      return unitOfWork.execute(() => resourceRepository.createLegalReferenceDraft(input));
    },
    async resolve(id, input) {
      const resource = await resourceRepository.findMetadata(id);
      if (resource?.kind !== "legalReference") throw new DomainError("resource_not_found", 404);
      if (resource.resolutionStatus !== "draft") throw new DomainError("conflict", 409);
      let fetched: Awaited<ReturnType<typeof providerSnapshot>>;
      try {
        fetched = await providerSnapshot(input);
      } catch (error) {
        throw officialSourceFailure(error);
      }
      const resolved = await unitOfWork.execute(() =>
        resourceRepository.resolveLegalReference(resource.id, {
          title: input.title,
          folderPath: resource.folderPath,
          tags: resource.tags,
          provider: "legifrance",
          referenceKind: "article",
          fund: input.fund,
          ...fetched,
        }),
      );
      if (!resolved) throw new DomainError("conflict", 409);
      return resolved;
    },
    async refresh(id, expectedSnapshotHash) {
      const resource = await resourceRepository.findMetadata(id);
      if (resource?.kind !== "legalReference") throw new DomainError("resource_not_found", 404);
      if (resource.resolutionStatus !== "resolved") throw new DomainError("conflict", 409);
      if (resource.snapshotHash !== expectedSnapshotHash) throw new DomainError("conflict", 409);
      let fetched: Awaited<ReturnType<typeof providerSnapshot>>;
      try {
        fetched = await providerSnapshot({
          fund: resource.fund,
          commonId: resource.commonId,
          effectiveAt: resource.effectiveAt,
        });
      } catch (error) {
        await resourceRepository.markLegalReferenceVerificationFailed(
          resource.id,
          expectedSnapshotHash,
          new Date().toISOString(),
        );
        throw officialSourceFailure(error);
      }
      const result = await unitOfWork.execute(() =>
        resourceRepository.refreshLegalReference(resource.id, expectedSnapshotHash, fetched),
      );
      if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
      if (result.status === "versionConflict") throw new DomainError("conflict", 409);
      return result.resource;
    },
  };
}
