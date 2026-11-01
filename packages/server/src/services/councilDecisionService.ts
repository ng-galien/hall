import type {
  CouncilDecisionDetail,
  CouncilDecisionSummary,
  FreezeCouncilDecision,
  UpdateCouncilDecisionDraft,
} from "@hall/api-contract";
import type { CouncilDecisionClient } from "../clients/councilDecisionClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";

export interface CouncilDecisionService {
  list(): Promise<CouncilDecisionSummary[]>;
  open(id: string): Promise<CouncilDecisionDetail>;
  updateDraft(id: string, input: UpdateCouncilDecisionDraft): Promise<CouncilDecisionDetail>;
  freeze(id: string, input: FreezeCouncilDecision): Promise<CouncilDecisionDetail>;
  preview(id: string): Promise<Buffer>;
  content(id: string): Promise<Buffer | null>;
}
/** Freezing renders again when SQL detects a competing number allocation, keeping the PDF and allocated number consistent. */
export function createCouncilDecisionService({
  councilDecisionClient,
  contentTemplateService,
}: {
  councilDecisionClient: CouncilDecisionClient;
  contentTemplateService: ContentTemplateService;
}): CouncilDecisionService {
  async function open(id: string): Promise<CouncilDecisionDetail> {
    const decision = await councilDecisionClient.open(id);
    if (!decision) throw new DomainError("council_decision_not_found", 404);
    return decision;
  }
  async function render(decision: CouncilDecisionDetail): Promise<Buffer> {
    const templates = (await contentTemplateService.list()).filter(
      (t) => t.kind === "pdf" && t.documentType === "council-decision",
    );
    if (templates.length !== 1) throw new DomainError("template_invalid", 422);
    const template = templates[0]!;
    return (
      await contentTemplateService.generateFromTemplate(template, {
        councilDecision: decision,
        context: {},
        attachmentResourceIds: [],
        to: [],
        cc: [],
        bcc: [],
      })
    ).content;
  }
  return {
    list: () => councilDecisionClient.list(),
    open,
    async updateDraft(id, input) {
      await open(id);
      return councilDecisionClient.updateDraft(id, input);
    },
    async freeze(id, input) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const decision = await open(id);
        if (decision.version !== input.expectedVersion) throw new DomainError("council_decision_conflict", 409);
        if (decision.state === "frozen") return decision;
        if (!decision.number || !decision.documentDate) throw new DomainError("council_decision_conflict", 409);
        const pdf = await render(decision);
        try {
          return await councilDecisionClient.freeze(
            id,
            input.expectedVersion,
            decision.number,
            decision.documentDate,
            pdf,
          );
        } catch (error) {
          if (!(error instanceof DomainError) || error.code !== "council_decision_number_changed") throw error;
        }
      }
      throw new DomainError("council_decision_conflict", 409);
    },
    async preview(id) {
      const decision = await open(id);
      if (decision.state === "frozen") {
        const content = await councilDecisionClient.content(id);
        if (!content) throw new DomainError("council_decision_document_unavailable", 409);
        return content;
      }
      return render(decision);
    },
    async content(id) {
      await open(id);
      return councilDecisionClient.content(id);
    },
  };
}
