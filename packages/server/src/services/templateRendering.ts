import type { MinutesDetail, ResourceDetail } from "@hall/api-contract";
import type { CouncilDecisionDetail, MeetingNoticeFacts } from "@hall/contracts";
import {
  type ContentTemplate,
  type HallSettings,
  type JsonObject,
  type JsonValue,
  matchDiscriminated,
  matchLiteral,
  type SpreadsheetDocument,
  type TemplateRenderContext,
} from "@hall/domain";
import {
  baseRenderStylesheet,
  collectDirectives,
  type Diagnostic,
  isCouncilDecisionSection,
  isFieldName,
  isMinutesSection,
  isReferenceKind,
  isResourcePresentationKind,
  parse,
  renderHtml,
  validateStructure,
} from "@hall/templating";
import sanitizeHtml from "sanitize-html";
import type { CouncilClient } from "../clients/councilClient.js";
import type { MinutesClient } from "../clients/minutesClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { HallSettingsRepository } from "../repositories/contracts.js";
import {
  renderCouncilDecisionContent,
  renderCouncilDecisionFacts,
  renderCouncilDecisionResult,
} from "./councilDecisionDocument.js";
import { renderDeliberationList } from "./deliberationListDocument.js";
import { pdfAttachmentHref } from "./documentRenderer.js";
import type { GeographicMapRenderer } from "./geographicMapRenderer.js";
import { renderMeetingNotice } from "./meetingNoticeDocument.js";
import { renderMinutesSections } from "./minutesDocument.js";
import type { ReferenceEntityResolver } from "./referenceEntityResolver.js";

type AstNode = {
  type: string;
  name?: string;
  value?: string;
  url?: string;
  alt?: string;
  data?: {
    hProperties?: Record<string, unknown>;
  };
  children?: AstNode[];
};

type TemplateDirective = ReturnType<typeof collectDirectives>[number];

export interface TemplatePdfAttachment {
  id: string;
  content: Buffer;
}

async function resourceReferenceNode(
  resource: ResourceDetail,
  label: string,
  resourcesClient: ResourcesClient,
  /** Null when the PDF does not carry its referenced documents: the reference is then plain text. */
  registerPdfAttachment: ((resource: TemplatePdfAttachment) => void) | null,
): Promise<AstNode> {
  return matchDiscriminated(resource, "kind", {
    folder: () => textNode(label),
    document: async (entry) => {
      if (entry.binary.mediaType === "application/pdf") {
        if (!registerPdfAttachment) return textNode(label);
        const content = await resourcesClient.readDocumentContent(entry.id);
        if (content) registerPdfAttachment({ id: entry.id, content: content.content });
        return { type: "link", url: pdfAttachmentHref(entry.id), children: [textNode(label)] };
      }
      return textNode(label);
    },
    remote: (entry) => (entry.target.kind === "url" ? externalLink(entry.target.url, label) : textNode(label)),
    text: () => textNode(label),
    spreadsheet: () => textNode(label),
    geographic: () => textNode(label),
    event: () => textNode(label),
    legalReference: () => textNode(label),
    geographicLayer: () => textNode(label),
  });
}

export interface TemplatePreview {
  html: string;
  /** HTML without preview-only header/footer; used as Chromium's printable page body. */
  printHtml: string;
  text: string;
  subject: string | null;
  diagnostics: Diagnostic[];
  headerHtml: string;
  footerHtml: string;
  /** Referenced PDFs, deduplicated in first-appearance order. */
  pdfAttachments: TemplatePdfAttachment[];
}

interface ResolvedContext {
  /** Whether the PDF carries the PDF documents its text references, appended after it and linked. */
  attachPdfDocuments: boolean;
  notice: MeetingNoticeFacts | null;
  councilDecision: CouncilDecisionDetail | null;
  minutes: MinutesDetail | null;
  hall: HallSettings;
  meeting: Awaited<ReturnType<CouncilClient["openMeeting"]>>;
}

