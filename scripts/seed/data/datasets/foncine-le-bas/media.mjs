import { readdirSync } from "node:fs";

/**
 * Files of the Foncine-le-Bas dataset, read from `files/` by the loader.
 * The 21 scene images are drawn by an illustrator. `files/images/` holds one file per scene, named
 * `NN-title.png` or `NN-title.jpg` where NN is the scene number; until a drawing is delivered, the file is a
 * plain stand-in carrying the scene title. A drawing replaces its stand-in file for file, whatever its short title.
 */
export const folders = {
  root: "",
  council: "Conseil",
  roads: "Voirie",
  montNoir: "Voirie/Réfection du chemin communal du Mont Noir",
  ruralPaths: "Voirie/Chemins ruraux",
  lighting: "Éclairage public",
  finances: "Finances",
  forest: "Forêt",
  walk: "Promenade",
  festivals: "Associations et fêtes",
  buildings: "Bâtiments",
  staff: "Personnel",
  intercommunality: "Intercommunalité",
  digital: "Numérique",
  mail: "Courrier",
  guide: "Guide",
  legal: "Guide/Références juridiques",
};

/** Scene images: number, file, title in Hall, business key. */
export const illustrations = [
  [1, "01-orniere-cote-est.jpg", "Ornière, côté est", "montNoir"],
  [2, "02-fosse-bouche.jpg", "Fossé bouché", "montNoir"],
  [3, "03-accotement-affaisse.jpg", "Accotement affaissé", "montNoir"],
  [4, "04-buse-a-remplacer.jpg", "Buse à remplacer", "montNoir"],
  [5, "05-vue-du-chemin-du-mont-noir.jpg", "Vue du chemin du Mont Noir", "montNoir"],
  [6, "06-marquage-des-travaux.jpg", "Marquage des travaux", "montNoir"],
  [7, "07-lanterne-de-rue.jpg", "Lanterne de rue", "lighting"],
  [8, "08-rue-du-village-la-nuit.jpg", "Rue du village la nuit", "lighting"],
  [9, "09-lot-d-affouage.jpg", "Lot d’affouage", "forest"],
  [10, "10-chemin-rural-entre-les-paturages.jpg", "Chemin rural entre les pâturages", "ruralPaths"],
  [11, "11-garde-corps-du-pont.jpg", "Garde-corps du pont", "ruralPaths"],
  [12, "12-parking-de-la-tram-jurassienne.jpg", "Parking de la Tram’Jurassienne", "walk"],
  [13, "13-viaduc-des-douanets.jpg", "Viaduc des Douanets", "walk"],
  [14, "14-maquette-du-panneau-d-information.jpg", "Maquette du panneau d’information", "walk"],
  [15, "15-fete-patronale.jpg", "Fête patronale", "festivals"],
  [16, "16-vide-grenier-et-marche-aux-fleurs.jpg", "Vide-grenier et marché aux fleurs", "festivals"],
  [17, "17-monument-aux-morts-fleuri.jpg", "Monument aux morts fleuri", "festivals"],
  [18, "18-massif-fleuri.jpg", "Massif fleuri", "festivals"],
  [19, "19-salle-communale.jpg", "Salle communale", "buildings"],
  [20, "20-salle-du-conseil.jpg", "Salle du conseil", "council"],
  [21, "21-mairie.jpg", "Mairie", "council"],
].map(([number, file, title, business]) => ({ number, standIn: file, title, business }));

export const imagesDirectory = new URL("./files/images/", import.meta.url);
/** The file of scene `number`: a delivered drawing (PNG) before a stand-in (JPEG). */
export function imageFile(number) {
  const prefix = `${String(number).padStart(2, "0")}-`;
  const candidates = readdirSync(imagesDirectory)
    .filter((name) => name.startsWith(prefix) && /\.(png|jpe?g)$/.test(name))
    .sort((left, right) => Number(right.endsWith(".png")) - Number(left.endsWith(".png")));
  if (candidates.length === 0) throw new Error(`Image ${number} absente de ${imagesDirectory.pathname}`);
  return new URL(candidates[0], imagesDirectory);
}

/** Generated documents: file, title in Hall, folder, business key or null, tags. */
export const documents = [
  ["devis-terrassement-leclerc-varenne.pdf", "Devis · Terrassement", folders.montNoir, "montNoir", ["devis", "voirie"]],
  ["devis-busage-leclerc-varenne.pdf", "Devis · Busage", folders.montNoir, "montNoir", ["devis", "voirie"]],
  ["devis-enrobe-bertrand.pdf", "Devis · Enrobé", folders.montNoir, "montNoir", ["devis", "voirie"]],
  ["devis-enrobe-moreau.pdf", "Devis · Enrobé, Enrobés Moreau", folders.montNoir, "montNoir", ["devis", "voirie"]],
  ["plan-situation-chemin-mont-noir.pdf", "Plan de situation", folders.montNoir, "montNoir", ["voirie", "carte"]],
  ["courrier-riverains-mont-noir.pdf", "Courrier des riverains", folders.root, "montNoir", ["courrier", "voirie"]],
  [
    "accuse-reception-detr.pdf",
    "Accusé de réception du dossier de DETR",
    folders.mail,
    "montNoir",
    ["courrier", "budget"],
  ],
  ["chiffrage-eclairage-sidec.pdf", "Chiffrage du SIDEC", folders.lighting, "lighting", ["éclairage", "devis"]],
  ["etat-assiette-onf.pdf", "Proposition d’état d’assiette", folders.forest, "forest", ["forêt"]],
  ["devis-mobilier-promenade.pdf", "Devis du mobilier", folders.walk, "walk", ["promenade", "devis"]],
  ["devis-menuiseries-salle.pdf", "Devis des menuiseries", folders.buildings, "buildings", ["bâtiments", "devis"]],
  [
    "rapport-activite-communaute-de-communes.pdf",
    "Rapport d’activité annuel de la communauté de communes",
    folders.intercommunality,
    "intercommunality",
    ["courrier"],
  ],
  ["proces-verbal-installation.pdf", "Procès-verbal d’installation du conseil", folders.council, null, ["droit"]],
  ["guide-prise-en-main-hall.pdf", "Guide de prise en main, version imprimée", folders.digital, "digital", ["conseil"]],
  [
    "convention-champ-de-mars.docx",
    "Convention d’occupation du Champ de Mars",
    folders.festivals,
    "festivals",
    ["associations", "fêtes"],
  ],
].map(([file, title, folder, business, tags]) => ({ file, title, folder, business, tags }));

/** Written proxies of the four meetings: giver, holder and file. */
export const proxies = [
  { meeting: 1, giver: "fontaine", holder: "robert", file: "pouvoir-fontaine-robert.pdf" },
  { meeting: 2, giver: "lefort", holder: "garnier", file: "pouvoir-lefort-garnier.pdf" },
  { meeting: 3, giver: "roussel", holder: "carre", file: "pouvoir-roussel-carre.pdf" },
  { meeting: 4, giver: "mathieu", holder: "renaud", file: "pouvoir-mathieu-renaud.pdf" },
];

/** Day of the dated documents, counted from the load day as in the dataset calendar. */
export const documentDays = {
  residentLetter: -100,
  firstMeeting: -91,
  detrAcknowledgement: -60,
  secondMeeting: -56,
  quotes: -70,
  thirdMeeting: -28,
  lightingCosting: -21,
  currentMeeting: 0,
};
