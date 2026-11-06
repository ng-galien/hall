import type { PieceKind } from "./icons";

/**
 * Récit de la page de présentation : cinq lieux, chacun découpé en sous-étapes. Chaque sous-étape montre une
 * fonctionnalité de Hall ; ses bornes de défilement sont dérivées de son poids.
 */

export interface Place {
  name: string;
  feature: string;
}

export interface SubStep {
  id: string;
  /** Icône de Hall de ce que la sous-étape montre. */
  icon: PieceKind;
  place: number;
  /** La fonctionnalité de Hall montrée. */
  title: string;
  /** Une phrase de contexte du récit. */
  text: string;
  /** Ce que Hall fait concrètement, d'après le catalogue des exigences. */
  points: string[];
  /** Règle du droit des collectivités que Hall applique, quand elle éclaire la sous-étape. */
  rule?: string;
  /** Définition d'un terme de Hall, montrée en encadré dans le panneau d'étape. */
  definition?: string;
  weight: number;
}

export const places: Place[] = [
  { name: "Bureau", feature: "Affaires et pièces" },
  { name: "Chemin communal", feature: "Terrain et cartes" },
  { name: "Mairie", feature: "Préparation du conseil" },
  { name: "Séance", feature: "Séance et vote" },
  { name: "Préfecture", feature: "Actes du conseil" },
];

