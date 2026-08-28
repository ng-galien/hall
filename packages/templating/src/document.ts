import type { Root } from "mdast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Diagnostic } from "./diagnostics.js";
import { type DirectiveKind, directiveSpec, isFieldName } from "./grammar.js";

/* Chaîne isomorphe : aucune dépendance à Node, le client la fait tourner dans le navigateur
   pour valider pendant la frappe. Le serveur rejoue le même code et fait autorité.

   `remark-gfm` est requis par le contrat (« CommonMark/GFM ») : sans lui un tableau n'est pas
   reconnu du tout — il traverse la chaîne comme un simple paragraphe, donc invisible à l'AST,
   à la validation et au rendu. */
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkStringify);
const safeHtmlSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    // A template must not create a remote tracking request when an EML is opened.
    // Inline images remain possible through data URLs; stored documents use typed references.
    src: ["data"],
  },
};
const htmlProcessor = unified().use(remarkRehype).use(rehypeSanitize, safeHtmlSchema).use(rehypeStringify);

export type TemplateAst = Root;

export function parse(markdown: string): TemplateAst {
  return processor.runSync(processor.parse(markdown)) as Root;
}

/**
 * Sérialisation canonique. Le contrat impose de passer par ici : `remark` normalise les
 * attributs en `{name="valeur"}` (guillemets) et conserve le raccourci `{#id}`. Écrire une
 * autre forme ferait réécrire le document à chaque enregistrement et polluerait les diffs.
 */
export function serialize(tree: TemplateAst): string {
  return processor.stringify(tree);
}

/** Convertit un arbre déjà résolu en HTML sûr : le HTML brut du Markdown n'est pas propagé. */
export function renderHtml(tree: TemplateAst): string {
  return htmlProcessor.stringify(htmlProcessor.runSync(tree));
}

/** Une directive du contrat, telle que rencontrée dans un document. */
export interface TemplateDirective {
  name: DirectiveKind | string;
  node: "textDirective" | "leafDirective" | "containerDirective";
  /** Le libellé lisible entre crochets, s'il y en a un. */
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

/** Relève toutes les directives d'un document, dans l'ordre, avec leur numéro d'occurrence. */
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

/**
 * Validation structurelle : ce qui se vérifie sans connaître la base.
 *
 * Le client l'exécute pendant la frappe pour un retour immédiat. Elle ne dit rien de
 * l'existence réelle des entités visées — cela reste l'autorité du serveur, qui produit
 * `unresolved_reference` avec le même vocabulaire. Le nom d'un champ, lui, se vérifie ici :
 * la liste est fermée et vit dans le paquet.
 */
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
        message: `Directive inconnue : ${directive.name}`,
        anchor,
      });
      continue;
    }
    for (const required of spec.attributesRequired) {
      if (!directive.attributes[required]) {
        diagnostics.push({
          code: "missing_attribute",
          severity: "error",
          message: `L'attribut « ${required} » est obligatoire sur :${spec.name}`,
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
          message: `Le champ « ${name} » n'appartient pas à la liste des champs contextuels`,
          anchor,
        });
      }
    }
    for (const key of Object.keys(directive.attributes)) {
      if (!spec.attributes.includes(key)) {
        diagnostics.push({
          code: "unexpected_attribute",
          severity: "warning",
          message: `L'attribut « ${key} » n'est pas prévu sur :${spec.name}`,
          anchor,
        });
      }
    }
  }
  return diagnostics;
}
