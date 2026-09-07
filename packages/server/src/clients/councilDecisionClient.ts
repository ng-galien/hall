import type { CouncilDecisionDetail, CouncilDecisionSummary, UpdateCouncilDecisionDraft } from "@hall/api-contract";

/** Dedicated council decision storage; generated documents never enter the workspace resource collection. */
export interface CouncilDecisionClient {
  list(): Promise<CouncilDecisionSummary[]>;
  open(id: string): Promise<CouncilDecisionDetail | null>;
  updateDraft(id: string, input: UpdateCouncilDecisionDraft): Promise<CouncilDecisionDetail>;
  freeze(id: string, expectedVersion: number, content: Buffer): Promise<CouncilDecisionDetail>;
  content(id: string): Promise<Buffer | null>;
}
