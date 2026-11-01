import type { ContentTemplate } from "@hall/domain";
import type { CouncilClient } from "../clients/councilClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";

export interface DeliberationListService {
  content(meetingReference: string): Promise<Buffer>;
}

/** Generates on demand, from the facts captured at closure, the list of deliberations examined in a closed meeting. */
export function createDeliberationListService({
  councilClient,
  contentTemplateService,
}: {
  councilClient: CouncilClient;
  contentTemplateService: ContentTemplateService;
}): DeliberationListService {
  async function template(): Promise<ContentTemplate> {
    const templates = (await contentTemplateService.list()).filter(
      (item) => item.kind === "pdf" && item.documentType === "deliberation-list",
    );
    if (templates.length === 0) throw new DomainError("template_not_found", 404);
    if (templates.length !== 1) throw new DomainError("template_invalid", 422);
    const selected = templates[0]!;
    return selected;
  }
  return {
    async content(meetingReference) {
      const meeting = await councilClient.openMeeting(meetingReference);
      if (!meeting) throw new DomainError("meeting_not_found", 404);
      if (!meeting.closedAt || !meeting.minutesId) throw new DomainError("deliberation_list_unavailable", 409);
      const generated = await contentTemplateService.generateFromTemplate(await template(), {
        context: { minutesId: meeting.minutesId },
        attachmentResourceIds: [],
        to: [],
        cc: [],
        bcc: [],
      });
      return generated.content;
    },
  };
}
