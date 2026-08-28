import type { ContentTemplate, HallSettings, TemplateRenderContext } from "@hall/domain";
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
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CouncilMemberRepository,
  HallSettingsRepository,
  ResourceRepository,
  TopicRepository,
} from "../repositories/contracts.js";

type AstNode = {
  type: string;
  name?: string;
  value?: string;
  children?: AstNode[];
};

export interface TemplatePreview {
  html: string;
  /** HTML without preview-only header/footer; used as Chromium's printable page body. */
  printHtml: string;
  text: string;
  subject: string | null;
  diagnostics: Diagnostic[];
  headerHtml: string;
  footerHtml: string;
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

function textFromTree(node: AstNode): string {
  if (node.type === "text") return node.value ?? "";
  const content = (node.children ?? []).map(textFromTree).join("");
  return ["paragraph", "heading", "listItem", "blockquote"].includes(node.type) ? `${content}\n` : content;
}

function replaceDirectives(node: AstNode, values: Map<string, string>, counters = new Map<string, number>()): AstNode {
  if (["textDirective", "leafDirective", "containerDirective"].includes(node.type)) {
    const name = node.name ?? "";
    const occurrence = counters.get(name) ?? 0;
    counters.set(name, occurrence + 1);
    return { type: "text", value: values.get(`${name}:${occurrence}`) ?? "" };
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
  topicRepository,
  resourceRepository,
}: {
  hallSettingsRepository: HallSettingsRepository;
  councilMemberRepository: CouncilMemberRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  topicRepository: TopicRepository;
  resourceRepository: ResourceRepository;
}): TemplateRenderingService {
  const loadContext = async (context: TemplateRenderContext = {}): Promise<ResolvedContext> => ({
    hall: await hallSettingsRepository.get(),
    meeting: context.meetingId ? await councilMeetingRepository.find(context.meetingId) : null,
  });

  const renderSource = async (source: string, context: ResolvedContext) => {
    const tree = parse(source);
    const diagnostics = validateStructure(tree);
    const values = new Map<string, string>();
    for (const directive of collectDirectives(tree)) {
      const key = `${directive.name}:${directive.occurrence}`;
      if (isReferenceKind(directive.name)) {
        const id = directive.attributes.id;
        let value: string | null = null;
        if (id) {
          if (directive.name === "member") value = personName(await councilMemberRepository.find(id));
          if (directive.name === "meeting") value = (await councilMeetingRepository.find(id))?.title ?? null;
          if (directive.name === "topic") value = (await topicRepository.find(id))?.title ?? null;
          if (directive.name === "decision") {
            const decision = await councilDecisionRepository.find(id);
            value = decision ? (decision.number ? `${decision.number} — ${decision.title}` : decision.title) : null;
          }
          if (directive.name === "resource") value = (await resourceRepository.findMetadata(id))?.title ?? null;
        }
        values.set(key, value ?? directive.label);
        if (id && value === null) {
          diagnostics.push(
            diagnostic("unresolved_reference", `Référence ${directive.name} introuvable : ${id}`, directive),
          );
        }
        continue;
      }
      if (directive.name === "field") {
        const name = directive.attributes.name;
        if (!name || !isFieldName(name)) continue;
        const fields: Record<typeof name, string | null> = {
          "hall.name": context.hall.name,
          "meeting.title": context.meeting?.title ?? null,
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
        values.set(key, value ?? "");
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
      };
    },
  };
}
