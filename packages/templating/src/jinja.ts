import { Environment, TemplateError } from "minijinja-js";
import { collectDirectives, parse } from "./document.js";

export interface JinjaRenderOptions {
  name?: string;
  autoescape?: boolean;
  timeZone?: string;
}

function markdownText(value: unknown): string {
  return String(value ?? "").replaceAll(/([\\`*_[\]#{}<>|:!()+.-])/g, "\\$1");
}

/** Expand Hall's id shorthand before Jinja can mistake it for a comment. */
function compatibleSource(source: string): string {
  const tokens = [...source.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)];
  const replacements = collectDirectives(parse(source)).flatMap((directive) => {
    const start = directive.position?.start.offset;
    const end = directive.position?.end.offset;
    if (start === undefined || end === undefined || !directive.attributes.id) return [];
    if (tokens.some((token) => token.index <= start && token.index + token[0].length > start)) return [];
    const fragment = source.slice(start, end);
    const shorthand = /\{#[^\s}]+/.exec(fragment);
    if (!shorthand) return [];
    return [
      {
        start: start + shorthand.index,
        length: shorthand[0].length,
        value: `{id=${JSON.stringify(directive.attributes.id)}`,
      },
    ];
  });
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    source =
      source.slice(0, replacement.start) + replacement.value + source.slice(replacement.start + replacement.length);
  }
  return source;
}

/** Pure Jinja evaluation: no loader, application objects, filesystem or network. */
export function renderJinja(
  source: string,
  context: Record<string, unknown>,
  options: JinjaRenderOptions = {},
): string {
  const env = new Environment();
  try {
    env.fuel = 200_000;
    env.undefinedBehavior = "strict";
    env.trimBlocks = false;
    env.lstripBlocks = false;
    env.setAutoEscapeCallback(() => options.autoescape === true);
    env.addFilter("markdown", (value: unknown) => String(value ?? ""));
    const date = (value: unknown, withTime: boolean, style: unknown = "long") => {
      if (style !== "full" && style !== "long" && style !== "medium" && style !== "short")
        throw new Error("Invalid date style");
      if (value === null || value === undefined || value === "") return "";
      const parsed = new Date(String(value).length === 10 ? `${value}T12:00:00Z` : String(value));
      if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date in template");
      return markdownText(
        new Intl.DateTimeFormat("fr-FR", {
          dateStyle: style,
          ...(withTime ? { timeStyle: "short" as const } : {}),
          timeZone: options.timeZone ?? "Europe/Paris",
        }).format(parsed),
      );
    };
    env.addFilter("date", (value: unknown, style?: unknown) => date(value, false, style));
    env.addFilter("datetime", (value: unknown, style?: unknown) => date(value, true, style));
    env.addFilter("text", markdownText);
    const name = options.name ?? "document.md";
    env.addTemplate(name, compatibleSource(source));
    return env.renderTemplate(name, context);
  } finally {
    env.free();
  }
}

export function jinjaError(error: unknown): { message: string; line: number | null } {
  return error instanceof TemplateError
    ? { message: error.message, line: error.line ?? null }
    : { message: error instanceof Error ? error.message : String(error), line: null };
}

/** Compile source without rendering: dynamic context is not required at save time. */
export function validateJinja(source: string): void {
  const env = new Environment();
  try {
    env.addTemplate("document.md", compatibleSource(source));
  } finally {
    env.free();
  }
}
