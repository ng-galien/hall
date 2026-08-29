import type { Root } from "mdast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Diagnostic } from "./diagnostics.js";
import {
  type DirectiveKind,
  directiveSpec,
  isFieldName,
  isImageAlignment,
  isImageDirective,
  isImageWidth,
} from "./grammar.js";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkStringify);

type HtmlElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
};

const imageWidth = /^(?:100|[2-9]\d)%$/;
const tableSpan = /^(?:[1-9]\d{0,2}|1000)$/;
const tableColwidth = /^(?:[1-9]\d{0,4})(?:,(?:[1-9]\d{0,4}))*$/;
const tableAlignment = /^(?:left|center|right)$/;

function isTableLength(value: string): boolean {
  const match = /^(0|[1-9]\d*(?:\.\d+)?)(px|%)$/.exec(value);
  if (!match) return false;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && (match[2] === "%" ? amount <= 100 : amount <= 10_000);
}

function safeStyle(tagName: string, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const declarations: string[] = [];
  for (const rawDeclaration of value.split(";")) {
    const separator = rawDeclaration.indexOf(":");
    if (separator < 0) continue;
    const property = rawDeclaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = rawDeclaration
      .slice(separator + 1)
      .trim()
      .toLowerCase();
    const allowed =
      ((tagName === "table" || tagName === "col") &&
        (property === "width" || property === "min-width") &&
        isTableLength(propertyValue)) ||
      ((tagName === "th" || tagName === "td") && property === "text-align" && tableAlignment.test(propertyValue)) ||
      (tagName === "img" && property === "width" && imageWidth.test(propertyValue));
    if (allowed) declarations.push(`${property}: ${propertyValue}`);
  }
  return declarations.length > 0 ? declarations.join("; ") : undefined;
}

function rehypeTablePresentationPolicy() {
  return (tree: unknown) => {
    visit(tree as never, "element", (node: HtmlElement) => {
      const properties = node.properties ?? {};
      const style = safeStyle(node.tagName, properties.style);
      if (style) properties.style = style;
      else delete properties.style;

      if (node.tagName === "th" || node.tagName === "td") {
        for (const name of ["colSpan", "rowSpan"] as const) {
          const value = String(properties[name] ?? "");
          if (!tableSpan.test(value)) delete properties[name];
        }
        const colwidth = String(properties.colwidth ?? "");
        if (!tableColwidth.test(colwidth)) delete properties.colwidth;
        const align = String(properties.align ?? "").toLowerCase();
        if (tableAlignment.test(align)) properties.align = align;
        else delete properties.align;
      }

      if (node.tagName === "table" || node.tagName === "col") {
        const width = String(properties.width ?? "").toLowerCase();
        if (isTableLength(width)) properties.width = width;
        else delete properties.width;
      }

      node.properties = properties;
    });
  };
}

const safeHtmlSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "col",
    "colgroup",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  attributes: {
    a: ["href", "title"],
    code: [["className", /^language-[a-z0-9-]+$/i]],
    col: ["style", "width"],
    img: ["alt", "className", "src", "style", "title"],
    ol: ["start"],
    table: ["style", "width"],
    td: ["align", "colSpan", "colwidth", "rowSpan", "style"],
    th: ["align", "colSpan", "colwidth", "rowSpan", "style"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["data"],
  },
};
const htmlProcessor = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeTablePresentationPolicy)
  .use(rehypeSanitize, safeHtmlSchema)
  .use(rehypeStringify);

export type TemplateAst = Root;

export function parse(markdown: string): TemplateAst {
  return processor.runSync(processor.parse(markdown)) as Root;
}

/** Serializes a tree back to its canonical Markdown form. */
export function serialize(tree: TemplateAst): string {
  return processor.stringify(tree);
}

/** Renders a resolved tree to sanitized HTML. */
export function renderHtml(tree: TemplateAst): string {
  return htmlProcessor.stringify(htmlProcessor.runSync(tree));
}

/** A directive as encountered in a document. */
export interface TemplateDirective {
  name: DirectiveKind | string;
  node: "textDirective" | "leafDirective" | "containerDirective";
  /** The bracketed label, when the directive carries one. */
  label: string;
  attributes: Record<string, string>;
  occurrence: number;
  position?: Diagnostic["anchor"]["position"];
}

function textOf(node: { children?: unknown[] }): string {
  let text = "";
  visit(node as never, "text", (child: { value: string }) => {
    text += child.value;
  });
  return text;
}

/** Collects every directive in document order, with its occurrence index. */
export function collectDirectives(tree: TemplateAst): TemplateDirective[] {
  const counters = new Map<string, number>();
  const found: TemplateDirective[] = [];
  visit(tree, (node) => {
    if (node.type !== "textDirective" && node.type !== "leafDirective" && node.type !== "containerDirective") {
      return;
    }
    const directive = node as unknown as {
      name: string;
      attributes?: Record<string, string | null | undefined> | null;
      position?: TemplateDirective["position"];
    };
    const occurrence = counters.get(directive.name) ?? 0;
    counters.set(directive.name, occurrence + 1);
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(directive.attributes ?? {})) {
      if (typeof value === "string") attributes[key] = value;
    }
    found.push({
      name: directive.name,
      node: node.type,
      label: textOf(node as never),
      attributes,
      occurrence,
      position: directive.position,
    });
  });
  return found;
}

/** Validates a tree against the grammar, without resolving referenced entities. */
export function validateStructure(tree: TemplateAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const directive of collectDirectives(tree)) {
    const anchor = {
      directive: directive.name,
      occurrence: directive.occurrence,
      id: directive.attributes.id,
      position: directive.position,
    };
    const spec = directiveSpec(directive.name);
    if (!spec) {
      diagnostics.push({
        code: "unknown_directive",
        severity: "error",
        message: `Unknown directive: ${directive.name}`,
        anchor,
      });
      continue;
    }
    if (spec.labelRequired && !directive.label.trim()) {
      diagnostics.push({
        code: "missing_label",
        severity: "error",
        message: `A label is required on :${spec.name}`,
        anchor,
      });
    }
    for (const required of spec.attributesRequired) {
      if (!directive.attributes[required]) {
        diagnostics.push({
          code: "missing_attribute",
          severity: "error",
          message: `Attribute "${required}" is required on :${spec.name}`,
          anchor,
        });
      }
    }
    if (spec.name === "field") {
      const name = directive.attributes.name;
      if (name && !isFieldName(name)) {
        diagnostics.push({
          code: "unknown_field",
          severity: "error",
          message: `Field "${name}" is not part of the contextual field list`,
          anchor,
        });
      }
    }
    if (isImageDirective(spec.name)) {
      const align = directive.attributes.align;
      if (align && !isImageAlignment(align)) {
        diagnostics.push({
          code: "invalid_attribute",
          severity: "error",
          message: `The "align" attribute on :image must be "left" or "center"`,
          anchor,
        });
      }
      const width = directive.attributes.width;
      if (width && !isImageWidth(width)) {
        diagnostics.push({
          code: "invalid_attribute",
          severity: "error",
          message: `The "width" attribute on :image must be an integer between 25 and 100`,
          anchor,
        });
      }
    }
    for (const key of Object.keys(directive.attributes)) {
      if (!spec.attributes.includes(key)) {
        diagnostics.push({
          code: "unexpected_attribute",
          severity: "warning",
          message: `Attribute "${key}" is not supported on :${spec.name}`,
          anchor,
        });
      }
    }
  }
  return diagnostics;
}
