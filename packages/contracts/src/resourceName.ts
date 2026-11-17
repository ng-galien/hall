import { z } from "zod";

/** « ∕ » (U+2215, division slash): written in a name in place of « / », which separates the folders of a path. */
export const resourceNameSlash = "∕";

/** A name or a searched text with each « / » written « ∕ ». */
// @implements-requirement HALL-FR-DOC-590
export function resourceNameText(value: string): string {
  return value.replaceAll("/", resourceNameSlash);
}

/** Codes of the refusal of a name, each naming its reason. */
export const resourceNameRefusals = [
  "resource_name_required",
  "resource_name_reserved",
  "resource_name_too_long",
] as const;
export type ResourceNameRefusal = (typeof resourceNameRefusals)[number];

export function isResourceNameRefusal(value: string): value is ResourceNameRefusal {
  return (resourceNameRefusals as readonly string[]).includes(value);
}

/** Name of a document, a folder or a council business: trimmed, « / » written « ∕ », neither « . » nor « .. ». */
// @implements-requirement HALL-FR-DOC-590
export const resourceNameSchema = z
  .string()
  .trim()
  .overwrite(resourceNameText)
  .min(1, "resource_name_required")
  .max(200, "resource_name_too_long")
  .refine((name) => name !== "." && name !== "..", "resource_name_reserved");
