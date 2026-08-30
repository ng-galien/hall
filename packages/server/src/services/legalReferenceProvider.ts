import type { LegalReferenceFund, LegalReferenceSearchResult } from "@hall/domain";

export interface LegalReferenceProviderSnapshot {
  commonId: string;
  versionId: string;
  effectiveAt: string | null;
  fetchedAt: string;
  validFrom: string | null;
  validTo: string | null;
  legalStatus: string;
  sourceUrl: string;
  providerUpdatedAt: string | null;
  citationLabel: string;
  attribution: string;
  normalizedContent: string;
  rawProviderPayload: unknown;
}

export interface LegalReferenceProvider {
  search(input: { query: string; effectiveAt: string | null }): Promise<LegalReferenceSearchResult[]>;
  fetchArticle(input: {
    fund: LegalReferenceFund;
    versionId: string;
    effectiveAt: string | null;
  }): Promise<LegalReferenceProviderSnapshot>;
  refreshArticle(input: {
    fund: LegalReferenceFund;
    commonId: string;
    effectiveAt: string | null;
  }): Promise<LegalReferenceProviderSnapshot>;
}

export class OfficialSourceError extends Error {
  constructor(readonly reason: "accessDenied" | "unavailable" | "timeout" | "responseTooLarge" | "invalidResponse") {
    super(reason);
    this.name = "OfficialSourceError";
  }
}
