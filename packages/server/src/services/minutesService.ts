import type { GenerateMinutes, MinutesDetail, MinutesSummary, UpdateMinutesDraft } from "@hall/api-contract";
import type { MinutesClient } from "../clients/minutesClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";

export interface MinutesService {
  list(): Promise<MinutesSummary[]>;
  open(id: string): Promise<MinutesDetail>;
  updateDraft(id: string, input: UpdateMinutesDraft): Promise<MinutesDetail>;
  generate(id: string, input: GenerateMinutes): Promise<MinutesDetail>;
  content(id: string): Promise<Buffer | null>;
  preview(id: string): Promise<Buffer>;
}

export function createMinutesService({
  minutesClient,
  contentTemplateService,
}: {
  minutesClient: MinutesClient;
  contentTemplateService: ContentTemplateService;
}): MinutesService {
  async function open(id: string): Promise<MinutesDetail> {
    const minutes = await minutesClient.open(id);
    if (!minutes) throw new DomainError("minutes_not_found", 404);
    return minutes;
  }
  async function render(id: string): Promise<Buffer> {
    const templates = (await contentTemplateService.list()).filter(
      (template) => template.kind === "pdf" && template.documentType === "minutes",
    );
    if (templates.length === 0) throw new DomainError("template_not_found", 404);
    if (templates.length !== 1) throw new DomainError("template_invalid", 422);
    const template = templates[0]!;
    const generated = await contentTemplateService.generateFromTemplate(template, {
      context: { minutesId: id },
      attachmentResourceIds: [],
      to: [],
      cc: [],
      bcc: [],
    });
    return generated.content;
  }
  return {
    list: () => minutesClient.list(),
    open,
    async updateDraft(id, input) {
      await open(id);
      return minutesClient.updateDraft(id, input);
    },
    async generate(id, input) {
      const minutes = await open(id);
      if (minutes.generatedAt || minutes.version !== input.expectedVersion) {
        throw new DomainError("minutes_conflict", 409);
      }
      return minutesClient.generate(id, input.expectedVersion, await render(id));
    },
    async preview(id) {
      const minutes = await open(id);
      if (minutes.generatedAt) {
        const content = await minutesClient.content(id);
        if (!content) throw new DomainError("minutes_not_generated", 409);
        return content;
      }
      return render(id);
    },
    async content(id) {
      await open(id);
      return minutesClient.content(id);
    },
  };
}
