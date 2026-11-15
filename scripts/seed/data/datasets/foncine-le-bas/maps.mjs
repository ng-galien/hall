import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { demonstrationNotice } from "./names.mjs";

const territoryFiles = new URL("./files/territory/", import.meta.url);
export const territory = JSON.parse(readFileSync(new URL("territory.json", territoryFiles), "utf8"));

const colors = {
  blue: "#1d4ed8",
  lightBlue: "#60a5fa",
  navy: "#1e3a8a",
  slate: "#475569",
  grey: "#94a3b8",
  green: "#15803d",
  darkGreen: "#14532d",
  red: "#b91c1c",
};
const plan = [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }];
const planAndCadastre = [
  { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 },
  { id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS", visible: true, opacity: 0.7 },
];
const photo = [
  { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: true, opacity: 1 },
  { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: false, opacity: 1 },
];

const marker = (label, coordinates, color = colors.navy, size = "medium") => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "marker", visible: true, label, style: { color, size } },
  geometry: { type: "Point", coordinates },
});
const line = (label, coordinates, color, width = 4, arrows = "none") => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "line", visible: true, label, style: { color, width, arrows } },
  geometry: { type: "LineString", coordinates },
});
const area = (label, ring, fillColor, strokeColor, fillOpacity = 0.3) => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "area", visible: true, label, style: { fillColor, strokeColor, strokeWidth: 2, fillOpacity } },
  geometry: { type: "Polygon", coordinates: [ring] },
});
const measure = (label, coordinates, length) => ({
  type: "Feature",
  id: randomUUID(),
  properties: { kind: "lengthMeasurement", label, length },
  geometry: { type: "LineString", coordinates },
});
const centre = (coordinates) => [
  coordinates.reduce((sum, [lon]) => sum + lon, 0) / coordinates.length,
  coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length,
];
const offset = ([lon, lat], east, north) => [lon + east / 76_500, lat + north / 111_320];
const parcelLabel = (id) => `${id.slice(8, 10).replace(/^0/, "")} ${Number(id.slice(10))}`;

