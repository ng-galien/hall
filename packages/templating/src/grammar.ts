/** Business entities a template can reference. */
export type ReferenceKind = "member" | "resource" | "councilBusiness" | "decision" | "meeting";

export type ImageAlignment = "left" | "center";

export const imageAlignments: readonly ImageAlignment[] = ["left", "center"];
export const imageWidthRange = { min: 25, max: 100, default: 100 } as const;

export type DirectiveKind = ReferenceKind | "image" | "field";

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
  reference("member"),
  reference("resource"),
  reference("councilBusiness"),
  reference("decision"),
  reference("meeting"),
  {
    name: "image",
    node: "leafDirective",
    label: true,
    labelRequired: true,
    attributes: ["id", "align", "width"],
    attributesRequired: ["id", "align", "width"],
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

export function directiveSpec(name: string): DirectiveSpec | undefined {
  return specsByName.get(name as DirectiveKind);
}

export function isReferenceKind(name: string): name is ReferenceKind {
  return directiveSpec(name)?.reference !== undefined;
}

export function isImageDirective(name: string): name is "image" {
  return name === "image";
}

export function isImageAlignment(value: string): value is ImageAlignment {
  return imageAlignments.includes(value as ImageAlignment);
}

export function isImageWidth(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const width = Number(value);
  return width >= imageWidthRange.min && width <= imageWidthRange.max;
}

export function isFieldName(name: string): name is FieldName {
  return fieldNameSet.has(name);
}
