import type {
  CouncilDecisionDetail,
  CouncilDecisionSummary,
  FreezeCouncilDecision,
  UpdateCouncilDecisionDraft,
} from "@hall/api-contract";
import { collectDirectives, councilDecisionSections, parse } from "@hall/templating";
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
    const directives = collectDirectives(parse(template.bodyMarkdown)).filter((d) => d.name === "council-decision");
    if (
      directives.length !== councilDecisionSections.length ||
      councilDecisionSections.some((section) => directives.filter((d) => d.attributes.section === section).length !== 1)
    ) {
      throw new DomainError("template_invalid", 422);
    }
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
      const decision = await open(id);
      if (decision.state !== "draft" || decision.version !== input.expectedVersion)
        throw new DomainError("council_decision_conflict", 409);
      return councilDecisionClient.freeze(id, input.expectedVersion, await render(decision));
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
