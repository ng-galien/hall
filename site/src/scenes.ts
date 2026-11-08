import { romanCampAccess, siegeSites as spots, wgs } from "./siege-layout";
import { near, storyRoutes } from "./story-routes";

export { wgs } from "./siege-layout";

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
  journeys?: Journey[];
}

export interface Journey {
  kind: "missive" | "grain" | "messenger" | "reinforcements";
  points: Spot[];
}

export interface ScenarioStep {
  text: string;
  tone?: StepTone;
}

/** Pastille posée sur une capture : position en pixels de l'image d'origine et courte légende. */
export interface Pin {
  x: number;
  y: number;
  text: string;
}

export interface Capture {
  file: string;
  caption: string;
  width: number;
  height: number;
  pins: Pin[];
}

export interface Place {
  id: PlaceId;
  name: string;
  at: Spot;
}

export interface Scene {
  id: SceneId;
  axis: AxisId;
  short: string;
  place: PlaceId | null;
  title: string;
  lead: string;
  steps: ScenarioStep[];
  captures: Capture[];
  sources?: { label: string; url: string }[];
  motion: Motion;
}

export interface Axis {
  id: AxisId;
  name: string;
}

type PinRow = [number, number, string];

const pinsOf = (rows: PinRow[]): Pin[] => rows.map(([x, y, text]) => ({ x, y, text }));
const desktop = (file: string, caption: string, pins: PinRow[]): Capture => ({
  file,
  caption,
  width: 1440,
  height: 900,
  pins: pinsOf(pins),
});
const phone = (file: string, caption: string, pins: PinRow[]): Capture => ({
  file,
  caption,
  width: 390,
  height: 844,
  pins: pinsOf(pins),
});

