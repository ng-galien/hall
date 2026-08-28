import type { DirectiveKind } from "./grammar.js";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  /** Directive dont le nom n'appartient pas au contrat. */
  | "unknown_directive"
  /** Attribut obligatoire absent (`id`, `name`…). */
  | "missing_attribute"
  /** Attribut hors de la liste acceptée par la directive. */
  | "unexpected_attribute"
  /** La directive est bien formée mais l'entité référencée n'existe pas (autorité serveur). */
  | "unresolved_reference"
  /** Champ hors de la liste fermée `fieldNames` — vérifiable des deux côtés. */
  | "unknown_field";

/**
 * Où porte un diagnostic.
 *
 * La position source est fournie parce qu'elle est disponible et utile côté serveur ; mais le
 * client édite un arbre Lexical, pas la chaîne markdown, et remonter d'un offset vers un nœud
 * d'éditeur est fragile. C'est `occurrence` qu'il utilise pour surligner : le n-ième nœud de ce
 * type dans le document, un repère stable des deux côtés.
 */
export interface DiagnosticAnchor {
  directive: DirectiveKind | string;
  /** Index de l'occurrence parmi les directives du même nom, dans l'ordre du document. */
  occurrence: number;
  /** Identifiant visé, quand la directive en porte un. */
  id?: string;
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** Message technique, non traduit : l'affichage passe par les catalogues i18n du client. */
  message: string;
  anchor: DiagnosticAnchor;
}
