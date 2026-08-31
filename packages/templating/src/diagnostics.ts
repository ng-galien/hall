import type { DirectiveKind } from "./grammar.js";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  /** Directive name outside the contract. */
  | "unknown_directive"
  /** A required attribute is missing. */
  | "missing_attribute"
  /** A required label is missing. */
  | "missing_label"
  /** Attribute value outside the domain the directive allows. */
  | "invalid_attribute"
  /** Attribute outside the list the directive accepts. */
  | "unexpected_attribute"
  /** The directive is well formed but the referenced entity does not exist. */
  | "unresolved_reference"
  /** The referenced resource exists but does not support the requested presentation. */
  | "incompatible_resource"
  /** The requested static representation is not available to the authoritative renderer. */
  | "resource_representation_unavailable"
  /** Field name outside the closed `fieldNames` list. */
  | "unknown_field";

/** Where a diagnostic applies. */
export interface DiagnosticAnchor {
  directive: DirectiveKind | string;
  /** Index among directives of the same name, in document order. */
  occurrence: number;
  /** The targeted identifier, when the directive carries one. */
  id?: string;
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** Technical, untranslated message. */
  message: string;
  anchor: DiagnosticAnchor;
}
