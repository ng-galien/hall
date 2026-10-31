export type AxisId = "ouverture" | "preparer" | "sieger";

export type SceneId =
  | "ouverture"
  | "veille"
  | "carte"
  | "grenier"
  | "ouvrages"
  | "defense"
  | "convocation"
  | "appel"
  | "rationnement"
  | "motion"
  | "actes";

export type PlaceId = "tour" | "cornu" | "plaine" | "rempart" | "maison" | "belvedere" | "place";

export type StepTone = "neutral" | "valid" | "blocking";

export type MarkTone = "blue" | "green" | "light" | "slate";

/** Position en mètres autour du centre de l'emprise (5,98 E, 46,6775 N), x vers l'est, y vers le nord. */
export interface Spot {
  x: number;
  y: number;
}

/** Point de vue : cible, direction d'où regarde la caméra (degrés depuis le nord, sens horaire), hauteur angulaire et distance en mètres. */
export interface Pose {
  at: Spot;
  azimuth: number;
  elevation: number;
  distance: number;
}

export type Mark =
  | { kind: "point"; at: Spot; tone: MarkTone; label?: string }
  | { kind: "work"; at: Spot }
  | { kind: "label"; at: Spot; text: string };

export interface Motion {
  from: Pose;
  to: Pose;
  seconds: number;
  marks: Mark[];
  trace?: { points: Spot[]; label: string };
}

export interface ScenarioStep {
  text: string;
  tone?: StepTone;
}

export interface Capture {
  file: string;
  caption: string;
  width: number;
  height: number;
}

export interface Place {
  id: PlaceId;
  name: string;
  at: Spot;
}

export interface Scene {
  id: SceneId;
  axis: AxisId;
  code: string;
  short: string;
  place: PlaceId | null;
  where: string;
  title: string;
  lead: string;
  steps: ScenarioStep[];
  feature: string;
  captures: Capture[];
  motion: Motion;
}

export interface Axis {
  id: AxisId;
  name: string;
}

const ORIGIN = { lon: 5.98, lat: 46.6775 };
const METRES_PER_DEGREE_LAT = 111_132;
const METRES_PER_DEGREE_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Convertit une position WGS84 (longitude, latitude) en mètres de la scène. */
export function wgs(lon: number, lat: number): Spot {
  return {
    x: Math.round((lon - ORIGIN.lon) * METRES_PER_DEGREE_LON),
    y: Math.round((lat - ORIGIN.lat) * METRES_PER_DEGREE_LAT),
  };
}

const desktop = (file: string, caption: string): Capture => ({ file, caption, width: 1440, height: 900 });
const phone = (file: string, caption: string): Capture => ({ file, caption, width: 390, height: 844 });

const spots = {
  confluence: wgs(5.9426, 46.69),
  plateau: wgs(5.962, 46.67),
  rachet: wgs(5.9693, 46.6502),
  tower: wgs(5.9532, 46.6819),
  cornu: wgs(5.957, 46.6677),
  granary: wgs(5.959, 46.6687),
  plain: wgs(5.95, 46.695),
  westRampart: wgs(5.9465, 46.663),
  northCurtain: wgs(5.953, 46.6777),
  hall: wgs(5.9705, 46.6655),
  square: wgs(5.968, 46.6705),
  lookout: wgs(5.9381, 46.6997),
  meeting: wgs(5.9505, 46.6935),
};

export const places: Place[] = [
  { id: "tour", name: "Tour de guet nord", at: spots.tower },
  { id: "cornu", name: "Grenier et chemins de Cornu", at: spots.cornu },
  { id: "plaine", name: "Plaine de Syam", at: spots.plain },
  { id: "rempart", name: "Rempart ouest", at: spots.westRampart },
  { id: "maison", name: "Maison commune de l’oppidum", at: spots.hall },
  { id: "place", name: "Place de l’assemblée", at: spots.square },
  { id: "belvedere", name: "Belvédère des Trois Vallées", at: spots.lookout },
];

