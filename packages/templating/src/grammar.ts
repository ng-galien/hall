import { type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";

/** Internal reference directives, in the canonical entity order owned by the domain. */
export const referenceKinds = referenceEntityKinds;

export type ReferenceKind = ReferenceEntityKind;

export type ImageAlignment = "left" | "center";

export const imageAlignments: readonly ImageAlignment[] = ["left", "center"];
export const imageWidthRange = { min: 25, max: 100, default: 100 } as const;
export const mapPresentationDefaults = { align: "center", width: 75 } as const;

export const resourcePresentationKinds = ["image", "document", "link", "legal-citation", "map", "table"] as const;

export type ResourcePresentationKind = (typeof resourcePresentationKinds)[number];

export interface ResourceEmbedAttributes {
  id: string;
  label: string;
  presentation: ResourcePresentationKind;
  align?: ImageAlignment;
  width?: number;
  sheet?: string;
  range?: string;
}

export type DirectiveKind = ReferenceKind | "image" | "resource-embed" | "field";

/** What a directive accepts. */
export interface DirectiveSpec {
  name: DirectiveKind;
  /** `textDirective` is `:name[...]`, `leafDirective` is `::name[...]`. */
  node: "textDirective" | "leafDirective";
  /** Whether a bracketed label is expected. */
  label: boolean;
  /** Whether the label is mandatory. */
  labelRequired?: boolean;
  /** Accepted attributes; `id` uses the `{#value}` shorthand. */
  attributes: readonly string[];
  attributesRequired: readonly string[];
  /** The entity the server resolves for a business reference. */
  reference?: ReferenceKind;
}

const reference = (name: ReferenceKind): DirectiveSpec => ({
  name,
  node: "textDirective",
  label: true,
  attributes: ["id"],
  attributesRequired: ["id"],
  reference: name,
});

export const directiveSpecs: readonly DirectiveSpec[] = [
  ...referenceKinds.map(reference),
  {
    name: "image",
    node: "leafDirective",
    label: true,
    labelRequired: true,
    attributes: ["id", "align", "width"],
    attributesRequired: ["id", "align", "width"],
  },
  {
    name: "resource-embed",
    node: "leafDirective",
    label: true,
    labelRequired: true,
    attributes: ["id", "presentation", "align", "width", "sheet", "range"],
    attributesRequired: ["id", "presentation"],
  },
  {
    name: "field",
    node: "textDirective",
    label: false,
    attributes: ["name"],
    attributesRequired: ["name"],
  },
] as const;

/** Closed list of contextual field names accepted by the `field` directive. */
export const fieldNames = [
  "hall.name",
  "meeting.startsAt",
  "meeting.location",
  "meeting.chair",
  "meeting.secretary",
] as const;

export type FieldName = (typeof fieldNames)[number];

const specsByName = new Map(directiveSpecs.map((spec) => [spec.name, spec]));
const fieldNameSet = new Set<string>(fieldNames);
const resourcePresentationKindSet = new Set<string>(resourcePresentationKinds);

export function directiveSpec(name: string): DirectiveSpec | undefined {
  return specsByName.get(name as DirectiveKind);
}

export function isReferenceKind(name: string): name is ReferenceKind {
  return directiveSpec(name)?.reference !== undefined;
}

export function isImageDirective(name: string): name is "image" {
  return name === "image";
}

export function isResourceEmbedDirective(name: string): name is "resource-embed" {
  return name === "resource-embed";
}

export function isResourcePresentationKind(value: string): value is ResourcePresentationKind {
  return resourcePresentationKindSet.has(value);
}

export function isImageAlignment(value: string): value is ImageAlignment {
  return imageAlignments.includes(value as ImageAlignment);
}

export function isImageWidth(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const width = Number(value);
  return width >= imageWidthRange.min && width <= imageWidthRange.max;
}

function unescapeDirectiveValue(value: string): string {
  return value.replace(/\\([\\\]"])/g, "$1");
}

function quoteAttribute(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function resourceEmbedAttribute(source: string, name: string): string | undefined {
  if (name === "id") return /(?:^|\s)#([^\s}]+)/.exec(source)?.[1];
  const match = new RegExp(`(?:^|\\s)${name}=(?:"((?:\\\\.|[^"])*)"|([^\\s}]+))`).exec(source);
  return match?.[1] !== undefined ? unescapeDirectiveValue(match[1]) : match?.[2];
}

/** Parses the closed block directive consumed by rich editors and server renderers. */
export function parseResourceEmbedDirective(source: string): (ResourceEmbedAttributes & { raw: string }) | null {
  const match = /^::resource-embed\[((?:\\.|[^\]])*)\]\{([^}]*)\}/.exec(source);
  if (!match) return null;
  const id = resourceEmbedAttribute(match[2], "id");
  const presentation = resourceEmbedAttribute(match[2], "presentation");
  if (!id || !presentation || !isResourcePresentationKind(presentation)) return null;
  const align = resourceEmbedAttribute(match[2], "align");
  const width = resourceEmbedAttribute(match[2], "width");
  const sheet = resourceEmbedAttribute(match[2], "sheet");
  const range = resourceEmbedAttribute(match[2], "range");
  return {
    raw: match[0],
    id,
    label: unescapeDirectiveValue(match[1]),
    presentation,
    ...(align && isImageAlignment(align) ? { align } : {}),
    ...(width && isImageWidth(width) ? { width: Number(width) } : {}),
    ...(sheet ? { sheet } : {}),
    ...(range ? { range } : {}),
  };
}

/** Serializes a resource block with one canonical attribute order. */
export function serializeResourceEmbedDirective(attributes: ResourceEmbedAttributes): string {
  const values = [`#${attributes.id}`, `presentation=${quoteAttribute(attributes.presentation)}`];
  if (attributes.presentation === "image" || attributes.presentation === "map") {
    const align =
      attributes.align && isImageAlignment(attributes.align)
        ? attributes.align
        : attributes.presentation === "map"
          ? mapPresentationDefaults.align
          : "left";
    const defaultWidth = attributes.presentation === "map" ? mapPresentationDefaults.width : imageWidthRange.default;
    const width = Math.round(
      Math.min(imageWidthRange.max, Math.max(imageWidthRange.min, attributes.width ?? defaultWidth)),
    );
    values.push(`align=${quoteAttribute(align)}`, `width=${quoteAttribute(String(width))}`);
  }
  if (attributes.presentation === "table") {
    if (attributes.sheet) values.push(`sheet=${quoteAttribute(attributes.sheet)}`);
    if (attributes.range) values.push(`range=${quoteAttribute(attributes.range.toUpperCase())}`);
  }
  const label = attributes.label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").trim();
  return `::resource-embed[${label}]{${values.join(" ")}}`;
}

export function isFieldName(name: string): name is FieldName {
  return fieldNameSet.has(name);
}
