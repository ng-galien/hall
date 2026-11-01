import type { CouncilDecisionDetail } from "@hall/contracts";
import type { TemplateRenderContext } from "@hall/domain";
import type { CouncilClient } from "../clients/councilClient.js";
import type { CouncilDecisionClient } from "../clients/councilDecisionClient.js";
import type { MinutesClient } from "../clients/minutesClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { HallSettingsRepository } from "../repositories/contracts.js";
import { eventInvitationSource } from "./eventInvitationService.js";
import { coverMarkdown, type DossierPiece, pointMarkdown } from "./meetingDossierService.js";

export interface TemplatePreviewContext {
  context: TemplateRenderContext;
  sourceLabel: string | null;
  sourceKind?: "meeting";
  councilDecision?: CouncilDecisionDetail;
  generated?: { bodyMarkdown: string; subject: string | null };
}
export interface TemplatePreviewContextService {
  resolve(documentType: string, context: TemplateRenderContext): Promise<TemplatePreviewContext>;
}

// @implements-requirement HALL-FR-CFG-020
export function createTemplatePreviewContextService({
  councilClient,
  councilDecisionClient,
  minutesClient,
  resourcesClient,
  hallSettingsRepository,
}: {
  councilClient: CouncilClient;
  councilDecisionClient: CouncilDecisionClient;
  minutesClient: MinutesClient;
  resourcesClient: ResourcesClient;
  hallSettingsRepository: HallSettingsRepository;
}): TemplatePreviewContextService {
  return {
    async resolve(documentType, context) {
      const empty: TemplatePreviewContext = { context, sourceLabel: null };
      if (documentType === "minutes" || documentType === "deliberation-list") {
        const records = await minutesClient.list();
        const selected = records.find((record) =>
          context.minutesId
            ? record.id === context.minutesId
            : context.meetingId
              ? record.councilMeetingId === context.meetingId
              : true,
        );
        return selected
          ? {
              context: { meetingId: selected.councilMeetingId, minutesId: selected.id },
              sourceKind: "meeting",
              sourceLabel: String(selected.meetingNumber),
            }
          : empty;
      }
      if (documentType === "council-decision") {
        const records = await councilDecisionClient.list();
        const selected = records.find((record) => !context.meetingId || record.councilMeetingId === context.meetingId);
        const decision = selected ? await councilDecisionClient.open(selected.id) : null;
        return decision
          ? {
              context: { meetingId: decision.councilMeetingId },
              sourceLabel: decision.title,
              councilDecision: decision,
            }
          : empty;
      }
      if (documentType === "document-print" || documentType === "event-invitation") {
        const kind = documentType === "document-print" ? "text" : "event";
        const records = (await resourcesClient.listAll()).data.filter((record) => record.kind === kind);
        for (const record of records) {
          const resource = (await resourcesClient.open(record.id))?.data;
          if (resource?.kind === "text" && resource.content.trim())
            return {
              context,
              sourceLabel: resource.name,
              generated: { bodyMarkdown: resource.content, subject: null },
            };
          if (resource?.kind === "event") {
            return {
              context,
              sourceLabel: resource.name,
              generated: eventInvitationSource(resource.name, resource.document.content, "request"),
            };
          }
        }
        return empty;
      }
      if (
        !["meeting-notice", "meeting-notice-message", "meeting-dossier-cover", "meeting-dossier-point"].includes(
          documentType,
        )
      )
        return empty;
      const meetings = await councilClient.listMeetings();
      for (const meeting of meetings) {
        if (context.meetingId && meeting.id !== context.meetingId) continue;
        const facts = await councilClient.noticeFacts(meeting.id);
        if (!facts?.agenda.length) continue;
        const selected: TemplatePreviewContext = {
          context: { meetingId: meeting.id },
          sourceKind: "meeting",
          sourceLabel: String(meeting.number),
        };
        if (documentType === "meeting-dossier-cover") {
          const hall = await hallSettingsRepository.get();
          selected.generated = { bodyMarkdown: coverMarkdown(facts, hall.name, hall.timeZone), subject: null };
        }
        if (documentType === "meeting-dossier-point") {
          const agenda = await councilClient.listAgenda(meeting.id);
          const item = agenda.find(
            (entry) => entry.councilBusinessId && facts.agenda.some((frozen) => frozen.id === entry.id),
          );
          const frozen = facts.agenda.find((entry) => entry.id === item?.id) ?? facts.agenda[0]!;
          const business = item?.councilBusinessId ? await councilClient.openBusiness(item.councilBusinessId) : null;
          const report = business ? (await resourcesClient.open(business.reportResourceId))?.data : null;
          const pieces: DossierPiece[] = [];
          if (business)
            for (const association of await councilClient.listBusinessResources(business.id)) {
              const resource = (await resourcesClient.open(association.resourceId))?.data;
              if (resource) pieces.push({ name: resource.name, pdf: null });
            }
          selected.generated = {
            bodyMarkdown: pointMarkdown(frozen, item, report?.kind === "text" ? report.content : null, pieces),
            subject: null,
          };
          selected.sourceLabel = `${selected.sourceLabel} · ${frozen.title}`;
        }
        return selected;
      }
      return empty;
    },
  };
}