/** The drawn maps of the dataset; `notes` names the drawings that receive a note with a photo. */
export function mapDefinitions() {
  const { montNoir, douanets, lighting, ruralPaths, bridge, forest, champDeMars } = territory;
  const road = line("Voie communale du Mont Noir", montNoir.upper, colors.blue, 6);
  const slope = line("Partie en pente, enrobé neuf", montNoir.slope, colors.red, 7);
  const photos = {
    rut: marker("Ornière, côté est", montNoir.photos.rut, colors.red),
    ditch: marker("Fossé bouché", montNoir.photos.ditch, colors.red),
    verge: marker("Accotement affaissé", montNoir.photos.verge, colors.red),
    culvert: marker("Buse à remplacer, Ø 400 mm", montNoir.culvert, colors.navy, "large"),
  };
  const montNoirMap = {
    key: "montNoir",
    name: "Carte du chemin communal",
    folder: "",
    tags: ["voirie", "carte"],
    view: { kind: "center", center: centre(montNoir.line), zoom: 17 },
    layers: planAndCadastre,
    legend: [
      { color: colors.blue, label: "Voie communale du Mont Noir, 564 m : reprofilage, ornières, fossé, accotement" },
      { color: colors.red, label: "Partie en pente, 160 m : enrobé 0/10, 480 m² ; points des photos" },
      { color: colors.navy, label: "Buse Ø 400 mm à remplacer ; circulation par tronçons pendant les travaux" },
      { color: colors.slate, label: demonstrationNotice },
    ],
    features: [
      road,
      slope,
      measure("Longueur de la voie", montNoir.line, montNoir.length),
      ...Object.values(photos),
      line("Tronçon 1 : circulation alternée", montNoir.firstLeg, colors.navy, 3, "forward"),
      line("Tronçon 2 : circulation alternée", montNoir.secondLeg, colors.navy, 3, "backward"),
    ],
    notes: [
      {
        feature: slope,
        image: null,
        text: `## Partie en pente de la voie du Mont Noir\n\n160 mètres en pente, enrobé à chaud 0/10 sur 480 m². La voie communale mesure 564 mètres ; le programme comprend aussi le reprofilage, les ornières, le curage du fossé, la reprise d’un accotement et le remplacement d’une buse.\n\n*${demonstrationNotice}*`,
      },
      { feature: photos.rut, image: 1, text: "Ornière longue, côté est, remplie d’eau après la pluie." },
      { feature: photos.ditch, image: 2, text: "Fossé comblé de terre et de feuilles ; l’eau passe sur la chaussée." },
      { feature: photos.verge, image: 3, text: "Bord de chaussée affaissé sur quelques mètres dans le virage." },
      {
        feature: photos.culvert,
        image: 4,
        text: "Tête de buse fissurée ; remplacement par une buse de 400 mm sur 12 mètres.",
      },
    ],
  };

  const mainLines = lighting.streets.filter((street) => ["RTE NATIONALE", "RTE DE CHAMPAGNOLE"].includes(street.name));
  const allLit = lighting.points;
  const lightingMap = {
    key: "lighting",
    name: "Carte de l’éclairage public",
    folder: "Éclairage public",
    tags: ["éclairage", "carte"],
    view: { kind: "center", center: [6.0312, 46.6378], zoom: 17 },
    layers: plan,
    legend: [
      { color: colors.navy, label: "Traversée principale : éclairée toute la nuit" },
      { color: colors.lightBlue, label: "Rues éteintes de 23 h 00 à 5 h 00 selon le projet d’arrêté" },
      { color: colors.slate, label: `48 points lumineux, LED après rénovation ; ${demonstrationNotice}` },
    ],
    features: [
      ...mainLines.flatMap((street) =>
        street.lines.map((coordinates) => line("Traversée principale", coordinates, colors.navy, 3)),
      ),
      ...allLit.map((point, index) =>
        marker(
          `EP ${String(index + 1).padStart(2, "0")}`,
          point.position,
          point.main ? colors.navy : colors.lightBlue,
          "small",
        ),
      ),
    ],
    notes: [],
  };

  const cut = new Set(["392270000B0951", "392270000B0954"]);
  const forestMap = {
    key: "forest",
    name: "Carte de la forêt communale",
    folder: "Forêt",
    tags: ["forêt", "carte"],
    view: { kind: "center", center: [6.0115, 46.6435], zoom: 16 },
    layers: planAndCadastre,
    legend: [
      { color: colors.darkGreen, label: "Forêt communale entre la Senge et le Parcours nature, au sud de la D127" },
      { color: colors.green, label: "Coupes de l’exercice proposées par l’ONF" },
      { color: colors.slate, label: demonstrationNotice },
    ],
    features: forest.map((parcel) =>
      area(
        `Parcelle ${parcelLabel(parcel.id)}${cut.has(parcel.id) ? ", coupe de l’exercice" : ""}`,
        parcel.rings[0],
        cut.has(parcel.id) ? colors.green : colors.darkGreen,
        colors.darkGreen,
        cut.has(parcel.id) ? 0.45 : 0.25,
      ),
    ),
    notes: [],
  };
  forestMap.notes = [
    {
      feature: forestMap.features[1],
      image: 9,
      text: `## Coupe de l’exercice\n\nAmélioration feuillus ; destination proposée : affouage. Martelage avec l’ONF.\n\n*${demonstrationNotice}*`,
    },
  ];

  const ruralFeatures = ruralPaths.flatMap((path) =>
    path.lines.map((coordinates) => line(path.label, coordinates, colors.green, 4)),
  );
  const gravel = ruralPaths
    .filter((path) => path.lines.length > 0)
    .slice(0, 3)
    .map((path) => {
      const longest = path.lines.reduce((best, current) => (current.length > best.length ? current : best));
      return marker(`Passage à empierrer, ${path.label}`, longest[Math.floor(longest.length / 2)], colors.slate);
    });
  const bridgeMarker = marker(
    "Pont du chemin des Serrettes sur la Sainette : garde-corps",
    bridge.position,
    colors.navy,
    "large",
  );
  const ruralMap = {
    key: "ruralPaths",
    name: "Carte des chemins ruraux",
    folder: "Voirie/Chemins ruraux",
    tags: ["chemins", "carte"],
    view: { kind: "center", center: [6.036, 46.632], zoom: 15 },
    layers: plan,
    legend: [
      { color: colors.green, label: "Chemins des pâturages au programme d’entretien" },
      { color: colors.slate, label: "Passages ravinés à empierrer" },
      { color: colors.navy, label: `Pont communal, garde-corps à repeindre ; ${demonstrationNotice}` },
    ],
    features: [...ruralFeatures, ...gravel, bridgeMarker],
    notes: [
      { feature: bridgeMarker, image: 11, text: "Garde-corps écaillé, deux montants descellés : entretien courant." },
    ],
  };

  const parking = area(
    "Parking de la Tram’Jurassienne, parking communal",
    douanets.parking,
    colors.slate,
    colors.navy,
    0.3,
  );
  const viaduct = line("Viaduc des Douanets sur la Saine", douanets.viaduct, colors.navy, 6);
  const walkMap = {
    key: "walk",
    name: "Carte de la promenade",
    folder: "Promenade",
    tags: ["promenade", "carte"],
    view: { kind: "center", center: [6.0297, 46.6398], zoom: 17 },
    layers: plan,
    legend: [
      { color: colors.slate, label: "Parking de la Tram’Jurassienne : table, banc et panneau d’information" },
      { color: colors.navy, label: "Chemin des Douanets et viaduc des Douanets sur la Saine" },
      { color: colors.green, label: "Ancienne voie du tram, départ de la promenade" },
      { color: colors.grey, label: demonstrationNotice },
    ],
    features: [
      parking,
      line("Chemin des Douanets", douanets.chemin, colors.navy, 3),
      viaduct,
      line("Ancienne voie du tram, vers Les Planches-en-Montagne", douanets.tram, colors.green, 4, "forward"),
      marker("Table de pique-nique", [6.02995, 46.63902], colors.green),
      marker("Banc", [6.02985, 46.63889], colors.green, "small"),
      marker("Panneau d’information", [6.03003, 46.63914], colors.navy),
    ],
    notes: [
      {
        feature: parking,
        image: 12,
        text: `## Départ de la promenade\n\nParking communal au bout du chemin des Douanets. La promenade franchit la Saine par le viaduc des Douanets puis entre en forêt.\n\n*${demonstrationNotice}*`,
      },
      { feature: viaduct, image: 13, text: "Ouvrage de l’ancien tram ; repère et passage de la promenade." },
    ],
  };

  const field = champDeMars.ring;
  const fieldCentre = centre(field.slice(0, -1));
  const festivalMap = {
    key: "festivals",
    name: "Plan du vide-grenier au Champ de Mars",
    folder: "Associations et fêtes",
    tags: ["fêtes", "carte"],
    view: { kind: "center", center: fieldCentre, zoom: 19 },
    layers: photo,
    legend: [
      { color: colors.blue, label: "Emplacements des exposants et marché aux fleurs" },
      { color: colors.navy, label: "Buvette et entrée" },
      { color: colors.red, label: "Barrières de prêt communal" },
      { color: colors.slate, label: `Stationnement : Parking de la Tram’Jurassienne ; ${demonstrationNotice}` },
    ],
    features: [
      area("Champ de Mars : exposants et marché aux fleurs", field, colors.blue, colors.navy, 0.25),
      marker("Buvette", offset(fieldCentre, -8, 6), colors.navy),
      marker("Entrée", offset(fieldCentre, 10, -22), colors.navy, "small"),
      line("Barrières", [offset(fieldCentre, 4, -24), offset(fieldCentre, 16, -20)], colors.red, 3),
      area("Stationnement", douanets.parking, colors.slate, colors.slate, 0.2),
    ],
    notes: [],
  };
  return [montNoirMap, lightingMap, forestMap, ruralMap, walkMap, festivalMap];
}

export const riversideParcels = () => readFileSync(new URL("parcelles-riveraines.geojson", territoryFiles));
export const communalParcelLayer = () => readFileSync(new URL("parcelles-communales.geojson", territoryFiles));
export const communalParcels = () => readFileSync(new URL("parcelles-communales.txt", territoryFiles), "utf8");
