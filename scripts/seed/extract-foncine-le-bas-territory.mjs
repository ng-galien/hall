/**
 * Extracts the real geography used by the Foncine-le-Bas demonstration dataset from public data:
 * IGN BD TOPO (Géoplateforme WFS), the Etalab cadastre of commune 39227 and the DGFiP file of the parcels
 * of legal persons (data.economie.gouv.fr, « Fichier des parcelles », department 39 CSV, given as argument).
 *
 *   node scripts/seed/extract-foncine-le-bas-territory.mjs <PM_25_NB_390.csv>
 *
 * Writes territory.json, parcelles-riveraines.geojson, parcelles-communales.geojson and parcelles-communales.txt
 * in the dataset files.
 * No owner name is written; only the parcels of the commune itself are listed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const output = new URL("./data/datasets/foncine-le-bas/files/territory/", import.meta.url);
const insee = "39227";
const bbox = "46.61,5.99,46.655,6.07,urn:ogc:def:crs:EPSG::4326";

async function wfs(type) {
  const url = `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:${type}&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&BBOX=${bbox}&COUNT=10000`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${type}: ${response.status}`);
  return (await response.json()).features;
}
async function cadastre() {
  const response = await fetch(
    `https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/${insee}/geojson/parcelles`,
  );
  if (!response.ok) throw new Error(`cadastre: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return JSON.parse((bytes[0] === 0x1f ? gunzipSync(bytes) : bytes).toString("utf8")).features;
}

const round = ([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
const metres = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
};
const length = (line) => line.slice(1).reduce((sum, point, index) => sum + metres(line[index], point), 0);
/** The part of a line between two distances from its start, in metres. */
function slice(line, from, to) {
  const result = [];
  let travelled = 0;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    const segment = metres(start, end);
    const at = (distance) => {
      const ratio = (distance - travelled) / segment;
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    };
    if (travelled + segment >= from && travelled <= to) {
      if (result.length === 0) result.push(from > travelled ? at(from) : start);
      result.push(to < travelled + segment ? at(to) : end);
    }
    travelled += segment;
    if (travelled > to) break;
  }
  return result.map(round);
}
const pointAt = (line, distance) => slice(line, distance, distance)[0];
const xy = (coordinates) => coordinates.map(([lon, lat]) => [lon, lat]);
const name = (feature) => feature.properties.nom_collaboratif_gauche ?? feature.properties.nom_voie_ban_gauche ?? null;
/** Joins segments that share end points into one ordered line. */
function chain(segments) {
  const pieces = segments.map((segment) => xy(segment.geometry.coordinates));
  let line = pieces.shift();
  while (pieces.length > 0) {
    const index = pieces.findIndex(
      (piece) =>
        metres(piece[0], line.at(-1)) < 1 ||
        metres(piece.at(-1), line.at(-1)) < 1 ||
        metres(piece[0], line[0]) < 1 ||
        metres(piece.at(-1), line[0]) < 1,
    );
    if (index < 0) break;
    const [piece] = pieces.splice(index, 1);
    if (metres(piece[0], line.at(-1)) < 1) line = [...line, ...piece.slice(1)];
    else if (metres(piece.at(-1), line.at(-1)) < 1) line = [...line, ...piece.reverse().slice(1)];
    else if (metres(piece.at(-1), line[0]) < 1) line = [...piece, ...line.slice(1)];
    else line = [...piece.reverse(), ...line.slice(1)];
  }
  return line;
}
function distanceToLine(point, line) {
  let best = Infinity;
  for (let index = 1; index < line.length; index += 1) {
    const [a, b] = [line[index - 1], line[index]];
    for (let step = 0; step <= 10; step += 1) {
      const t = step / 10;
      best = Math.min(best, metres(point, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
  }
  return best;
}
const rings = (geometry) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Usage: node scripts/seed/extract-foncine-le-bas-territory.mjs <PM_25_NB_390.csv>");
const communal = new Set();
for (const row of readFileSync(csvPath, "utf8").split(/\r?\n/)) {
  const cells = row.split(";");
  if (cells[0] !== "39" || cells[2] !== "227" || cells[23]?.trim() !== "COMMUNE DE FONCINE LE BAS") continue;
  const prefix = (cells[4].trim() || "000").padStart(3, "0");
  communal.add(`${insee}${prefix}${cells[5].trim().padStart(2, "0")}${cells[6].trim().padStart(4, "0")}`);
}

const [roads, structures, parcels] = await Promise.all([
  wfs("troncon_de_route"),
  wfs("construction_lineaire"),
  cadastre(),
]);
const parcel = (id) => {
  const found = parcels.find((feature) => feature.id === id);
  if (!found) throw new Error(`Parcel ${id} missing from the cadastre`);
  if (!communal.has(id)) throw new Error(`Parcel ${id} is not listed as a parcel of the commune`);
  return found;
};
const road = (id) => roads.find((feature) => feature.properties.cleabs === id);

// Voie communale of the Mont Noir: the BD TOPO track named « LE MONT NOIR », from its lower end, extended
// along the same track to the 564 metres of the public presentation.
const montNoirTrack = chain([road("TRONROUT0000000008452904"), road("TRONROUT0000000008452907")]);
const montNoirBase = montNoirTrack[0][1] < montNoirTrack.at(-1)[1] ? montNoirTrack : [...montNoirTrack].reverse();
const montNoir = slice(montNoirBase, 0, 564);
const elevation = new Map(
  [road("TRONROUT0000000008452904")]
    .flatMap((feature) => feature.geometry.coordinates)
    .map(([lon, lat, z]) => [`${round([lon, lat])}`, z]),
);
let slope = { from: 0, drop: -Infinity };
for (let from = 0; from + 160 <= 564; from += 4) {
  const points = slice(montNoir, from, from + 160);
  const heights = points.map((point) => elevation.get(`${point}`)).filter((value) => value !== undefined);
  const drop = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0;
  if (drop > slope.drop) slope = { from, drop };
}

const riverside = parcels
  .filter((feature) =>
    rings(feature.geometry).some((polygon) => polygon[0].some((point) => distanceToLine(point, montNoir) < 30)),
  )
  .map((feature) => ({
    type: "Feature",
    id: feature.id,
    properties: {
      idu: feature.id,
      section: feature.properties.section,
      numero: feature.properties.numero,
      contenance: feature.properties.contenance,
    },
    geometry: feature.geometry,
  }));

const viaduct = structures.find((feature) => feature.properties.toponyme === "Viaduc des Douanets");
const douanets = chain(
  ["TRONROUT0000000008449663", "TRONROUT0000000008449636", "TRONROUT0000000008449649", "TRONROUT0000000008449642"].map(
    road,
  ),
);
const tram = chain(
  ["TRONROUT0000000008449627", "TRONROUT0000000295011349", "TRONROUT0000000358033710", "TRONROUT0000000008449671"].map(
    road,
  ),
);
// The parking is the part of communal parcel B 1042 north of the annex building, south of the viaduct.
const parkingParcel = parcel("392270000B1042");
const parking = rings(parkingParcel.geometry)[0][0]
  .map(([lon, lat]) => [lon, Math.max(lat, 46.63872)])
  .filter((point, index, all) => index === 0 || `${point}` !== `${all[index - 1]}`)
  .map(round);

const villageStreets = [
  "RTE NATIONALE",
  "CHE DE L'EGLISE",
  "CHE DU MOULIN",
  "CHE DE LA TANNERIE",
  "CHE DES BROUGEONS",
  "LOT LES ROCQUERIES",
  "PL DU CHALET",
  "RTE DE CHAMPAGNOLE",
];
const inVillage = ([lon, lat]) => lon > 6.0265 && lon < 6.036 && lat > 46.6352 && lat < 46.64;
const streets = villageStreets
  .map((street) => {
    const segments = roads.filter(
      (feature) =>
        name(feature) === street &&
        [feature.properties.insee_commune_gauche, feature.properties.insee_commune_droite].includes(insee) &&
        feature.geometry.coordinates.every(inVillage),
    );
    return segments.length
      ? { name: street, lines: segments.map((feature) => xy(feature.geometry.coordinates).map(round)) }
      : null;
  })
  .filter(Boolean);
const mainStreetNames = new Set(["RTE NATIONALE", "RTE DE CHAMPAGNOLE"]);
const lit = [];
const allStreetLines = streets.flatMap((street) => street.lines.map((line) => ({ street: street.name, line })));
const totalLength = allStreetLines.reduce((sum, entry) => sum + length(entry.line), 0);
const spacing = totalLength / 48;
let carry = spacing / 2;
for (const { street, line } of allStreetLines) {
  const size = length(line);
  while (carry <= size && lit.length < 48) {
    lit.push({ street, main: mainStreetNames.has(street), position: pointAt(line, carry) });
    carry += spacing;
  }
  carry -= size;
}

const ruralPaths = [
  ["Chemin de la Grand’Vie", "CHE DE LA GRAND'VIE", "Route empierrée"],
  ["Chemin de la Grange à l’Olive", "CHE DE LA GRANGE A L'OLIVE", "Route empierrée"],
  ["Chemin sur les Replats", "SUR LES REPLATS", "Route empierrée"],
  ["Chemin de Combe Maria", "CHE DE COMBE MARIA", "Route empierrée"],
].map(([label, street, nature]) => ({
  label,
  lines: roads
    .filter((feature) => name(feature) === street && feature.properties.nature === nature)
    .map((feature) => xy(feature.geometry.coordinates).map(round)),
}));
const serrettesBridge = structures.find(
  (feature) => feature.properties.nature === "Pont" && metres(feature.geometry.coordinates[0], [6.04341, 46.63305]) < 5,
);

const forestIds = ["392270000B0949", "392270000B0951", "392270000B0953", "392270000B0954", "392270000B0956"];
const forest = forestIds.map((id) => ({
  id,
  contenance: parcel(id).properties.contenance,
  rings: rings(parcel(id).geometry)[0].map((ring) => ring.map(round)),
}));
const champDeMars = rings(parcel("392270000B1258").geometry)[0][0].map(round);

const territory = {
  sources: {
    roads: "IGN BD TOPO, troncon_de_route, construction_lineaire (Géoplateforme WFS), Licence Ouverte 2.0",
    parcels: "Cadastre Etalab, commune 39227 (cadastre.data.gouv.fr), Licence Ouverte 2.0",
    communalParcels: "DGFiP, fichier des parcelles des personnes morales, situation 2025, département 39",
    extractedOn: new Date().toISOString().slice(0, 10),
  },
  montNoir: {
    line: montNoir,
    length: Math.round(length(montNoir)),
    slope: slice(montNoir, slope.from, slope.from + 160),
    slopeStart: slope.from,
    upper: slice(montNoir, slope.from + 160, 564),
    firstLeg: slice(montNoir, 0, slope.from),
    secondLeg: slice(montNoir, 500, 564),
    culvert: pointAt(montNoir, 460),
    photos: {
      rut: pointAt(montNoir, 110),
      ditch: pointAt(montNoir, 200),
      verge: pointAt(montNoir, 340),
      culvert: pointAt(montNoir, 460),
      view: pointAt(montNoir, 8),
      marking: pointAt(montNoir, 450),
    },
  },
  douanets: {
    chemin: douanets.map(round),
    viaduct: xy(viaduct.geometry.coordinates).map(round),
    tram: tram.map(round),
    parking,
    parkingParcel: "392270000B1042",
  },
  lighting: { streets, points: lit },
  ruralPaths,
  bridge: {
    position: round(serrettesBridge.geometry.coordinates[0]),
    road: "CHE DES SERRETTES",
    stream: "la Sainette",
  },
  forest,
  champDeMars: { parcel: "392270000B1258", ring: champDeMars },
};
writeFileSync(new URL("territory.json", output), `${JSON.stringify(territory, null, 1)}\n`);
writeFileSync(
  new URL("parcelles-riveraines.geojson", output),
  `${JSON.stringify({ type: "FeatureCollection", features: riverside })}\n`,
);
writeFileSync(new URL("parcelles-communales.txt", output), `${[...communal].sort().join("\n")}\n`);
const communalFeatures = parcels
  .filter((feature) => communal.has(feature.id))
  .map((feature) => ({
    type: "Feature",
    id: feature.id,
    properties: {
      idu: feature.id,
      section: feature.properties.section,
      numero: feature.properties.numero,
      contenance: feature.properties.contenance,
    },
    geometry: {
      type: feature.geometry.type,
      coordinates:
        feature.geometry.type === "Polygon"
          ? feature.geometry.coordinates.map((ring) => ring.map(round))
          : feature.geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(round))),
    },
  }));
writeFileSync(
  new URL("parcelles-communales.geojson", output),
  `${JSON.stringify({ type: "FeatureCollection", features: communalFeatures })}\n`,
);
console.log(
  `Mont Noir ${territory.montNoir.length} m, pente à ${slope.from} m, ${riverside.length} parcelles riveraines, ${communal.size} parcelles communales, ${lit.length} points lumineux`,
);
