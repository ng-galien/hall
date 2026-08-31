import type {
  ContentTemplate,
  HallSettings,
  JsonObject,
  JsonValue,
  SpreadsheetDocument,
  TemplateRenderContext,
} from "@hall/domain";
import {
  baseRenderStylesheet,
  collectDirectives,
  type Diagnostic,
  isFieldName,
  isReferenceKind,
  parse,
  renderHtml,
  validateStructure,
} from "@hall/templating";
import sanitizeHtml from "sanitize-html";
import type {
  CouncilBusinessRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  HallSettingsRepository,
  ResourceRepository,
  StoredDocumentResource,
} from "../repositories/contracts.js";
import type { GeographicMapRenderer } from "./geographicMapRenderer.js";
import { pdfAttachmentHref } from "./documentRenderer.js";

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
  pdfAttachments: StoredDocumentResource[];
}

interface ResolvedContext {
  hall: HallSettings;
  meeting: Awaited<ReturnType<CouncilMeetingRepository["find"]>>;
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

function fallbackPresentation(directive: TemplateDirective, detail?: string): AstNode {
  return paragraph([textNode(detail ? `${directive.label} - ${detail}` : directive.label)]);
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
  if (typeof value === "boolean") return value ? "VRAI" : "FAUX";
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
  resourceRepository: ResourceRepository,
  geographicMapRenderer: GeographicMapRenderer,
  registerPdfAttachment: (resource: StoredDocumentResource) => void,
): Promise<{ node: AstNode; diagnostics: Diagnostic[] }> {
  const id = directive.attributes.id;
  if (!id) return { node: fallbackPresentation(directive), diagnostics: [] };
  const resource = await resourceRepository.find(id);
  if (!resource) {
    return {
      node: fallbackPresentation(directive, "ressource introuvable"),
      diagnostics: [resourceDiagnostic("unresolved_reference", `Resource presentation not found: ${id}`, directive)],
    };
  }
  const presentation = directive.attributes.presentation;
  const incompatible = (expected: string) => ({
    node: fallbackPresentation(directive, "présentation incompatible"),
    diagnostics: [
      resourceDiagnostic(
        "incompatible_resource",
        `The "${presentation}" presentation requires ${expected}; resource ${id} is ${resource.kind}`,
        directive,
      ),
    ],
  });

  if (presentation === "image") {
    if (resource.kind !== "document" || !["image/jpeg", "image/png"].includes(resource.mediaType)) {
      return incompatible("a JPEG or PNG DocumentResource");
    }
    const align = directive.attributes.align === "left" ? "left" : "center";
    const requestedWidth = Number(directive.attributes.width);
    const width =
      Number.isInteger(requestedWidth) && requestedWidth >= 25 && requestedWidth <= 100 ? requestedWidth : 100;
    return {
      node: {
        type: "image",
        url: `data:${resource.mediaType};base64,${resource.content.toString("base64")}`,
        alt: directive.label || resource.title,
        data: {
          hProperties: {
            className: ["hall-template-image", `hall-template-image-${align}`],
            style: `width:${width}%`,
          },
        },
      },
      diagnostics: [],
    };
  }

  if (presentation === "document") {
    if (resource.kind !== "document") return incompatible("a DocumentResource");
    if (resource.mediaType === "application/pdf") {
      registerPdfAttachment(resource);
      return {
        node: paragraph([
          {
            type: "link",
            url: pdfAttachmentHref(resource.id),
            children: [textNode(resource.title)],
          },
        ]),
        diagnostics: [],
      };
    }
    return {
      node: paragraph([
        { type: "strong", children: [textNode(resource.title)] },
        textNode(` (${documentLabel(resource.format)})`),
      ]),
      diagnostics: [],
    };
  }

  if (presentation === "link") {
    if (resource.kind !== "remote") return incompatible("a RemoteResource");
    if (!resource.url) {
      return {
        node: fallbackPresentation(directive, "URL indisponible"),
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
        { type: "strong", children: [textNode(resource.title)] },
        textNode(": "),
        externalLink(resource.url, resource.url),
      ]),
      diagnostics: [],
    };
  }