export const places: Place[] = [
  { id: "tour", name: "Tour de guet nord", at: spots.tower },
  { id: "cornu", name: "Grenier et chemins d’Alésia", at: spots.cornu },
  { id: "plaine", name: "Fortifications romaines", at: spots.plain },
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

export const scenes: Scene[] = [
  {
    id: "ouverture",
    axis: "ouverture",
    short: "Alésia",
    place: null,
    title: "Le siège d’Alésia",
    lead: "52 av. J.-C. César cherche à rejoindre la Province romaine. Sur la route de Genève, Alésia lui barre le passage : une ville fortifiée, un plateau entre deux rivières et l’armée de Vercingétorix.",
    steps: [
      {
        text: "Depuis le pays des Lingons, autour de Langres, les légions gagnent la Séquanie. Leur route traverse le Jura vers Genève et la Province, à l’écart du territoire des Éduens entrés dans la coalition gauloise.",
      },
      {
        text: "Près de Crotenay, Vercingétorix lance sa cavalerie contre la colonne romaine. Les cavaliers germains de César font échouer l’attaque. Les Gaulois se replient sur Alésia : le combat laisse place au siège.",
      },
      {
        text: "Sur l’éperon de Cornu, la ville des Mandubiens domine les gorges de la Lemme et de la Saine. Au pied de l’oppidum s’étend la plaine de Syam. Les hauteurs commandent les passages ; les accès deviennent l’enjeu du blocus.",
      },
      {
        text: "César entreprend le blocus. Une ligne de défenses enferme l’oppidum ; une seconde protège les Romains contre l’armée de secours. Entre les assiégés et les renforts gaulois, les légions doivent désormais tenir les deux fronts.",
      },
    ],
    sources: [
      {
        label: "André Berthier : La méthode du portrait-robot (1984)",
        url: "https://berthier.archeojurasites.org/sites/default/files/ajs_1984_annales-alesia_portrait-robot.pdf",
      },
      {
        label: "Archives Berthier : L’itinéraire vers Genève",
        url: "https://berthier.archeojurasites.org/content/itineraire-probable-de-cesar-travers-le-jura-pour-atteindre-geneve",
      },
      {
        label: "ArchéoJuraSites : La progression des légions et le combat de cavalerie",
        url: "https://www.archeojurasites.org/fichiers/articles-42-229.pdf",
      },
      {
        label: "Jacques Berger : Planches du siège (2004)",
        url: "https://berthier.archeojurasites.org/content/planches-de-louvrage-alesia-chaux-des-crotenay-pourquoi-de-jacques-berger-2004",
      },
    ],
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
    short: "La veille",
    place: "tour",
    title: "Les veilleurs de l’oppidum",
    lead: "Depuis les hauteurs, les veilleurs surveillent les feux, les mouvements et les travaux romains dans la plaine.",
    steps: [
      { text: "Les postes de guet observent les approches de l’oppidum et les accès aux vallées." },
      {
        text: "À chaque relève, les veilleurs transmettent ce qu’ils ont vu : les mouvements des légions, les ouvrages commencés et les passages encore libres.",
      },
      { text: "Les chefs confrontent ces observations pour préparer la défense." },
    ],
    captures: [
      desktop("preparer-veille.png", "Affaire « Veille autour de l’oppidum »", [
        [412, 203, "La commission défense et soutien porte l’affaire."],
        [290, 467, "La question préparée pour la prochaine séance."],
        [318, 553, "Le registre des observations de la tour nord."],
        [318, 613, "Le tableur des ouvrages romains observés."],
      ]),
    ],
    motion: {
      from: { at: spots.northCurtain, azimuth: 160, elevation: 30, distance: 2800 },
      to: { at: spots.tower, azimuth: 190, elevation: 45, distance: 3800 },
      seconds: 12,
      marks: [{ kind: "point", at: spots.tower, tone: "blue", label: "Relève des veilleurs" }],
      journeys: [{ kind: "messenger", points: storyRoutes.watchRelief }],
    },
  },
  {
    id: "carte",
    axis: "preparer",
    short: "Les passages",
    place: "cornu",
    title: "Les chemins des convois et des messagers",
    lead: "Les lignes romaines se resserrent autour d’Alésia. Les chemins du plateau servent au ravitaillement ; les passages encore ouverts permettent d’atteindre les alliés.",
    steps: [
      {
        text: "Les convois acheminent les réserves depuis le grenier. Les défenseurs gardent les accès et les points d’eau.",
      },
      { text: "Avant que l’encerclement soit achevé, Vercingétorix fait partir sa cavalerie de nuit." },
      { text: "Les cavaliers doivent rejoindre leurs cités et appeler les hommes en armes au secours d’Alésia." },
    ],
    captures: [
      desktop("preparer-carte.png", "Carte des accès et des convois", [
        [672, 158, "La carte est liée à l’affaire « Accès et convois »."],
        [1122, 452, "Le grenier d’Alésia, point dessiné sur la carte."],
        [1030, 503, "Le chemin des convois et sa longueur mesurée : 425 m."],
        [606, 786, "La légende : sacs du grenier, habitants des abris, point d’eau."],
      ]),
    ],
    motion: {
      from: { at: spots.cornu, azimuth: 180, elevation: 70, distance: 1800 },
      to: { at: spots.cornu, azimuth: 165, elevation: 60, distance: 2200 },
      seconds: 14,
      marks: [],
      journeys: [
        { kind: "grain", points: storyRoutes.suppliesToAssembly },
        { kind: "messenger", points: storyRoutes.messengersNorth },
      ],
    },
  },
  {
    id: "grenier",
    axis: "preparer",
    short: "Le grenier",
    place: "cornu",
    title: "Les réserves de l’oppidum",
    lead: "Vercingétorix fait rassembler tout le blé dans Alésia. La durée de la résistance dépend désormais des réserves et de l’arrivée des secours.",
    steps: [
      { text: "Les vivres sont mis en commun. Le grain est mesuré et distribué en petites quantités." },
      {
        text: "Les habitants et les combattants doivent tenir dans l’enceinte, tandis que les Romains ferment les accès.",
      },
      { text: "Protéger les réserves et les points d’eau devient aussi nécessaire que garder les remparts." },
    ],
    captures: [
      desktop("preparer-grenier.png", "Affaire et documents du grenier", [
        [285, 507, "Le projet « Affectation du grenier d’Alésia aux réserves »."],
        [1280, 507, "Inscrit à la séance du 1er septembre."],
        [345, 621, "L’inventaire du grenier."],
        [320, 711, "L’état des réserves d’Alésia."],
      ]),
    ],
    motion: {
      from: { at: spots.granary, azimuth: 120, elevation: 45, distance: 1800 },
      to: { at: spots.cornu, azimuth: 165, elevation: 48, distance: 2800 },
      seconds: 12,
      marks: [{ kind: "point", at: wgs(5.9468, 46.6651), tone: "blue", label: "Point d’eau" }],
      journeys: [{ kind: "grain", points: storyRoutes.suppliesToGranary }],
    },
  },
  {
    id: "ouvrages",
    axis: "preparer",
    short: "Les ouvrages",
    place: "plaine",
    title: "Les lignes romaines se referment",
    lead: "César fait creuser des fossés et élever des retranchements autour d’Alésia. Depuis l’oppidum, les Gaulois voient le blocus prendre forme.",
    steps: [
      { text: "Les légionnaires établissent des fossés, des palissades et des tours pour empêcher les sorties." },
      { text: "Une seconde ligne, tournée vers l’extérieur, doit arrêter l’armée de secours." },
      { text: "Entre les deux enceintes, les Romains se préparent à combattre sur deux fronts." },
    ],
    captures: [
      desktop("preparer-ouvrages.png", "Tableau des ouvrages romains observés", [
        [737, 213, "Le tableur est rattaché à l’affaire « Veille autour de l’oppidum »."],
        [541, 347, "Le poste d’où l’ouvrage a été vu."],
        [687, 347, "L’ouvrage observé : fossé, tour, camp, palissade."],
        [1006, 347, "L’effectif romain estimé."],
      ]),
      phone("preparer-photo.png", "Ajout d’une photo à une affaire", [
        [275, 83, "Le bouton « Nouveau » de l’espace de travail."],
        [168, 345, "« Prendre une photo » ouvre l’appareil du téléphone."],
        [68, 623, "Le cliché est rangé dans l’affaire choisie."],
      ]),
    ],
    motion: {
      from: { at: spots.tower, azimuth: 190, elevation: 22, distance: 2600 },
      to: { at: spots.plain, azimuth: 165, elevation: 26, distance: 4200 },
      seconds: 10,
      marks: [{ kind: "label", at: wgs(5.9425, 46.6975), text: "Ouvrages romains vus par les veilleurs" }],
    },
  },
  {
    id: "defense",
    axis: "preparer",
    short: "La défense",
    place: "rempart",
    title: "Défendre l’oppidum",
    lead: "Les défenseurs gardent les portes et les remparts. Face aux lignes romaines, ils cherchent les points où une sortie pourrait rompre le blocus.",
    steps: [
      { text: "Les chefs répartissent les combattants et surveillent les approches du plateau." },
      { text: "Les passages, les points d’eau et les réserves doivent rester protégés." },
      {
        text: "À l’arrivée des secours, une attaque depuis Alésia devra soutenir l’effort des Gaulois venus de l’extérieur.",
      },
    ],
    captures: [
      desktop("preparer-chiffrage.png", "Chiffrage de la défense du plateau", [
        [809, 213, "Le tableur est rattaché à l’affaire « Défense du plateau »."],
        [325, 377, "Les secteurs à consolider : porte ouest, courtine nord, abords du grenier."],
        [896, 353, "Le total de chaque poste, en quinaires."],
        [1026, 353, "La part livrée suit l’avancement des travaux."],
      ]),
    ],
    motion: {
      from: { at: wgs(5.9425, 46.664), azimuth: 260, elevation: 12, distance: 2000 },
      to: { at: wgs(5.952, 46.6665), azimuth: 215, elevation: 34, distance: 3600 },
      seconds: 14,
      marks: [
        { kind: "point", at: spots.westRampart, tone: "light", label: "Porte ouest" },
        { kind: "point", at: spots.northCurtain, tone: "light", label: "Courtine nord" },
        { kind: "point", at: spots.granary, tone: "light", label: "Abords du grenier" },
      ],
    },
  },
  {
    id: "convocation",
    axis: "sieger",
    short: "Le conseil",
    place: "maison",
    title: "Le conseil des chefs",
    lead: "À l’intérieur d’Alésia, les chefs se réunissent pour décider comment poursuivre la résistance.",
    steps: [
      { text: "Les nouvelles des postes de guet et l’état des réserves sont portés devant l’assemblée." },
      { text: "Il faut tenir les défenses, nourrir les assiégés et conserver un lien avec les cités alliées." },
      { text: "Chaque décision engage les combattants et les habitants enfermés dans l’oppidum." },
    ],
    captures: [
      desktop("sieger-convocation.png", "Convocation et ordre du jour", [
        [571, 288, "La convocation et l’ordre du jour figé sont réunis dans un seul document."],
        [945, 342, "La version courante de la convocation."],
        [412, 458, "Les quinze conseillers destinataires."],
        [826, 731, "Le courriel est préparé avec la convocation jointe ; l’envoi reste manuel."],
      ]),
    ],
    motion: {
      from: { at: spots.cornu, azimuth: 240, elevation: 45, distance: 2800 },
      to: { at: spots.hall, azimuth: 200, elevation: 65, distance: 3000 },
      seconds: 12,
      marks: [],
      journeys: [
        { kind: "messenger", points: storyRoutes.villageCouncil },
        { kind: "messenger", points: storyRoutes.watchCouncil },
        { kind: "messenger", points: storyRoutes.nearbyCouncil },
      ],
    },
  },
  {
    id: "appel",
    axis: "sieger",
    short: "L’assemblée",
    place: "maison",
    title: "Les chefs et les combattants",
    lead: "Les troupes réunies dans Alésia viennent de plusieurs peuples. Vercingétorix doit maintenir leur cohésion pendant le siège.",
    steps: [
      { text: "Les chefs rassemblent leurs hommes et organisent la garde des positions." },
      {
        text: "Les observations circulent entre les postes et l’assemblée : une attaque ou un passage découvert concerne toute la défense.",
      },
      { text: "Malgré les rivalités et la fatigue, la résistance exige un effort commun." },
    ],
    captures: [
      desktop("sieger-appel.png", "Présences, pouvoirs et quorum", [
        [1237, 28, "Le quorum constaté : 12 présents pour 8 requis."],
        [223, 243, "Dumnacos l’Andécave donne pouvoir à Vercassivellaunos l’Arverne."],
        [440, 386, "Absent et excusé sont distingués à l’appel."],
        [912, 187, "Vercingétorix, maire, préside la séance."],
      ]),
    ],
    motion: {
      from: { at: spots.hall, azimuth: 200, elevation: 45, distance: 2600 },
      to: { at: spots.square, azimuth: 180, elevation: 65, distance: 3200 },
      seconds: 12,
      marks: [{ kind: "point", at: spots.square, tone: "blue", label: "Rassemblement des combattants" }],
      journeys: [
        { kind: "reinforcements", points: storyRoutes.villageGathering },
        { kind: "reinforcements", points: storyRoutes.councilGathering },
      ],
    },
  },
  {
    id: "rationnement",
    axis: "sieger",
    short: "Le rationnement",
    place: "maison",
    title: "La faim dans l’oppidum",
    lead: "Les réserves diminuent et les secours tardent. La faim pèse sur les habitants comme sur les combattants.",
    steps: [
      { text: "Les rations sont réduites pour prolonger la résistance." },
      {
        text: "Les chefs débattent de la conduite à tenir. Critognatos refuse la reddition et défend la poursuite du combat.",
      },
      {
        text: "Les assiégés doivent choisir entre des issues de plus en plus difficiles, sans savoir quand les secours arriveront.",
      },
    ],
    captures: [
      desktop("sieger-deroule.png", "Débats et résultats des votes", [
        [326, 300, "Les présences : 12 présents, 1 représenté, 1 excusé, 1 absent."],
        [362, 505, "Le grenier affecté aux réserves : 10 pour, 2 contre, 1 abstention."],
        [362, 653, "La répartition des céréales rejetée : 4 pour, 8 contre."],
        [534, 190, "Le quorum de la séance : 12 présents pour 8 requis."],
      ]),
    ],
    motion: {
      from: { at: spots.granary, azimuth: 180, elevation: 60, distance: 2600 },
      to: { at: spots.square, azimuth: 155, elevation: 50, distance: 3000 },
      seconds: 12,
      marks: [{ kind: "point", at: spots.square, tone: "blue", label: "Distribution des réserves" }],
      journeys: [{ kind: "grain", points: storyRoutes.suppliesToAssembly }],
    },
  },
  {
    id: "motion",
    axis: "sieger",
    short: "Les messagers",
    place: "belvedere",
    title: "L’appel aux cités de Gaule",
    lead: "Vercingétorix envoie des messagers aux cités de Gaule pour demander des renforts.",
    steps: [
      { text: "À la faveur de la nuit, les messagers quittent l’oppidum par les passages encore libres." },
      {
        text: "Ils portent l’appel d’Alésia à leurs peuples : réunir des hommes et des vivres pour venir rompre le siège.",
      },
      { text: "Dans l’oppidum, les défenseurs poursuivent la résistance en attendant les secours." },
    ],
    captures: [
      desktop("sieger-scrutin-secret.png", "Vote à bulletin secret", [
        [331, 721, "La motion de liaison avec les alliés."],
        [362, 801, "Scrutin secret : seul le total des voix est connu, 7 pour et 4 contre."],
        [362, 505, "Le procès-verbal de la séance précédente, arrêté."],
      ]),
      desktop("sieger-representations.png", "Représentants auprès de l’armée de secours", [
        [289, 298, "L’organisme : l’armée de secours des cités de Gaule."],
        [667, 295, "L’objet de la représentation."],
        [300, 454, "Les quatre titulaires et leur date de désignation."],
      ]),
    ],
    motion: {
      from: { at: spots.cornu, azimuth: 180, elevation: 55, distance: 2400 },
      to: { at: near(spots.cornu, 650, 0), azimuth: 180, elevation: 55, distance: 3800 },
      seconds: 16,
      marks: [
        { kind: "label", at: near(spots.cornu, 1200, 600), text: "Vers les cités alliées" },
        { kind: "label", at: near(spots.cornu, 1000, -550), text: "Vers les cités alliées" },
      ],
      journeys: [
        { kind: "messenger", points: storyRoutes.messengersNorth },
        { kind: "messenger", points: storyRoutes.messengersSouth },
      ],
    },
  },
  {
    id: "actes",
    axis: "sieger",
    short: "La missive",
    place: "place",
    title: "La missive au proconsul",
    lead: "Une missive quitte Alésia en direction du camp de César. Le message doit franchir la distance qui sépare les assiégés du proconsul.",
    steps: [
      { text: "Le messager part de l’oppidum et descend vers la plaine." },
      { text: "Il franchit la porte du camp romain et suit l’allée jusqu’à la tente de commandement." },
      { text: "Le message est remis au proconsul. Dans Alésia, les chefs attendent sa réponse." },
    ],
    captures: [
      desktop("sieger-courrier.png", "Affaire « Correspondance avec le proconsul »", [
        [288, 250, "La trêve demandée au proconsul, décrite dans l’affaire."],
        [345, 485, "Le rendez-vous rattaché à l’affaire."],
        [330, 525, "Le courrier au proconsul."],
      ]),
      desktop("sieger-invitation.png", "Rendez-vous et invitation", [
        [757, 214, "Rattaché à l’affaire « Correspondance avec le proconsul »."],
        [287, 457, "Le lieu : la plaine au pied de l’oppidum."],
        [276, 534, "Les participants : Vercingétorix et Jules César."],
        [276, 813, "Le courriel d’invitation est préparé depuis le modèle du conseil."],
      ]),
      desktop("sieger-proces-verbal.png", "Procès-verbal de la séance", [
        [1239, 83, "Le procès-verbal est arrêté et son document généré."],
        [266, 436, "Le quorum atteint à l’ouverture."],
        [266, 614, "Pouvoirs, excusés et absents repris de l’appel."],
        [314, 789, "Le résultat du vote de chaque point."],
      ]),
      desktop("sieger-deliberation.png", "Délibération sur l’affectation du grenier", [
        [441, 182, "La délibération adoptée le 1er septembre."],
        [300, 385, "Le texte rédigé : visas, considérants, décision."],
        [407, 731, "« Figer le document » produit sa version définitive."],
        [266, 777, "Le gel ne vaut ni signature, ni publication, ni transmission."],
      ]),
      desktop("sieger-calendrier.png", "Calendrier des séances et rendez-vous", [
        [1095, 194, "Les séances du conseil."],
        [1263, 681, "Le rendez-vous « Pourparlers avec Jules César »."],
        [766, 809, "La réunion d’une commission."],
        [1260, 87, "Un nouveau rendez-vous s’ajoute ici."],
      ]),
    ],
    motion: {
      from: { at: spots.cornu, azimuth: 180, elevation: 55, distance: 3200 },
      to: { at: spots.tower, azimuth: 175, elevation: 50, distance: 5600 },
      seconds: 16,
      marks: [
        {
          kind: "point",
          at: near(spots.plain, romanCampAccess.delivery.x, romanCampAccess.delivery.y),
          tone: "blue",
          label: "Le camp du proconsul",
        },
      ],
      journeys: [{ kind: "missive", points: storyRoutes.missiveToCamp }],
    },
  },
];