function diagnostic(
  code: Diagnostic["code"],
  message: string,
  directive: ReturnType<typeof collectDirectives>[number],
): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    anchor: {
      directive: directive.name,
      occurrence: directive.occurrence,
      id: directive.attributes.id,
      position: directive.position,
    },
  };
}

function textNode(value: string): AstNode {
  return { type: "text", value };
}

function paragraph(children: AstNode[]): AstNode {
  return { type: "paragraph", children };
}

function externalLink(url: string, label: string): AstNode {
  return {
    type: "link",
    url,
    children: [textNode(label)],
    data: { hProperties: { target: "_blank", rel: "noopener noreferrer" } },
  };
}

function fallbackPresentation(directive: TemplateDirective): AstNode {
  return paragraph([textNode(directive.label)]);
}

function resourceDiagnostic(
  code: "unresolved_reference" | "incompatible_resource" | "resource_representation_unavailable",
  message: string,
  directive: TemplateDirective,
): Diagnostic {
  return diagnostic(code, message, directive);
}

function documentLabel(format: string): string {
  if (format === "pdf") return "Document PDF";
  return `Document ${format.toUpperCase()}`;
}

function parseA1Range(
  value: string,
): { startRow: number; startColumn: number; endRow: number; endColumn: number } | null {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*):\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(value);
  if (!match) return null;
  const column = (label: string) => {
    let result = 0;
    for (const character of label.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64;
    return result - 1;
  };
  const range = {
    startRow: Number(match[2]) - 1,
    startColumn: column(match[1]),
    endRow: Number(match[4]) - 1,
    endColumn: column(match[3]),
  };
  return range.startRow <= range.endRow && range.startColumn <= range.endColumn ? range : null;
}