  if (presentation === "legal-citation") {
    if (resource.kind !== "legalReference") return incompatible("a LegalReferenceResource");
    if (resource.resolutionStatus !== "resolved") {
      return {
        node: fallbackPresentation(directive, "référence juridique non résolue"),
        diagnostics: [
          resourceDiagnostic(
            "resource_representation_unavailable",
            `Legal reference ${id} has no authoritative snapshot`,
            directive,
          ),
        ],
      };
    }
    const snapshots = await resourceRepository.listLegalReferenceSnapshots(id);
    const snapshot = snapshots.find((candidate) => candidate.snapshotHash === resource.snapshotHash) ?? null;
    if (!snapshot) {
      return {
        node: fallbackPresentation(directive, "snapshot juridique indisponible"),
        diagnostics: [
          resourceDiagnostic(
            "resource_representation_unavailable",
            `Legal reference ${id} snapshot ${resource.snapshotHash} is unavailable`,
            directive,
          ),
        ],
      };
    }
    return {
      node: {
        type: "blockquote",
        children: [
          paragraph([{ type: "strong", children: [externalLink(resource.sourceUrl, resource.citationLabel)] }]),
          paragraph([textNode(snapshot.normalizedContent)]),
        ],
      },
      diagnostics: [],
    };
  }

  if (presentation === "map") {
    if (resource.kind !== "geographic") return incompatible("a GeographicResource");
    const geography = await resourceRepository.findGeographicData(id);
    if (!geography) {
      return {
        node: fallbackPresentation(directive, "données cartographiques indisponibles"),
        diagnostics: [
          resourceDiagnostic(
            "resource_representation_unavailable",
            `Geographic resource ${id} has no persisted geographic data`,
            directive,
          ),
        ],
      };
    }
    const image = await geographicMapRenderer.render(geography, resource.title);
    const align = directive.attributes.align === "left" ? "left" : "center";
    const requestedWidth = Number(directive.attributes.width);
    const width =
      Number.isInteger(requestedWidth) && requestedWidth >= 25 && requestedWidth <= 100 ? requestedWidth : 100;
    return {
      node: {
        type: "image",
        url: image,
        alt: directive.label || resource.title,
        data: {
          hProperties: {
            className: ["hall-template-map", `hall-template-image-${align}`],
            style: `width:${width}%`,
          },
        },
      },
      diagnostics: [],
    };
  }

