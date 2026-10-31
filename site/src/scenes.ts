export type PlaceId = "mairie" | "conseil" | "place" | "ecole" | "territoire";

export type StepTone = "neutral" | "valid" | "blocking";

export interface ScenarioStep {
  text: string;
  tone?: StepTone;
}

export interface Capture {
  file: string;
  caption: string;
}

/** Position du lieu réel en mètres autour du centre de l'emprise (x vers l'est, y vers le nord), rayon du repère et distance de vue. */
export interface Anchor {
  x: number;
  y: number;
  radius: number;
  view: number;
}

export interface Scene {
  id: PlaceId;
  place: string;
  where: string;
  anchor: Anchor;
  title: string;
  lead: string;
  steps: ScenarioStep[];
  captures: Capture[];
}

export const scenes: Scene[] = [
  {
    id: "mairie",
    place: "Mairie",
    where: "Décor réel : mairie de Chaux-des-Crotenay, au centre du village",
    anchor: { x: -1170, y: -2230, radius: 70, view: 1500 },
    title: "Préparation d’une affaire et convocation du conseil",
    lead: "À la maison commune, le secrétariat prépare l’affaire « Réserves et bâtiments » avant la séance du conseil.",
    steps: [
      {
        text: "L’affaire réunit le rapport sur le grenier de Cornu, la commission ravitaillement et accueil, et deux éléments préparés : le projet de délibération « Affectation du grenier de Cornu aux réserves » et la question « Aménagement des abris de Cornu ».",
      },
      { text: "Le projet de délibération est inscrit à l’ordre du jour de la prochaine séance." },
      {
        text: "L’ordre du jour est figé. Un seul PDF réunit la convocation et l’ordre du jour ; un courriel est préparé pour chaque conseiller avec le PDF joint.",
      },
    ],
    captures: [
      { file: "mairie-affaire.png", caption: "L’affaire « Réserves et bâtiments » dans l’espace de travail." },
      { file: "mairie-convocation.png", caption: "La convocation générée et la liste des conseillers destinataires." },
    ],
  },
  {
    id: "conseil",
    place: "Salle du conseil",
    where: "Décor réel : salle polyvalente du village de Chaux-des-Crotenay",
    anchor: { x: -1037, y: -2204, radius: 70, view: 1500 },
    title: "Séance du conseil : appel, pouvoirs et scrutins",
    lead: "Le conseil de l’oppidum siège sous la présidence de Vercingétorix l’Arverne. Convictolitavis l’Éduen est secrétaire de séance.",
    steps: [
      {
        text: "À l’appel, chaque membre est marqué présent, excusé, absent ou représenté. Dumnacos l’Andécave donne pouvoir à Vercassivellaunos l’Arverne.",
      },
      {
        text: "Le quorum est constaté à l’ouverture : 12 présents pour 8 requis. Sans quorum, la séance ne s’ouvre pas et le conseil est convoqué à nouveau.",
        tone: "valid",
      },
      {
        text: "Chaque point est discuté puis voté. L’affectation du grenier de Cornu est adoptée par 10 voix pour, 2 contre et 1 abstention.",
        tone: "valid",
      },
      {
        text: "La répartition des réserves de céréales est rejetée par 8 voix contre 4. La motion de liaison avec les alliés est votée à bulletin secret.",
      },
    ],
    captures: [
      { file: "conseil-appel.png", caption: "L’appel des membres en mode séance." },
      { file: "conseil-resultat.png", caption: "Le résultat du vote d’un projet de délibération." },
      {
        file: "conseil-deroule.png",
        caption: "Le déroulé de la séance : présences, pouvoirs et résultats des scrutins.",
      },
    ],
  },
  {
    id: "place",
    place: "Place",
    where: "Décor réel : devant l’église Sainte-Marguerite, à Chaux-des-Crotenay",
    anchor: { x: -1191, y: -2495, radius: 70, view: 1500 },
    title: "Procès-verbal et délibérations",
    lead: "Sur la place, le panneau d’affichage présente les actes de la commune. Après la séance, Hall rédige ces actes à partir des faits enregistrés pendant la séance.",
    steps: [
      {
        text: "Le procès-verbal reprend la présidence, le secrétaire, le quorum, les présences, les pouvoirs et le résultat de chaque vote.",
      },
      {
        text: "Le secrétaire rédige chaque point. Le document généré est arrêté lors de la séance suivante.",
        tone: "valid",
      },
      {
        text: "Chaque délibération adoptée a sa fiche : la rédaction se corrige sans modifier la décision votée, puis le document est figé.",
      },
      {
        text: "Le gel d’un document ne vaut ni signature, ni publication, ni transmission au contrôle de légalité.",
      },
    ],
    captures: [
      { file: "place-proces-verbal.png", caption: "Le procès-verbal arrêté de la séance du 1er septembre." },
      { file: "place-deliberation.png", caption: "La délibération « Affectation du grenier de Cornu aux réserves »." },
    ],
  },
  {
    id: "ecole",
    place: "École",
    where: "Décor réel : école du village de Chaux-des-Crotenay",
    anchor: { x: -999, y: -2235, radius: 70, view: 1500 },
    title: "Pièce rattachée à une affaire",
    lead: "Dans la commune de démonstration, l’école accueille les habitants mis à l’abri. Leur accueil est suivi par une affaire de la commission ravitaillement et accueil.",
    steps: [
      {
        text: "L’affaire « Accueil des habitants » décrit la situation : 142 habitants accueillis, des couvertures à renouveler et deux points d’eau à protéger.",
      },
      {
        text: "Le bilan des abris, un document PDF, est rangé dans les documents de l’affaire, avec la note sur l’organisation des abris.",
      },
      {
        text: "Le bilan est présenté au conseil pour information lors de la séance du 1er septembre ; la capacité de réserve reste une question préparée.",
      },
    ],
    captures: [
      {
        file: "ecole-piece.png",
        caption: "L’affaire « Accueil des habitants » et ses documents, dont le bilan des abris.",
      },
    ],
  },
  {
    id: "territoire",
    place: "Territoire",
    where: "Décor réel : plateau de Cornu, entre les gorges de la Lemme et de la Saine",
    anchor: { x: -1755, y: -1090, radius: 320, view: 3600 },
    title: "Carte du plateau de Cornu",
    lead: "La carte « Repérage du plateau de Cornu » situe le grenier, les abris et le point d’eau sur le plan IGN.",
    steps: [
      {
        text: "Le chemin des convois est dessiné du grenier aux abris. Sa longueur est mesurée sur la carte : 420 mètres.",
      },
      {
        text: "La légende décrit chaque élément : 120 sacs au grenier, 78 habitants à l’abri nord, 64 à l’abri sud, un point d’eau gardé la nuit.",
      },
      {
        text: "La carte est rattachée à l’affaire « Accès et convois », avec le plan du plateau joint en image.",
      },
      {
        text: "Depuis un téléphone, « Prendre une photo » range un cliché du terrain dans le dossier ; un élément dessiné sur la carte reçoit aussi sa photo.",
      },
    ],
    captures: [
      {
        file: "territoire-carte.png",
        caption: "La carte « Repérage du plateau de Cornu » et la mesure du chemin des convois.",
      },
      { file: "territoire-plan.png", caption: "Le plan du plateau de Cornu, joint à l’affaire « Accès et convois »." },
      { file: "territoire-photo.png", caption: "Sur téléphone, le menu « Nouveau » propose de prendre une photo." },
    ],
  },
];
