/**
 * La grammaire du contrat de templating.
 *
 * Ce fichier est la source unique : le serveur et le client en dérivent tous deux leur
 * comportement. Le client NE redéfinit PAS sa propre grammaire — il lit ce registre pour
 * construire ses descripteurs d'éditeur, son menu d'insertion et son autocomplétion.
 *
 * Périmètre initial arrêté en commun : cinq références métier et des champs contextuels
 * pris dans une liste fermée. Pas d'expression, pas de fonction, pas d'interpolation libre,
 * pas de navigation dynamique. `snippet` est hors périmètre et n'est donc pas déclaré ici :
 * rencontré dans un document il est préservé à la sérialisation, mais diagnostiqué comme
 * directive inconnue et non rendu.
 */

/** Les entités métier qu'un gabarit peut référencer. */
export type ReferenceKind = "member" | "resource" | "topic" | "decision" | "meeting";

/** Les familles de directives du contrat. */
export type DirectiveKind = ReferenceKind | "field";

/**
 * Ce qu'une directive accepte. Le client s'en sert pour générer ses descripteurs sans
 * dupliquer la connaissance ; le serveur pour valider.
 */
export interface DirectiveSpec {
  name: DirectiveKind;
  /** `textDirective` = `:nom[…]`, `leafDirective` = `::nom[…]` (bloc, sans enfants). */
  node: "textDirective" | "leafDirective";
  /** Un libellé lisible entre crochets est-il attendu ? */
  label: boolean;
  /** Attributs acceptés. `id` s'écrit avec le raccourci `{#valeur}`. */
  attributes: readonly string[];
  attributesRequired: readonly string[];
  /** L'entité résolue par le serveur, s'il s'agit d'une référence métier. */
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
  reference("topic"),
  reference("decision"),
  reference("meeting"),
  {
    // Valeur contextuelle résolue au rendu, prise dans `fieldNames`.
    name: "field",
    node: "textDirective",
    label: false,
    attributes: ["name"],
    attributesRequired: ["name"],
  },
] as const;

/**
 * La liste fermée des champs contextuels.
 *
 * Fermée veut dire que `name` doit correspondre exactement à une de ces entrées : ce n'est
 * pas un chemin d'accès évalué, et rien n'est résolu dynamiquement. Le client la lit pour
 * proposer l'autocomplétion et refuser un nom hors liste dès la frappe ; le serveur reste
 * autoritaire pour produire les valeurs. Toute entrée nouvelle s'ajoute ici, des deux côtés
 * d'un coup — c'est l'intérêt du paquet partagé.
 */
export const fieldNames = [
  "hall.name",
  "meeting.title",
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

export function isFieldName(name: string): name is FieldName {
  return fieldNameSet.has(name);
}