  if (presentation === "table") {
    if (resource.kind !== "spreadsheet") return incompatible("a SpreadsheetResource");
    const document = await resourceRepository.findSpreadsheetDocument(id);
    if (!document) {
      return {
        node: fallbackPresentation(directive, "snapshot du tableur indisponible"),
        diagnostics: [
          resourceDiagnostic(
            "resource_representation_unavailable",
            `Spreadsheet resource ${id} has no persisted snapshot`,
            directive,
          ),
        ],
      };
    }
    const rendered = spreadsheetTable(document, directive.attributes.sheet ?? "", directive.attributes.range ?? "");
    if (!rendered.node) {
      return {
        node: fallbackPresentation(directive, "plage du tableur indisponible"),
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
  }

  return {
    node: fallbackPresentation(directive, "présentation inconnue"),
    diagnostics: [
      resourceDiagnostic(
        "resource_representation_unavailable",
        `Resource ${id} has no renderable presentation named "${presentation}"`,
        directive,
      ),
    ],
  };
}

function formatMeetingDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function personName(member: { firstName: string; lastName: string } | null): string | null {
  return member ? `${member.firstName} ${member.lastName}` : null;
}

function meetingReference(meeting: { number: string; startsAt: string } | null): string | null {
  return meeting ? `${meeting.number} - ${meeting.startsAt.slice(0, 10)}` : null;
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
  ): Promise<TemplatePreview>;
}

export function createTemplateRenderingService({
  hallSettingsRepository,
  councilMemberRepository,
  councilMeetingRepository,
  councilDecisionRepository,
  councilBusinessRepository,
  resourceRepository,
  geographicMapRenderer,
}: {
  hallSettingsRepository: HallSettingsRepository;
  councilMemberRepository: CouncilMemberRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilBusinessRepository: CouncilBusinessRepository;
  resourceRepository: ResourceRepository;
  geographicMapRenderer: GeographicMapRenderer;
}): TemplateRenderingService {
  const loadContext = async (context: TemplateRenderContext = {}): Promise<ResolvedContext> => ({
    hall: await hallSettingsRepository.get(),
    meeting: context.meetingId ? await councilMeetingRepository.find(context.meetingId) : null,
  });

  const renderSource = async (source: string, context: ResolvedContext) => {
    const tree = parse(source);
    const diagnostics = validateStructure(tree);
    const values = new Map<string, AstNode>();
    const pdfAttachments = new Map<string, StoredDocumentResource>();
    const registerPdfAttachment = (resource: StoredDocumentResource) => {
      if (!pdfAttachments.has(resource.id)) pdfAttachments.set(resource.id, resource);
    };
    for (const directive of collectDirectives(tree)) {
      const key = `${directive.name}:${directive.occurrence}`;
      if (directive.name === "resource-embed") {
        const rendered = await renderResourceEmbed(
          directive,
          resourceRepository,
          geographicMapRenderer,
          registerPdfAttachment,
        );
        values.set(key, rendered.node);
        diagnostics.push(...rendered.diagnostics);
        continue;
      }
      if (directive.name === "image") {
        const id = directive.attributes.id;
        const resource = id ? await resourceRepository.find(id) : null;
        if (resource?.kind !== "document" || !["image/jpeg", "image/png"].includes(resource.mediaType)) {
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
        const align = directive.attributes.align === "left" ? "left" : "center";
        const requestedWidth = Number(directive.attributes.width);
        const width =
          Number.isInteger(requestedWidth) && requestedWidth >= 25 && requestedWidth <= 100 ? requestedWidth : 100;
        values.set(key, {
          type: "image",
          url: `data:${resource.mediaType};base64,${resource.content.toString("base64")}`,
          alt: directive.label || resource.title,
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
          if (directive.name === "member") {
            const value = personName(await councilMemberRepository.find(id));
            if (value) node = textNode(value);
          }
          if (directive.name === "meeting") {
            const value = meetingReference(await councilMeetingRepository.find(id));
            if (value) node = textNode(value);
          }
          if (directive.name === "councilBusiness") {
            const value = (await councilBusinessRepository.find(id))?.title ?? null;
            if (value) node = textNode(value);
          }
          if (directive.name === "decision") {
            const decision = await councilDecisionRepository.find(id);
            const value = decision ? (decision.number ? `${decision.number} - ${decision.title}` : decision.title) : null;
            if (value) node = textNode(value);
          }
          if (directive.name === "resource") {
            const resource = await resourceRepository.find(id);
            if (resource?.kind === "document" && resource.mediaType === "application/pdf") {
              registerPdfAttachment(resource);
              node = { type: "link", url: pdfAttachmentHref(resource.id), children: [textNode(resource.title)] };
            } else if (resource?.kind === "remote" && resource.url) {
              node = externalLink(resource.url, resource.title);
            } else if (resource) {
              node = textNode(resource.title);
            }
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
          "meeting.startsAt": context.meeting
            ? formatMeetingDate(context.meeting.startsAt, context.hall.timeZone)
            : null,
          "meeting.location": context.meeting?.location ?? null,
          "meeting.chair": context.meeting?.chairMemberId
            ? personName(await councilMemberRepository.find(context.meeting.chairMemberId))
            : null,
          "meeting.secretary": context.meeting?.secretaryMemberId
            ? personName(await councilMemberRepository.find(context.meeting.secretaryMemberId))
            : null,
        };
        const value = fields[name];
        values.set(key, { type: "text", value: value ?? "" });
        if (value === null) {
          diagnostics.push(diagnostic("unresolved_reference", `Contexte requis pour le champ ${name}`, directive));
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
    async preview(template, renderContext = {}) {
      const context = await loadContext(renderContext);
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
