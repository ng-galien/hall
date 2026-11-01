import type { AgendaItem } from "@hall/api-contract";
import type { MeetingNoticeMeetingFacts } from "@hall/contracts";
import { matchLiteral } from "@hall/domain";
import { PDFDocument } from "pdf-lib";
import type { CouncilClient } from "../clients/councilClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import { DomainError } from "./errors.js";
import type { HallSettingsService } from "./hallSettingsService.js";

/** One generated meeting dossier: produced on demand from the frozen agenda, never stored. */
export interface MeetingDossier {
  fileName: string;
  content: Buffer;
}

export interface MeetingDossierService {
  dossier(meetingId: string): Promise<MeetingDossier>;
}

export interface DossierPiece {
  name: string;
  pdf: Buffer | null;
}

const markdownText = (value: string) => value.replaceAll(/([\\`*_[\]#{}<>|:])/g, "\\$1");
const literalColons = (value: string) => value.replaceAll(/:(?=[A-Za-z0-9])/g, "\\:");

function withLiteralColons(item: AgendaItem | undefined): AgendaItem | undefined {
  if (!item || !("content" in item.subject)) return item;
  return { ...item, subject: { ...item.subject, content: literalColons(item.subject.content) } };
}

function itemTitle(item: MeetingNoticeMeetingFacts["agenda"][number]): string {
  return matchLiteral(item.kind, {
    minutesApproval: () => "Arrêt du procès-verbal de la séance précédente",
    councilDecisionProposal: () => item.title,
    openQuestion: () => item.title,
  });
}

export function coverMarkdown(facts: MeetingNoticeMeetingFacts, communeName: string, timeZone: string): string {
  const scheduledAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone }).format(
    new Date(facts.scheduledAt),
  );
  const agenda = [...facts.agenda]
    .sort((left, right) => left.position - right.position)
    .map((item) => `${item.agendaNumber}. ${markdownText(itemTitle(item))}`)
    .join("\n");
  return `# Dossier de séance\n\n${markdownText(communeName)}\n\nConseil municipal n° ${facts.number}, ${markdownText(scheduledAt)}, ${markdownText(facts.location)}.\n\n## Ordre du jour\n\n${agenda}\n`;
}

function subjectHeading(item: AgendaItem): string | null {
  return matchLiteral(item.subject.kind, {
    minutesApproval: () => null,
    councilDecisionProposal: () => "Projet de délibération",
    openQuestion: () => "Question",
  });
}

export function pointMarkdown(
  frozen: MeetingNoticeMeetingFacts["agenda"][number],
  item: AgendaItem | undefined,
  report: string | null,
  pieces: readonly DossierPiece[],
): string {
  const sections = [`## Point ${frozen.agendaNumber} : ${markdownText(itemTitle(frozen))}`];
  if (report?.trim()) sections.push(`### Rapport\n\n${report}`);
  const heading = item ? subjectHeading(item) : null;
  if (heading && item && "content" in item.subject && item.subject.content.trim()) {
    sections.push(`### ${heading}\n\n${item.subject.content}`);
  }
  if (pieces.length) {
    const lines = pieces.map(
      (piece) => `- ${markdownText(piece.name)}${piece.pdf ? " (jointe à la suite)" : " (consultable dans Hall)"}`,
    );
    sections.push(`### Pièces\n\n${lines.join("\n")}`);
  }
  return `${sections.join("\n\n")}\n`;
}

async function concatenate(parts: readonly Buffer[]): Promise<Buffer> {
  const output = await PDFDocument.create();
  for (const part of parts) {
    const source = await PDFDocument.load(part);
    for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page);
  }
  return Buffer.from(await output.save());
}

async function readablePdf(content: Buffer): Promise<Buffer | null> {
  try {
    await PDFDocument.load(content);
    return content;
  } catch {
    return null;
  }
}

// @implements-requirement HALL-FR-NOT-120
export function createMeetingDossierService({
  councilClient,
  resourcesClient,
  contentTemplateService,
  hallSettingsService,
}: {
  councilClient: CouncilClient;
  resourcesClient: ResourcesClient;
  contentTemplateService: ContentTemplateService;
  hallSettingsService: HallSettingsService;
}): MeetingDossierService {
  async function piecesOf(businessId: string): Promise<DossierPiece[]> {
    const associations = [...(await councilClient.listBusinessResources(businessId))].sort(
      (left, right) => left.position - right.position,
    );
    const pieces: DossierPiece[] = [];
    for (const association of associations) {
      const resource = await resourcesClient.open(association.resourceId);
      if (!resource) continue;
      const isPdf = resource.data.kind === "document" && resource.data.binary.mediaType === "application/pdf";
      const content = isPdf ? await resourcesClient.readDocumentContent(association.resourceId) : null;
      pieces.push({ name: resource.data.name, pdf: content ? await readablePdf(content.content) : null });
    }
    return pieces;
  }

  async function reportOf(businessId: string): Promise<string | null> {
    const business = await councilClient.openBusiness(businessId);
    if (!business) return null;
    const report = await resourcesClient.open(business.reportResourceId);
    return report?.data.kind === "text" ? report.data.content : null;
  }

  async function pointPdf(markdown: string, literal: () => string): Promise<Buffer> {
    try {
      return await contentTemplateService.generatedPdf("meeting-dossier-point", markdown, {}, false);
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "template_invalid") throw error;
      return contentTemplateService.generatedPdf("meeting-dossier-point", literal(), {}, false);
    }
  }

  return {
    async dossier(meetingId) {
      const facts = await councilClient.noticeFacts(meetingId);
      if (!facts) throw new DomainError("meeting_dossier_unavailable", 409);
      const settings = await hallSettingsService.get();
      const agenda = new Map((await councilClient.listAgenda(meetingId)).map((item) => [item.id, item]));
      const context = { meetingId };
      const parts = [
        await contentTemplateService.generatedPdf(
          "meeting-dossier-cover",
          coverMarkdown(facts, settings.name, settings.timeZone),
          context,
          false,
        ),
      ];
      for (const frozen of [...facts.agenda].sort((left, right) => left.position - right.position)) {
        const item = agenda.get(frozen.id);
        const businessId = item?.councilBusinessId ?? null;
        const pieces = businessId ? await piecesOf(businessId) : [];
        const report = businessId ? await reportOf(businessId) : null;
        parts.push(
          await pointPdf(pointMarkdown(frozen, item, report, pieces), () =>
            pointMarkdown(frozen, withLiteralColons(item), report === null ? null : literalColons(report), pieces),
          ),
        );
        for (const piece of pieces) if (piece.pdf) parts.push(piece.pdf);
      }
      return { fileName: `dossier-seance-${facts.number}.pdf`, content: await concatenate(parts) };
    },
  };
}
