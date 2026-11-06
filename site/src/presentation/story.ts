import type { StorySettings } from "../story/settings";
import { Timeline } from "../story/timeline";
import type { PieceKind } from "./icons";
import settings from "./story-settings.json";

/**
 * Récit de la page de présentation : cinq lieux, chacun découpé en sous-étapes. Chaque sous-étape montre une
 * fonctionnalité de Hall. Les poids, les moments et la caméra sont dans story-settings.json ; les bornes de
 * défilement en sont dérivées par la ligne de temps.
 */

export interface Place {
  name: string;
  /** Nom court, sur une ligne, pour la gouttière des téléphones. */
  short: string;
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
  /** Titre court, sur une ligne, pour le panneau d'étape des téléphones. */
  shortTitle?: string;
  /** Ce que Hall fait concrètement, d'après le catalogue des exigences. */
  points: string[];
  /** Les deux points montrés sur téléphone, chacun sur une ligne, quand les deux premiers sont trop longs. */
  shortPoints?: string[];
  /** Règle du droit des collectivités que Hall applique, quand elle éclaire la sous-étape. */
  rule?: string;
  /** Définition d'un terme de Hall, montrée en encadré dans le panneau d'étape. */
  definition?: string;
}

export const places: Place[] = [
  { name: "Bureau", short: "Bureau", feature: "Affaires et pièces" },
  { name: "Chemin communal", short: "Chemin", feature: "Terrain et cartes" },
  { name: "Mairie", short: "Mairie", feature: "Préparation du conseil" },
  { name: "Séance", short: "Séance", feature: "Séance et vote" },
  { name: "Préfecture", short: "Préfecture", feature: "Actes du conseil" },
];

export const subSteps: SubStep[] = [
  {
    id: "creer",
    icon: "business",
    place: 0,
    title: "Création de l'affaire",
    text: "",
    points: ["Dossier et rapport prêts dès la création", "Pièces, textes et rendez-vous réunis au même endroit"],
    shortPoints: ["Dossier et rapport prêts dès la création", "Pièces, textes et rendez-vous réunis"],
    definition:
      "Une affaire, c’est un sujet suivi dans la durée : le chemin à refaire, un bâtiment, un marché. Elle réunit pièces, rapport, projets et questions pour le conseil, de la première pièce jusqu’au vote et au-delà.",
  },
  {
    id: "devis",
    icon: "pdf",
    place: 0,
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
    title: "Rattachement aux commissions",
    shortTitle: "Commissions",
    text: "",
    points: ["Choix des commissions concernées par l'affaire", "Dossiers de la commission regroupés sur sa fiche"],
    shortPoints: ["Choix des commissions concernées par l'affaire", "Dossiers regroupés par commission"],
  },
  {
    id: "rendezvous",
    icon: "event",
    place: 0,
    title: "Rendez-vous et invitations",
    shortTitle: "Rendez-vous",
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
    title: "Photos depuis le téléphone",
    shortTitle: "Photos sur place",
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
    title: "Votre assistant IA, relié à vos dossiers",
    shortTitle: "Assistant IA",
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
    title: "Projet de délibération",
    text: "",
    points: [
      "Texte propre, distinct du rapport",
      "Projet rangé dans l'affaire avant toute inscription",
      "Corrections libres pendant la préparation",
    ],
    shortPoints: ["Texte propre, distinct du rapport", "Rangé dans l'affaire avant l'inscription"],
  },
  {
    id: "partage",
    icon: "committee",
    place: 2,
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
    title: "Question ouverte",
    text: "",
    points: ["Question préparée dans l'affaire, avec son texte", "Débat sans scrutin ni délibération"],
  },
  {
    id: "inscription",
    icon: "agenda",
    place: 2,
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
    title: "Préparation de la convocation",
    shortTitle: "Convocation",
    text: "",
    points: [
      "Ordre du jour figé avant la convocation",
      "Convocation produite d'après le modèle de la commune",
      "Rappel du délai sur la fiche de séance",
      "Réouverture de l'ordre du jour avant la séance",
    ],
    shortPoints: ["Ordre du jour figé avant la convocation", "Convocation sur le modèle de la commune"],
    rule: "Délai de convocation compté en jours francs",
  },
  {
    id: "dossier",
    icon: "pdf",
    place: 2,
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
    title: "Appel et quorum",
    text: "",
    points: [
      "Présences, pouvoirs et quorum sur un seul écran",
      "Quorum calculé sans les pouvoirs",
      "Président et secrétaire présents exigés à l'ouverture",
      "Point en cours affiché sur l'écran des élus",
    ],
    shortPoints: ["Présences, pouvoirs et quorum sur un écran", "Quorum calculé sans les pouvoirs"],
  },
  {
    id: "debat",
    icon: "minutes",
    place: 3,
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
    title: "Brouillon de délibération",
    text: "",
    points: ["Brouillon ouvert dès la confirmation du vote", "Texte voté, quorum et résultat conservés tels quels"],
    shortPoints: ["Brouillon ouvert dès la confirmation du vote", "Texte voté, quorum et résultat gardés"],
  },
  {
    id: "cloture",
    icon: "minutes",
    place: 3,
    title: "Clôture de séance",
    text: "",
    points: ["Projet de procès-verbal à la clôture", "Séance suivante créée, prête à préparer"],
  },
  {
    id: "gel",
    icon: "adopted",
    place: 4,
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
    title: "Rédaction du procès-verbal",
    shortTitle: "Procès-verbal",
    text: "",
    points: [
      "Notes, vote et rédaction finale pour chaque point",
      "Nom de chaque élu dans les votes publics",
      "Approbation en premier point de la séance suivante",
    ],
    shortPoints: ["Notes, vote et rédaction pour chaque point", "Nom de chaque élu dans les votes publics"],
  },
  {
    id: "transmission",
    icon: "share",
    place: 4,
    title: "Partage de la délibération",
    shortTitle: "Délibération partagée",
    text: "",
    points: [
      "Partage du fichier depuis le téléphone",
      "Téléchargement du fichier depuis l'ordinateur",
      "Affaire ouverte pour le suivi des travaux",
    ],
  },
];

/** Ligne de temps du récit, réglée par story-settings.json. */
export const timeline = new Timeline(
  subSteps.map((step) => step.id),
  settings as StorySettings,
);

/** Bornes du récit dans le défilement : ouverture avant, invitation à la fin. */
export const storyStart = () => timeline.settings.storyStart;
export const storyEnd = () => timeline.settings.storyEnd;

export function range(id: string): [number, number] {
  return timeline.range(id);
}

/** Instant situé à la fraction f de la sous-étape. */
export function at(id: string, f: number): number {
  return timeline.at(id, f);
}

export function between(id: string, from: number, to: number): [number, number] {
  return timeline.between(id, from, to);
}

export function subStepAt(p: number): number {
  return timeline.stepAt(p);
}

export function placeRange(place: number): [number, number] {
  const steps = subSteps.filter((step) => step.place === place);
  return [range(steps[0].id)[0], range(steps[steps.length - 1].id)[1]];
}