export const subSteps: SubStep[] = [
  {
    id: "creer",
    icon: "business",
    place: 0,
    weight: 1.3,
    title: "Création de l'affaire",
    text: "",
    points: ["Dossier et rapport prêts dès la création", "Pièces, textes et rendez-vous réunis au même endroit"],
    definition:
      "Une affaire, c’est un sujet suivi dans la durée : le chemin à refaire, un bâtiment, un marché. Elle réunit pièces, rapport, projets et questions pour le conseil, de la première pièce jusqu’au vote et au-delà.",
  },
  {
    id: "devis",
    icon: "pdf",
    place: 0,
    weight: 2.3,
    title: "Devis et budget",
    text: "",
    points: [
      "Dépôt de documents PDF ou Word dans l'affaire",
      "Tableurs du budget, modifiables dans l’affaire",
      "Document conservé dans son dossier d'origine",
      "Ouverture en plein écran pour la relecture",
    ],
  },
  {
    id: "rapport",
    icon: "draft",
    place: 0,
    weight: 1.3,
    title: "Rédaction du rapport",
    text: "",
    points: [
      "Plans et fichiers déposés dans le texte",
      "Pièce citée ajoutée aux documents de l'affaire",
      "Historique des modifications, avec auteur et date",
      "Textes de référence rangés avec les pièces",
    ],
  },
  {
    id: "commission",
    icon: "committee",
    place: 0,
    weight: 0.7,
    title: "Rattachement aux commissions",
    text: "",
    points: ["Choix des commissions concernées par l'affaire", "Dossiers de la commission regroupés sur sa fiche"],
  },
  {
    id: "rendezvous",
    icon: "event",
    place: 0,
    weight: 0.8,
    title: "Rendez-vous et invitations",
    text: "",
    points: [
      "Rendez-vous au calendrier, relié à l'affaire",
      "Invitation des élus, des contacts et des groupes",
      "Courriel d'invitation prêt, fichier de calendrier joint",
    ],
  },
  {
    id: "photo",
    icon: "image",
    place: 1,
    weight: 1.35,
    title: "Photos depuis le téléphone",
    text: "",
    points: [
      "Écrans adaptés à la taille du téléphone",
      "Photo prise sur place, rangée dans l'affaire",
      "Image existante choisie dans la galerie",
    ],
  },
  {
    id: "trace",
    icon: "geographic",
    place: 1,
    weight: 1.8,
    title: "Dessin sur la carte",
    text: "",
    points: [
      "Points, tracés et zones sur le fond IGN",
      "Mesure des longueurs et des surfaces",
      "Note et photos sur chaque dessin",
      "Légende des couleurs de la carte",
    ],
  },
  {
    id: "cadastre",
    icon: "layer",
    place: 1,
    weight: 0.9,
    title: "Couche du cadastre",
    text: "",
    points: [
      "Import des parcelles en couche sur la carte",
      "Numéros de parcelles visibles au zoom",
      "Parcelles de la commune mises en évidence",
    ],
  },
  {
    id: "assistant",
    icon: "share",
    place: 2,
    weight: 2.4,
    title: "Votre assistant IA, relié à vos dossiers",
    text: "",
    points: [
      "Il lit les pièces de l’affaire et vous aide à rédiger",
      "Il retrouve et classe les documents",
      "Il ne voit que ce que votre compte peut voir",
      "Il ne vote pas et ne décide de rien",
    ],
  },
  {
    id: "projet",
    icon: "matter",
    place: 2,
    weight: 1.3,
    title: "Projet de délibération",
    text: "",
    points: [
      "Texte propre, distinct du rapport",
      "Projet rangé dans l'affaire avant toute inscription",
      "Corrections libres pendant la préparation",
    ],
  },
  {
    id: "partage",
    icon: "committee",
    place: 2,
    weight: 1.0,
    title: "Tout le conseil informé",
    text: "",
    points: [
      "Chaque élu voit le dossier dès qu’il est prêt",
      "Sur ordinateur, tablette ou téléphone",
      "Les mêmes pièces pour tous, à jour en direct",
      "Plus de dossiers papier à photocopier ni à distribuer",
    ],
  },
  {
    id: "question",
    icon: "question",
    place: 2,
    weight: 0.6,
    title: "Question ouverte",
    text: "",
    points: ["Question préparée dans l'affaire, avec son texte", "Débat sans scrutin ni délibération"],
  },
  {
    id: "inscription",
    icon: "agenda",
    place: 2,
    weight: 0.8,
    title: "Ordre du jour",
    text: "",
    points: [
      "Procès-verbal précédent en premier point",
      "Projets placés avant les questions ouvertes",
      "Numérotation des points ajustée à chaque inscription",
    ],
  },
  {
    id: "convocation",
    icon: "pdf",
    place: 2,
    weight: 0.8,
    title: "Préparation de la convocation",
    text: "",
    points: [
      "Ordre du jour figé avant la convocation",
      "Convocation produite d'après le modèle de la commune",
      "Rappel du délai sur la fiche de séance",
      "Réouverture de l'ordre du jour avant la séance",
    ],
    rule: "Délai de convocation compté en jours francs",
  },
  {
    id: "dossier",
    icon: "pdf",
    place: 2,
    weight: 0.7,
    title: "Dossier de séance",
    text: "",
    points: [
      "Ordre du jour, rapports, projets et pièces réunis",
      "Document unique, dans l'ordre des points",
      "Partage du dossier depuis le téléphone",
    ],
  },
  {
    id: "appel",
    icon: "committee",
    place: 3,
    weight: 1.3,
    title: "Appel et quorum",
    text: "",
    points: [
      "Présences, pouvoirs et quorum sur un seul écran",
      "Quorum calculé sans les pouvoirs",
      "Président et secrétaire présents exigés à l'ouverture",
      "Point en cours affiché sur l'écran des élus",
    ],
  },
  {
    id: "debat",
    icon: "minutes",
    place: 3,
    weight: 0.9,
    title: "Débat en séance",
    text: "",
    points: [
      "Notes de séance prises au fil des échanges",
      "Pièces de l'affaire ouvertes en plein écran",
      "Fin de la question ouverte sans vote",
    ],
  },
  {
    id: "scrutin",
    icon: "matter",
    place: 3,
    weight: 1.0,
    title: "Vote du conseil",
    text: "",
    points: [
      "Vote public nominatif ou à bulletin secret",
      "Abstentions exclues des suffrages exprimés",
      "Résultat calculé, puis confirmé avant enregistrement",
    ],
    rule: "Égalité en vote public : voix prépondérante du président",
  },
  {
    id: "deliberation",
    icon: "adopted",
    place: 3,
    weight: 0.8,
    title: "Brouillon de délibération",
    text: "",
    points: ["Brouillon ouvert dès la confirmation du vote", "Texte voté, quorum et résultat conservés tels quels"],
  },
  {
    id: "cloture",
    icon: "minutes",
    place: 3,
    weight: 0.6,
    title: "Clôture de séance",
    text: "",
    points: ["Projet de procès-verbal à la clôture", "Séance suivante créée, prête à préparer"],
  },
  {
    id: "gel",
    icon: "adopted",
    place: 4,
    weight: 0.8,
    title: "Délibération définitive",
    text: "",
    points: [
      "Rédaction corrigeable jusqu'au gel",
      "Délibération figée, numérotée et datée",
      "Version définitive conservée telle quelle",
    ],
    rule: "Signature, affichage et transmission restent à faire après le gel",
  },
  {
    id: "liste",
    icon: "pdf",
    place: 4,
    weight: 0.6,
    title: "Liste des délibérations",
    text: "",
    points: [
      "Liste de la séance prête pour l'affichage",
      "Document destiné au panneau et au site",
      "Mise en page d'après le modèle de la commune",
    ],
  },
  {
    id: "pv",
    icon: "minutes",
    place: 4,
    weight: 0.6,
    title: "Rédaction du procès-verbal",
    text: "",
    points: [
      "Notes, vote et rédaction finale pour chaque point",
      "Nom de chaque élu dans les votes publics",
      "Approbation en premier point de la séance suivante",
    ],
  },
  {
    id: "transmission",
    icon: "share",
    place: 4,
    weight: 1.7,
    title: "Partage de la délibération",
    text: "",
    points: [
      "Partage du fichier depuis le téléphone",
      "Téléchargement du fichier depuis l'ordinateur",
      "Affaire ouverte pour le suivi des travaux",
    ],
  },
];

/** Bornes du récit dans le défilement : ouverture avant, invitation à la fin. */
export const STORY_START = 0.03;
export const STORY_END = 0.975;

const total = subSteps.reduce((sum, step) => sum + step.weight, 0);
const bounds = new Map<string, [number, number]>();
{
  let cursor = STORY_START;
  for (const step of subSteps) {
    const length = ((STORY_END - STORY_START) * step.weight) / total;
    bounds.set(step.id, [cursor, cursor + length]);
    cursor += length;
  }
}

export function range(id: string): [number, number] {
  const value = bounds.get(id);
  if (!value) throw new Error(`Sous-étape inconnue : ${id}`);
  return value;
}

/** Instant situé à la fraction f de la sous-étape. */
export function at(id: string, f: number): number {
  const [a, b] = range(id);
  return a + (b - a) * f;
}

export function between(id: string, from: number, to: number): [number, number] {
  return [at(id, from), at(id, to)];
}

export function subStepAt(p: number): number {
  let index = -1;
  subSteps.forEach((step, i) => {
    if (p >= range(step.id)[0]) index = i;
  });
  return index;
}

export function placeRange(place: number): [number, number] {
  const steps = subSteps.filter((step) => step.place === place);
  return [range(steps[0].id)[0], range(steps[steps.length - 1].id)[1]];
}