export const axes: Axis[] = [
  { id: "ouverture", name: "Ouverture" },
  { id: "preparer", name: "Préparer" },
  { id: "sieger", name: "Siéger" },
];

/** Tracé du chemin des convois de la carte « Repérage du plateau de Cornu » du jeu Alésia. */
const convoyPath: Spot[] = [wgs(5.959, 46.6687), wgs(5.9575, 46.6682), wgs(5.9555, 46.6687), wgs(5.9545, 46.6697)];

/** Ouvrages romains vus depuis l'oppidum, stylisés en marques isolées dans la plaine, sans tracé continu. */
const romanWorks: Spot[] = [
  wgs(5.9405, 46.6905),
  wgs(5.9435, 46.6935),
  wgs(5.9465, 46.6958),
  wgs(5.95, 46.6972),
  wgs(5.9538, 46.6978),
  wgs(5.9575, 46.6972),
  wgs(5.961, 46.6958),
  wgs(5.964, 46.6936),
];

function ring(centre: Spot, radius: number, count: number): Spot[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return { x: Math.round(centre.x + radius * Math.cos(angle)), y: Math.round(centre.y + radius * Math.sin(angle)) };
  });
}

function scatter(centre: Spot, count: number): Spot[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.39996;
    const radius = 220 + 45 * index;
    return { x: Math.round(centre.x + radius * Math.cos(angle)), y: Math.round(centre.y + radius * Math.sin(angle)) };
  });
}

const rollCall: MarkTone[] = [...Array<MarkTone>(12).fill("green"), "blue", "slate", "slate"];
const granaryVote: MarkTone[] = [...Array<MarkTone>(10).fill("green"), "light", "light", "slate"];