function objectValue(value: JsonValue | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function spreadsheetCellValue(cell: JsonObject): JsonValue | undefined {
  return cell.v;
}

function decimalPlaces(pattern: string): number {
  const match = /\.(0+)/.exec(pattern);
  return match?.[1].length ?? 0;
}

function formattedSpreadsheetValue(cell: JsonObject): string | null {
  const value = spreadsheetCellValue(cell);
  if (value === undefined || value === null) return cell.f ? null : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (typeof value !== "number") return JSON.stringify(value);
  const style = objectValue(cell.s);
  const numberFormat = objectValue(style?.n);
  const pattern = stringValue(numberFormat?.pattern) ?? "";
  const digits = decimalPlaces(pattern);
  if (pattern.includes("%")) {
    return new Intl.NumberFormat("fr-FR", {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
  if (pattern.includes("€")) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
  if (/[dmy]/i.test(pattern)) {
    const date = new Date((value - 25_569) * 86_400_000);
    if (Number.isFinite(date.getTime())) return new Intl.DateTimeFormat("fr-FR").format(date);
  }
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 20 }).format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function spreadsheetCellStyle(cell: JsonObject): string {
  const style = objectValue(cell.s);
  if (!style) return "";
  const declarations: string[] = [];
  if (style.bl === 1) declarations.push("font-weight: bold");
  if (style.it === 1) declarations.push("font-style: italic");
  const foreground = stringValue(objectValue(style.cl)?.rgb);
  const background = stringValue(objectValue(style.bg)?.rgb);
  if (foreground && /^#[0-9a-f]{6}$/i.test(foreground)) declarations.push(`color: ${foreground}`);
  if (background && /^#[0-9a-f]{6}$/i.test(background)) declarations.push(`background-color: ${background}`);
  if (style.ht === 2) declarations.push("text-align: center");
  if (style.ht === 3) declarations.push("text-align: right");
  return declarations.length ? ` style="${declarations.join("; ")}"` : "";
}

function spreadsheetTable(
  document: SpreadsheetDocument,
  sheetId: string,
  rangeLabel: string,
): { node: AstNode | null; error: string | null } {
  const workbook = document.workbook;
  const sheets = objectValue(workbook.sheets);
  const sheet = sheets ? objectValue(sheets[sheetId]) : null;
  const range = parseA1Range(rangeLabel);
  if (!sheet) return { node: null, error: `Spreadsheet sheet not found: ${sheetId}` };
  if (!range) return { node: null, error: `Invalid spreadsheet range: ${rangeLabel}` };
  const rowCount = numberValue(sheet.rowCount) ?? 0;
  const columnCount = numberValue(sheet.columnCount) ?? 0;
  if (range.endRow >= rowCount || range.endColumn >= columnCount) {
    return { node: null, error: `Spreadsheet range ${rangeLabel} exceeds sheet bounds` };
  }
  const selectedRows = range.endRow - range.startRow + 1;
  const selectedColumns = range.endColumn - range.startColumn + 1;
  if (selectedColumns > 50 || selectedRows * selectedColumns > 10_000) {
    return { node: null, error: `Spreadsheet range ${rangeLabel} is too large for a readable PDF` };
  }
  const cellData = objectValue(sheet.cellData) ?? {};
  const renderedRows: string[] = [];
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const row = objectValue(cellData[String(rowIndex)]) ?? {};
    const cells: string[] = [];
    for (let columnIndex = range.startColumn; columnIndex <= range.endColumn; columnIndex += 1) {
      const cell = objectValue(row[String(columnIndex)]) ?? {};
      const value = formattedSpreadsheetValue(cell);
      if (value === null) {
        return {
          node: null,
          error: `Spreadsheet range ${rangeLabel} contains a formula without a persisted calculated value`,
        };
      }
      const tag = rowIndex === range.startRow ? "th" : "td";
      cells.push(`<${tag}${spreadsheetCellStyle(cell)}>${escapeHtml(value)}</${tag}>`);
    }
    renderedRows.push(`<tr>${cells.join("")}</tr>`);
  }
  const name = stringValue(sheet.name) ?? sheetId;
  const first = renderedRows.shift() ?? "";
  const html = [
    `<p><strong>${escapeHtml(name)}</strong> - ${escapeHtml(rangeLabel.toUpperCase())}</p>`,
    `<table><thead>${first}</thead><tbody>${renderedRows.join("")}</tbody></table>`,
  ].join("");
  return { node: { type: "html", value: html }, error: null };
}

async function renderResourceEmbed(
  directive: TemplateDirective,
  resourcesClient: ResourcesClient,
  geographicMapRenderer: GeographicMapRenderer,
  registerPdfAttachment: ((resource: TemplatePdfAttachment) => void) | null,
  renderText: (
    source: string,
  ) => Promise<{ bodyHtml: string; diagnostics: Diagnostic[]; pdfAttachments: TemplatePdfAttachment[] }>,
): Promise<{ node: AstNode; diagnostics: Diagnostic[] }> {
  const id = directive.attributes.id;
  if (!id) return { node: fallbackPresentation(directive), diagnostics: [] };
  const resource = (await resourcesClient.open(id))?.data ?? null;
  if (!resource) {
    return {
      node: fallbackPresentation(directive),
      diagnostics: [resourceDiagnostic("unresolved_reference", `Resource presentation not found: ${id}`, directive)],
    };
  }
  const rawPresentation = directive.attributes.presentation;
  if (!rawPresentation || !isResourcePresentationKind(rawPresentation)) {
    return {
      node: fallbackPresentation(directive),
      diagnostics: [
        resourceDiagnostic(
          "resource_representation_unavailable",
          `Resource ${id} has no renderable presentation named "${rawPresentation ?? ""}"`,
          directive,
        ),
      ],
    };
  }
  const presentation = rawPresentation;
  const incompatible = (expected: string) => ({
    node: fallbackPresentation(directive),
    diagnostics: [
      resourceDiagnostic(
        "incompatible_resource",
        `The "${presentation}" presentation requires ${expected}; resource ${id} is ${resource.kind}`,
        directive,
      ),
    ],
  });

  const supportsPresentation = matchDiscriminated(resource, "kind", {
    folder: () => false,
    text: () => presentation === "text",
    remote: () => presentation === "link",
    spreadsheet: () => presentation === "table",
    geographic: () => presentation === "map",
    event: () => presentation === "event",
    legalReference: () => presentation === "legal-citation",
    geographicLayer: () => false,
    document: (entry) =>
      presentation === "document" ||
      (presentation === "image" && ["image/jpeg", "image/png"].includes(entry.binary.mediaType)),
  });
  if (!supportsPresentation) {
    const expected = matchLiteral(presentation, {
      text: () => "a TextResource",
      event: () => "an EventResource",
      image: () => "a JPEG or PNG DocumentResource",
      document: () => "a DocumentResource",
      link: () => "a RemoteResource",
      "legal-citation": () => "a LegalReferenceResource",
      map: () => "a GeographicResource",
      table: () => "a SpreadsheetResource",
    });
    return incompatible(expected);
  }

  return matchLiteral(presentation, {
    text: async () => {
      if (resource.kind !== "text") return incompatible("a TextResource");
      const rendered = await renderText(resource.content);
      if (registerPdfAttachment) rendered.pdfAttachments.forEach(registerPdfAttachment);
      return { node: { type: "html", value: rendered.bodyHtml }, diagnostics: rendered.diagnostics };
    },
    event: async () => {
      if (resource.kind !== "event") return incompatible("an EventResource");
      const rendered = await renderText(resource.document.content);
      if (registerPdfAttachment) rendered.pdfAttachments.forEach(registerPdfAttachment);
      return {
        node: {
          type: "root",
          children: [
            paragraph([{ type: "strong", children: [textNode(resource.name)] }]),
            paragraph([textNode(`${resource.document.schedule.start} - ${resource.document.schedule.end}`)]),
            paragraph([textNode(resource.document.location)]),
            { type: "html", value: rendered.bodyHtml },
          ],
        },
        diagnostics: rendered.diagnostics,
      };
    },
    image: async () => {
      if (resource.kind !== "document" || !["image/jpeg", "image/png"].includes(resource.binary.mediaType)) {
        return incompatible("a JPEG or PNG DocumentResource");
      }
      const content = await resourcesClient.readDocumentContent(resource.id);
      if (!content) {
        return {
          node: fallbackPresentation(directive),
          diagnostics: [
            resourceDiagnostic(
              "resource_representation_unavailable",
              `Document resource ${id} has no persisted binary content`,
              directive,
            ),
          ],
        };
      }
      const align = directive.attributes.align === "left" ? "left" : "center";
      const requestedWidth = Number(directive.attributes.width);
      const width =
        Number.isInteger(requestedWidth) && requestedWidth >= 25 && requestedWidth <= 100 ? requestedWidth : 100;
      return {
        node: {
          type: "image",
          url: `data:${content.mediaType};base64,${content.content.toString("base64")}`,
          alt: directive.label || resource.name,
          data: {
            hProperties: {
              className: ["hall-template-image", `hall-template-image-${align}`],
              style: `width:${width}%`,
            },
          },
        },
        diagnostics: [],
      };
    },

    document: async () => {
      if (resource.kind !== "document") return incompatible("a DocumentResource");
      if (resource.binary.mediaType === "application/pdf") {
        if (!registerPdfAttachment) return { node: paragraph([textNode(resource.name)]), diagnostics: [] };
        const content = await resourcesClient.readDocumentContent(resource.id);
        if (!content) {
          return {
            node: fallbackPresentation(directive),
            diagnostics: [
              resourceDiagnostic(
                "resource_representation_unavailable",
                `Document resource ${id} has no persisted binary content`,
                directive,
              ),
            ],
          };
        }
        registerPdfAttachment({ id: resource.id, content: content.content });
        return {
          node: paragraph([
            {
              type: "link",
              url: pdfAttachmentHref(resource.id),
              children: [textNode(resource.name)],
            },
          ]),
          diagnostics: [],
        };
      }
      return {
        node: paragraph([
          { type: "strong", children: [textNode(resource.name)] },
          textNode(` (${documentLabel(resource.binary.mediaType.split("/").at(-1) ?? "file")})`),
        ]),
        diagnostics: [],
      };
    },

    link: async () => {
      if (resource.kind !== "remote") return incompatible("a RemoteResource");
      if (resource.target.kind !== "url") {
        return {
          node: fallbackPresentation(directive),
          diagnostics: [
            resourceDiagnostic(
              "resource_representation_unavailable",
              `Remote resource ${id} has no persisted URL`,
              directive,
            ),
          ],
        };
      }
      return {
        node: paragraph([
          { type: "strong", children: [textNode(resource.name)] },
          textNode(": "),
          externalLink(resource.target.url, resource.target.url),
        ]),
        diagnostics: [],
      };
    },

    "legal-citation": async () => {
      if (resource.kind !== "legalReference") return incompatible("a LegalReferenceResource");
      const document = resource.document;
      if (document.resolutionStatus !== "resolved") {
        return {
          node: fallbackPresentation(directive),
          diagnostics: [
            resourceDiagnostic(
              "resource_representation_unavailable",
              `Legal reference ${id} has no authoritative snapshot`,
              directive,
            ),
          ],
        };
      }
      const snapshot = document.snapshots.find((candidate) => candidate.snapshotHash === document.snapshotHash) ?? null;
      if (!snapshot) {
        return {
          node: fallbackPresentation(directive),
          diagnostics: [
            resourceDiagnostic(
              "resource_representation_unavailable",
              `Legal reference ${id} snapshot ${document.snapshotHash} is unavailable`,
              directive,
            ),
          ],
        };
      }
      return {
        node: {
          type: "blockquote",
          children: [
            paragraph([
              {
                type: "strong",
                children: [externalLink(document.sourceUrl, document.citationLabel)],
              },
            ]),
            paragraph([textNode(snapshot.normalizedContent)]),
          ],
        },
        diagnostics: [],
      };
    },

    map: async () => {
      if (resource.kind !== "geographic") return incompatible("a GeographicResource");
      const image = await geographicMapRenderer.render(resource.document, resource.name);
      const align = directive.attributes.align === "left" ? "left" : "center";
      const requestedWidth = Number(directive.attributes.width);
      const width =
        Number.isInteger(requestedWidth) && requestedWidth >= 25 && requestedWidth <= 100 ? requestedWidth : 100;
      return {
        node: {
          type: "image",
          url: image,
          alt: directive.label || resource.name,
          data: {
            hProperties: {
              className: ["hall-template-map", `hall-template-image-${align}`],
              style: `width:${width}%`,
            },
          },
        },
        diagnostics: [],
      };
    },

    table: async () => {
      if (resource.kind !== "spreadsheet") return incompatible("a SpreadsheetResource");
      const rendered = spreadsheetTable(
        resource.document,
        directive.attributes.sheet ?? "",
        directive.attributes.range ?? "",
      );
      if (!rendered.node) {
        return {
          node: fallbackPresentation(directive),
          diagnostics: [
            resourceDiagnostic(
              "resource_representation_unavailable",
              rendered.error ?? `Spreadsheet resource ${id} cannot render the requested range`,
              directive,
            ),
          ],
        };
      }
      return { node: rendered.node, diagnostics: [] };
    },
  });
}

function formatMeetingDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function textFromTree(node: AstNode): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "image") return node.alt ?? "";
  const content = (node.children ?? []).map(textFromTree).join("");
  return ["paragraph", "heading", "listItem", "blockquote"].includes(node.type) ? `${content}\n` : content;
}

function replaceDirectives(node: AstNode, values: Map<string, AstNode>, counters = new Map<string, number>()): AstNode {
  if (["textDirective", "leafDirective", "containerDirective"].includes(node.type)) {
    const name = node.name ?? "";
    const occurrence = counters.get(name) ?? 0;
    counters.set(name, occurrence + 1);
    return values.get(`${name}:${occurrence}`) ?? { type: "text", value: "" };
  }
  if (!node.children) return { ...node };
  return { ...node, children: node.children.map((child) => replaceDirectives(child, values, counters)) };
}

function htmlShell(bodyHtml: string, stylesheet: string, headerHtml = "", footerHtml = ""): string {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><style>${baseRenderStylesheet}\n${stylesheet}</style></head>
<body>${headerHtml ? `<header class="hall-document-header">${headerHtml}</header>` : ""}
<main class="hall-document-body">${bodyHtml}</main>
${footerHtml ? `<footer class="hall-document-footer">${footerHtml}</footer>` : ""}</body>
</html>`;
}

function safeDecorationHtml(source: string): string {
  return sanitizeHtml(source, {
    allowedTags: ["div", "span", "p", "strong", "em", "br", "img", "table", "tbody", "tr", "td"],
    allowedAttributes: {
      "*": ["class", "style"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemesByTag: { img: ["data"] },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        "font-size": [/^\d+(?:\.\d+)?(?:px|pt|rem|em|%)$/],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/],
        "text-align": [/^(?:left|center|right)$/],
        width: [/^\d+(?:\.\d+)?(?:px|mm|cm|%|rem|em)$/],
      },
    },
    allowProtocolRelative: false,
  });
}

export interface TemplateRenderingService {
  preview(
    template: Pick<ContentTemplate, "bodyMarkdown" | "subject" | "stylesheet" | "headerHtml" | "footerHtml">,
    context?: TemplateRenderContext,
    notice?: MeetingNoticeFacts,
    councilDecision?: CouncilDecisionDetail,
    options?: { attachPdfDocuments?: boolean },
  ): Promise<TemplatePreview>;
}

export function createTemplateRenderingService({
  hallSettingsRepository,
  councilClient,
  resourcesClient,
  geographicMapRenderer,
  referenceEntityResolver,
  minutesClient,
}: {
  hallSettingsRepository: HallSettingsRepository;
  councilClient: CouncilClient;
  resourcesClient: ResourcesClient;
  geographicMapRenderer: GeographicMapRenderer;
  referenceEntityResolver: ReferenceEntityResolver;
  minutesClient: MinutesClient;
}): TemplateRenderingService {
  const loadContext = async (context: TemplateRenderContext = {}): Promise<ResolvedContext> => ({
    attachPdfDocuments: true,
    notice: null,
    councilDecision: null,
    minutes: context.minutesId ? await minutesClient.open(context.minutesId) : null,
    hall: await hallSettingsRepository.get(),
    meeting: context.meetingId ? await councilClient.openMeeting(context.meetingId) : null,
  });

  const renderSource = async (
    source: string,
    context: ResolvedContext,
    ancestors: readonly string[] = [],
  ): Promise<{
    bodyHtml: string;
    text: string;
    diagnostics: Diagnostic[];
    pdfAttachments: TemplatePdfAttachment[];
  }> => {
    const minutes = context.minutes ? renderMinutesSections(context.minutes) : null;
    const tree = parse(source);
    const diagnostics = validateStructure(tree);
    const values = new Map<string, AstNode>();
    const pdfAttachments = new Map<string, TemplatePdfAttachment>();
    const registerPdfAttachment = context.attachPdfDocuments
      ? (resource: TemplatePdfAttachment) => {
          if (!pdfAttachments.has(resource.id)) pdfAttachments.set(resource.id, resource);
        }
      : null;
    for (const directive of collectDirectives(tree)) {
      const key = `${directive.name}:${directive.occurrence}`;
      if (directive.name === "council-decision") {
        const section = directive.attributes.section;
        const decision = context.councilDecision;
        if (!decision || !section || !isCouncilDecisionSection(section)) {
          diagnostics.push(
            diagnostic("unresolved_reference", "Council decision context or section unavailable", directive),
          );
          continue;
        }
        const fragments = {
          facts: () => renderCouncilDecisionFacts(decision.facts, decision.documentDate),
          content: () => renderCouncilDecisionContent(decision),
          result: () => renderCouncilDecisionResult(decision.facts),
        };
        values.set(key, { type: "html", value: matchLiteral(section, fragments) });
        continue;
      }
      if (directive.name === "meeting-notice") {
        if (!context.notice)
          diagnostics.push(
            diagnostic("unresolved_reference", "A frozen meeting notice context is required", directive),
          );
        else values.set(key, { type: "html", value: renderMeetingNotice(context.notice) });
        continue;
      }
      if (directive.name === "deliberation-list") {
        if (!context.minutes)
          diagnostics.push(diagnostic("unresolved_reference", "A closed meeting context is required", directive));
        else
          values.set(key, {
            type: "html",
            value: renderDeliberationList(context.minutes.facts, {
              name: context.hall.name,
              timeZone: context.hall.timeZone,
            }),
          });
        continue;
      }
      if (directive.name === "minutes") {
        const section = directive.attributes.section;
        if (!minutes || !section || !isMinutesSection(section)) {
          diagnostics.push(diagnostic("unresolved_reference", "Minutes context or section unavailable", directive));
          continue;
        }
        values.set(key, { type: "html", value: minutes[section] });
        continue;
      }
      if (directive.name === "resource-embed") {
        const resourceId = directive.attributes.id;
        if (resourceId && ancestors.includes(resourceId)) {
          values.set(key, fallbackPresentation(directive));
          diagnostics.push(
            resourceDiagnostic("resource_representation_unavailable", "Cyclic resource insertion", directive),
          );
          continue;
        }
        const rendered = await renderResourceEmbed(
          directive,
          resourcesClient,
          geographicMapRenderer,
          registerPdfAttachment,
          (content) => renderSource(content, context, resourceId ? [...ancestors, resourceId] : ancestors),
        );
        values.set(key, rendered.node);
        diagnostics.push(...rendered.diagnostics);
        continue;
      }
      if (directive.name === "image") {
        const id = directive.attributes.id;
        const resource = id ? ((await resourcesClient.open(id))?.data ?? null) : null;
        if (resource?.kind !== "document" || !["image/jpeg", "image/png"].includes(resource.binary.mediaType)) {
          values.set(key, { type: "text", value: directive.label });
          if (id) {
            diagnostics.push(
              diagnostic(
                "unresolved_reference",
                resource ? `Resource ${id} is not a JPEG or PNG image` : `Image reference not found: ${id}`,
                directive,
              ),
            );
          }
          continue;
        }
        const content = await resourcesClient.readDocumentContent(resource.id);
        if (!content) {
          values.set(key, { type: "text", value: directive.label });
          diagnostics.push(diagnostic("unresolved_reference", `Image content not found: ${id}`, directive));
          continue;
        }
        const align = directive.attributes.align === "left" ? "left" : "center";
        const requestedWidth = Number(directive.attributes.width);
        const width =
          Number.isInteger(requestedWidth) && requestedWidth >= 25 && requestedWidth <= 100 ? requestedWidth : 100;
        values.set(key, {
          type: "image",
          url: `data:${content.mediaType};base64,${content.content.toString("base64")}`,
          alt: directive.label || resource.name,
          data: {
            hProperties: {
              className: ["hall-template-image", `hall-template-image-${align}`],
              style: `width:${width}%`,
            },
          },
        });
        continue;
      }
      if (isReferenceKind(directive.name)) {
        const id = directive.attributes.id;
        let node: AstNode | null = null;
        if (id) {
          if (directive.name === "resource") {
            const resource = (await resourcesClient.open(id))?.data ?? null;
            node = resource
              ? await resourceReferenceNode(resource, resource.name, resourcesClient, registerPdfAttachment)
              : null;
          } else {
            const reference = await referenceEntityResolver.resolve(directive.name, id);
            node = reference
              ? matchDiscriminated(reference, "type", {
                  member: (entry) => textNode(entry.label),
                  contact: (entry) => textNode(entry.label),
                  meeting: (entry) => textNode(entry.label),
                  councilBusiness: (entry) => textNode(entry.label),
                  decision: (entry) => textNode(entry.label),
                  resource: (entry) => textNode(entry.label),
                })
              : null;
          }
        }
        values.set(key, node ?? textNode(directive.label));
        if (id && node === null) {
          diagnostics.push(
            diagnostic("unresolved_reference", `${directive.name} reference not found: ${id}`, directive),
          );
        }
        continue;
      }
      if (directive.name === "field") {
        const name = directive.attributes.name;
        if (!name || !isFieldName(name)) continue;
        const fields: Record<typeof name, string | null> = {
          "hall.name": context.hall.name,
          "meeting.startsAt": context.meeting?.scheduledAt
            ? formatMeetingDate(context.meeting.scheduledAt, context.hall.timeZone)
            : null,
          "meeting.location": context.meeting?.location ?? null,
          "meeting.chair": context.meeting?.chairMemberId
            ? ((await referenceEntityResolver.resolve("member", context.meeting.chairMemberId))?.label ?? null)
            : null,
          "meeting.secretary": context.meeting?.secretaryMemberId
            ? ((await referenceEntityResolver.resolve("member", context.meeting.secretaryMemberId))?.label ?? null)
            : null,
        };
        const value = fields[name];
        values.set(key, { type: "text", value: value ?? "" });
        if (value === null) {
          diagnostics.push(
            diagnostic("unresolved_reference", `Required context is unavailable for field ${name}`, directive),
          );
        }
      }
    }
    const resolvedTree = replaceDirectives(tree as AstNode, values);
    return {
      bodyHtml: renderHtml(resolvedTree as never),
      text: textFromTree(resolvedTree).trim(),
      diagnostics,
      pdfAttachments: [...pdfAttachments.values()],
    };
  };

  return {
    async preview(template, renderContext = {}, notice, councilDecision, options = {}) {
      const context = await loadContext(renderContext);
      context.attachPdfDocuments = options.attachPdfDocuments ?? true;
      context.councilDecision = councilDecision ?? null;
      const meetingFacts =
        !notice && renderContext.meetingId ? await councilClient.noticeFacts(renderContext.meetingId) : null;
      context.notice =
        notice ??
        (meetingFacts
          ? {
              issuedOn: null,
              meeting: meetingFacts,
              hall: { name: context.hall.name, timeZone: context.hall.timeZone },
            }
          : null);
      if (context.notice) {
        context.hall = { ...context.hall, ...context.notice.hall };
        if (context.meeting)
          context.meeting = {
            ...context.meeting,
            scheduledAt: context.notice.meeting.scheduledAt,
            location: context.notice.meeting.location,
          };
      }
      const body = await renderSource(template.bodyMarkdown, context);
      const subject = template.subject ? await renderSource(template.subject, context) : null;
      const headerHtml = safeDecorationHtml(template.headerHtml);
      const footerHtml = safeDecorationHtml(template.footerHtml);
      return {
        html: htmlShell(body.bodyHtml, template.stylesheet, headerHtml, footerHtml),
        printHtml: htmlShell(body.bodyHtml, template.stylesheet),
        text: body.text,
        subject: subject?.text ?? null,
        diagnostics: [...body.diagnostics, ...(subject?.diagnostics ?? [])],
        headerHtml,
        footerHtml,
        pdfAttachments: body.pdfAttachments,
      };
    },
  };
}