export const scenes: Scene[] = [
  {
    id: "ouverture",
    axis: "ouverture",
    code: "",
    short: "Alésia",
    place: null,
    where: "Lieu du récit : l’oppidum d’Alésia, sur le plateau entre la Lemme et la Saine",
    title: "Alésia sur le plateau de Cornu",
    lead: "Après le combat de cavalerie perdu, Vercingétorix replie l’armée gauloise sur l’oppidum d’Alésia, la ville des Mandubiens. Le conseil de la commune prépare les affaires du siège, puis siège pour les trancher.",
    steps: [
      { text: "Préparer : la veille, la carte, le grenier, les ouvrages romains observés, la défense du plateau." },
      {
        text: "Siéger : la convocation, l’appel, les scrutins, la motion secrète, les actes et le courrier au proconsul.",
      },
    ],
    feature: "Vercingétorix est maire d’Alésia ; quinze chefs siègent au conseil, avec deux commissions.",
    captures: [],
    motion: {
      from: { at: spots.confluence, azimuth: 350, elevation: 38, distance: 9000 },
      to: { at: spots.plateau, azimuth: 175, elevation: 34, distance: 11000 },
      seconds: 14,
      marks: [{ kind: "label", at: spots.plateau, text: "Oppidum d’Alésia" }],
    },
  },
  {
    id: "veille",
    axis: "preparer",
    code: "P1",
    short: "La veille",
    place: "tour",
    where: "Lieu du récit : tour de guet nord de l’oppidum, au belvédère des Prés Grillet, face à la plaine de Syam",
    title: "La veille et le registre de la tour nord",
    lead: "Chaque nuit, les veilleurs relèvent les feux, les mouvements et les travaux romains observés dans la plaine.",
    steps: [
      { text: "L’affaire « Veille autour de l’oppidum » réunit le rapport de la commission défense et soutien." },
      {
        text: "Le registre des observations de la tour nord est un PDF rangé dans les documents de l’affaire, avec la consigne de relève.",
      },
      { text: "La question « Relève des veilleurs du rempart nord » est préparée pour la prochaine séance." },
    ],
    feature: "Dans Hall : une affaire, ses pièces et une question préparée pour une séance.",
    captures: [desktop("preparer-veille.png", "L’affaire « Veille autour de l’oppidum » et ses trois documents.")],
    motion: {
      from: { at: spots.northCurtain, azimuth: 160, elevation: 20, distance: 2200 },
      to: { at: spots.tower, azimuth: 200, elevation: 18, distance: 2600 },
      seconds: 12,
      marks: [
        { kind: "point", at: spots.tower, tone: "blue", label: "Poste de veille" },
        { kind: "point", at: wgs(5.945, 46.6925), tone: "light" },
        { kind: "point", at: wgs(5.9505, 46.6965), tone: "light" },
        { kind: "point", at: wgs(5.956, 46.6955), tone: "light" },
        { kind: "point", at: wgs(5.961, 46.6925), tone: "light" },
      ],
    },
  },
  {
    id: "carte",
    axis: "preparer",
    code: "P2",
    short: "La carte",
    place: "cornu",
    where: "Lieu du récit : les chemins du hameau de Cornu, entre le grenier et les abris",
    title: "La carte des convois et le passage des messagers",
    lead: "Le chemin des convois relie le grenier aux abris. Il est dessiné sur la carte de l’affaire « Accès et convois », sur le plan IGN du plateau.",
    steps: [
      { text: "La longueur du chemin se mesure sur la carte : 425 mètres du grenier à l’abri nord." },
      {
        text: "La légende décrit chaque élément : 120 sacs au grenier, 78 habitants à l’abri nord, 64 à l’abri sud, un point d’eau gardé la nuit.",
      },
      {
        text: "Éporédorix l’Éduen présente deux passages pour les messagers, décrits dans un PDF ; Commius l’Atrébate prépare la note de liaison avec les alliés.",
      },
    ],
    feature: "Dans Hall : la carte d’une affaire, le dessin, la mesure de longueur et la légende.",
    captures: [
      desktop("preparer-carte.png", "La carte « Repérage du plateau de Cornu » et la mesure du chemin des convois."),
    ],
    motion: {
      from: { at: spots.cornu, azimuth: 180, elevation: 80, distance: 1800 },
      to: { at: wgs(5.957, 46.669), azimuth: 160, elevation: 55, distance: 1300 },
      seconds: 14,
      marks: [
        { kind: "label", at: wgs(5.9525, 46.6745), text: "Passage des bois du nord" },
        { kind: "label", at: wgs(5.9625, 46.6735), text: "Passage de l’est" },
      ],
      trace: { points: convoyPath, label: "Chemin des convois, 425 m" },
    },
  },
  {
    id: "grenier",
    axis: "preparer",
    code: "P3",
    short: "Le grenier",
    place: "cornu",
    where: "Lieu du récit : le grenier de Cornu, et les points d’eau au bord de la Lemme",
    title: "Le grenier de Cornu et les points d’eau",
    lead: "Vercingétorix fait apporter tout le blé dans l’oppidum. Le grenier de Cornu contient 120 sacs de céréales, sans affectation décidée.",
    steps: [
      {
        text: "L’affaire « Réserves et bâtiments » réunit l’inventaire du grenier, l’état des réserves et le projet « Affectation du grenier de Cornu aux réserves ».",
      },
      {
        text: "Les abris accueillent 142 habitants ; deux points d’eau utilisés la nuit sont à protéger. Le bilan des abris est rangé dans l’affaire « Accueil des habitants ».",
      },
      {
        text: "Sur le terrain, un téléphone suffit : « Prendre une photo » range le cliché dans le dossier de l’affaire.",
      },
    ],
    feature: "Dans Hall : les pièces PDF d’une affaire et la photo prise sur le terrain depuis un téléphone.",
    captures: [
      desktop("preparer-grenier.png", "L’affaire « Réserves et bâtiments », ses éléments préparés et ses documents."),
      phone("preparer-photo.png", "Sur téléphone, le menu « Nouveau » propose de prendre une photo."),
    ],
    motion: {
      from: { at: spots.granary, azimuth: 120, elevation: 40, distance: 1600 },
      to: { at: wgs(5.9545, 46.6662), azimuth: 165, elevation: 34, distance: 2800 },
      seconds: 12,
      marks: [
        { kind: "point", at: spots.granary, tone: "light", label: "Grenier, 120 sacs" },
        { kind: "point", at: wgs(5.9468, 46.6651), tone: "blue", label: "Point d’eau" },
        { kind: "point", at: wgs(5.9452, 46.6668), tone: "blue" },
      ],
    },
  },
  {
    id: "ouvrages",
    axis: "preparer",
    code: "P4",
    short: "Les ouvrages",
    place: "plaine",
    where: "Lieu du récit : la plaine de Syam, au pied de l’éperon",
    title: "Les ouvrages romains observés",
    lead: "César fait creuser des fossés et élever des lignes de fortification avec des tours. Depuis l’oppidum, les veilleurs en suivent l’avancement nuit après nuit.",
    steps: [
      {
        text: "Les observations sont regroupées dans le tableur « Ouvrages romains observés » : date, poste d’observation, ouvrage et effectif estimé.",
      },
      {
        text: "Le tableur est importé dans l’affaire « Veille autour de l’oppidum », à côté du registre de la tour nord.",
      },
      { text: "Le conseil y lit, avant chaque séance, les ouvrages que les veilleurs ont vus dans la plaine." },
    ],
    feature: "Dans Hall : un tableur importé et rangé dans l’affaire.",
    captures: [desktop("preparer-ouvrages.png", "Le tableur « Ouvrages romains observés » ouvert dans Hall.")],
    motion: {
      from: { at: spots.tower, azimuth: 190, elevation: 22, distance: 2600 },
      to: { at: spots.plain, azimuth: 165, elevation: 26, distance: 4200 },
      seconds: 10,
      marks: [
        ...romanWorks.map((at): Mark => ({ kind: "work", at })),
        { kind: "label", at: wgs(5.9425, 46.6975), text: "Ouvrages romains vus par les veilleurs" },
      ],
    },
  },
  {
    id: "defense",
    axis: "preparer",
    code: "P5",
    short: "La défense",
    place: "rempart",
    where: "Lieu du récit : le rempart ouest de l’oppidum, au-dessus des gorges de la Lemme",
    title: "La défense du plateau : première et seconde ligne",
    lead: "Le bilan de la première ligne relève trois secteurs à consolider : la porte ouest, la courtine nord et les abords du grenier.",
    steps: [
      {
        text: "Le chiffrage établi avec les artisans, dans un tableur de l’affaire « Défense du plateau », s’élève à 282 quinaires d’argent séquanes.",
      },
      { text: "Le rapport de Vercassivellaunos l’Arverne accompagne le chiffrage." },
      {
        text: "La commission défense et soutien prépare le projet « Renforcement de la seconde ligne » pour la séance.",
        tone: "valid",
      },
    ],
    feature: "Dans Hall : une commission, un rapport, un tableur de chiffrage et un projet de délibération.",
    captures: [desktop("preparer-chiffrage.png", "Le tableur « Chiffrage de la seconde ligne » : 282 quinaires.")],
    motion: {
      from: { at: wgs(5.9425, 46.664), azimuth: 260, elevation: 12, distance: 2000 },
      to: { at: wgs(5.952, 46.6665), azimuth: 215, elevation: 34, distance: 3600 },
      seconds: 14,
      marks: [
        { kind: "point", at: spots.westRampart, tone: "light", label: "1 Porte ouest" },
        { kind: "point", at: spots.northCurtain, tone: "light", label: "2 Courtine nord" },
        { kind: "point", at: spots.granary, tone: "light", label: "3 Abords du grenier" },
      ],
    },
  },
  {
    id: "convocation",
    axis: "sieger",
    code: "S1",
    short: "La convocation",
    place: "maison",
    where: "Lieu du récit : la maison commune de l’oppidum, au cœur du plateau de Cornu",
    title: "La convocation de l’assemblée",
    lead: "Les projets préparés sont inscrits à l’ordre du jour de la séance.",
    steps: [
      { text: "L’ordre du jour est figé. Un seul PDF réunit la convocation et l’ordre du jour." },
      {
        text: "Un courriel est préparé pour chacun des quinze conseillers, avec le PDF joint ; il s’ouvre dans Outlook et l’envoi reste fait par le secrétariat.",
      },
    ],
    feature: "Dans Hall : l’ordre du jour figé, la convocation générée et un courriel par conseiller.",
    captures: [desktop("sieger-convocation.png", "La convocation générée et la liste des quinze destinataires.")],
    motion: {
      from: { at: spots.cornu, azimuth: 300, elevation: 30, distance: 2400 },
      to: { at: spots.hall, azimuth: 200, elevation: 40, distance: 2600 },
      seconds: 10,
      marks: [
        { kind: "point", at: spots.hall, tone: "blue", label: "Maison commune de l’oppidum" },
        ...scatter(spots.hall, 15).map((at): Mark => ({ kind: "point", at, tone: "light" })),
      ],
    },
  },
  {
    id: "appel",
    axis: "sieger",
    code: "S2",
    short: "L’appel",
    place: "maison",
    where: "Lieu du récit : la salle du conseil, dans la maison commune de l’oppidum",
    title: "L’appel des chefs et les pouvoirs",
    lead: "Le conseil siège sous la présidence de Vercingétorix l’Arverne ; Convictolitavis l’Éduen est secrétaire de séance.",
    steps: [
      {
        text: "À l’appel, chaque chef est marqué présent, représenté, excusé ou absent. Dumnacos l’Andécave donne pouvoir à Vercassivellaunos l’Arverne.",
      },
      { text: "Le quorum est constaté à l’ouverture : 12 présents pour 8 requis.", tone: "valid" },
      { text: "Sans quorum, la séance ne s’ouvre pas et le conseil est convoqué à nouveau." },
    ],
    feature: "Dans Hall : l’appel en mode séance, les pouvoirs et le quorum constaté.",
    captures: [desktop("sieger-appel.png", "Les présences en mode séance : pouvoir, excusé et absent.")],
    motion: {
      from: { at: spots.hall, azimuth: 200, elevation: 40, distance: 2400 },
      to: { at: spots.hall, azimuth: 180, elevation: 75, distance: 2600 },
      seconds: 10,
      marks: ring(spots.hall, 260, 15).map((at, index): Mark => ({ kind: "point", at, tone: rollCall[index] })),
    },
  },
  {
    id: "rationnement",
    axis: "sieger",
    code: "S3",
    short: "Le rationnement",
    place: "maison",
    where: "Lieu du récit : la salle du conseil, dans la maison commune de l’oppidum",
    title: "Le rationnement débattu et voté",
    lead: "Le blé est distribué par petites rations. La répartition entre habitants et combattants divise le conseil.",
    steps: [
      {
        text: "Commius l’Atrébate présente l’inventaire ; l’affectation du grenier de Cornu est adoptée par 10 voix pour, 2 contre et 1 abstention.",
        tone: "valid",
      },
      {
        text: "La répartition des réserves de céréales, contestée par Critognatos l’Arverne, est rejetée par 8 voix contre 4.",
      },
      { text: "Les débats sont consignés point par point dans le déroulé de la séance." },
    ],
    feature: "Dans Hall : les débats consignés, les scrutins publics et leur résultat.",
    captures: [desktop("sieger-deroule.png", "Le déroulé de la séance : scrutins adoptés et rejetés.")],
    motion: {
      from: { at: spots.hall, azimuth: 180, elevation: 75, distance: 2600 },
      to: { at: wgs(5.965, 46.667), azimuth: 120, elevation: 32, distance: 3200 },
      seconds: 12,
      marks: [
        ...ring(spots.hall, 260, 13).map((at, index): Mark => ({ kind: "point", at, tone: granaryVote[index] })),
        { kind: "point", at: spots.granary, tone: "light", label: "Grenier de Cornu" },
      ],
    },
  },
  {
    id: "motion",
    axis: "sieger",
    code: "S4",
    short: "La motion secrète",
    place: "belvedere",
    where: "Lieu du récit : le belvédère des Trois Vallées, au-dessus de Syam, face au nord",
    title: "La motion secrète et l’armée de secours",
    lead: "Le conseil arrête le message aux alliés ; l’assemblée des cités lève une armée de secours.",
    steps: [
      {
        text: "La motion de liaison avec les alliés est adoptée à bulletin secret, par 7 voix contre 4 ; seul le total des voix est connu.",
        tone: "valid",
      },
      { text: "Le procès-verbal consigne la décision sans le nom des porteurs du message." },
      {
        text: "Commius, Viridomaros, Éporédorix et Vercassivellaunos reçoivent le commandement de l’armée de secours, inscrit dans les représentations extérieures.",
      },
    ],
    feature: "Dans Hall : le scrutin à bulletin secret et les représentations extérieures du conseil.",
    captures: [
      desktop("sieger-scrutin-secret.png", "La séance du 3 octobre : la motion de liaison adoptée à bulletin secret."),
      desktop(
        "sieger-representations.png",
        "La représentation « Armée de secours des cités de Gaule » et ses quatre titulaires.",
      ),
    ],
    motion: {
      from: { at: spots.hall, azimuth: 180, elevation: 60, distance: 1500 },
      to: { at: wgs(5.938, 46.708), azimuth: 185, elevation: 14, distance: 3000 },
      seconds: 12,
      marks: [
        { kind: "point", at: spots.lookout, tone: "blue", label: "7 pour, 4 contre" },
        { kind: "label", at: wgs(5.926, 46.716), text: "Commius" },
        { kind: "label", at: wgs(5.934, 46.718), text: "Viridomaros" },
        { kind: "label", at: wgs(5.942, 46.717), text: "Éporédorix" },
        { kind: "label", at: wgs(5.95, 46.715), text: "Vercassivellaunos" },
      ],
    },
  },
  {
    id: "actes",
    axis: "sieger",
    code: "S5",
    short: "Les actes",
    place: "place",
    where: "Lieu du récit : la place de l’assemblée, dans l’oppidum, puis la plaine au pied de l’oppidum",
    title: "Les actes et le courrier au proconsul",
    lead: "Après la séance, Hall rédige les actes à partir des faits enregistrés : présences, pouvoirs et résultat de chaque vote.",
    steps: [
      {
        text: "Le procès-verbal est arrêté à la séance suivante ; chaque délibération adoptée a son document figé.",
        tone: "valid",
      },
      {
        text: "Le rendez-vous « Pourparlers avec Jules César » est inscrit au calendrier, dans la plaine au pied de l’oppidum.",
      },
      {
        text: "Le courrier au proconsul est rangé dans l’affaire « Correspondance avec le proconsul » ; le courriel d’invitation est préparé depuis le modèle du conseil, l’envoi reste manuel.",
      },
      { text: "Le gel d’un document ne vaut ni signature, ni publication, ni transmission au contrôle de légalité." },
    ],
    feature: "Dans Hall : procès-verbal, délibérations, calendrier et courriel préparé depuis un modèle.",
    captures: [
      desktop("sieger-proces-verbal.png", "Le procès-verbal arrêté de la séance du 1er septembre."),
      desktop("sieger-deliberation.png", "La délibération « Affectation du grenier de Cornu aux réserves »."),
      desktop("sieger-calendrier.png", "Le calendrier : séances et rendez-vous avec Jules César."),
      desktop("sieger-courrier.png", "L’affaire « Correspondance avec le proconsul », son courrier et le rendez-vous."),
      desktop("sieger-invitation.png", "Le rendez-vous dans la plaine et la création de l’invitation."),
    ],
    motion: {
      from: { at: spots.square, azimuth: 180, elevation: 84, distance: 1200 },
      to: { at: wgs(5.963, 46.6775), azimuth: 175, elevation: 26, distance: 5200 },
      seconds: 14,
      marks: [
        { kind: "point", at: spots.square, tone: "light", label: "Procès-verbal et délibération" },
        { kind: "point", at: spots.meeting, tone: "blue", label: "Rendez-vous avec César" },
      ],
    },
  },
];
