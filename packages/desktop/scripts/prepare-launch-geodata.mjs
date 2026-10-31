import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(desktopRoot, "geodata");
const extent = 1000;
const unitsPerCoordinate = 20;
const parallels = [44, 49];
const centralMeridian = 3;

/**
 * Grandes cités antiques et point focal du site d'Alésia, d'après le cadrage documentaire du topic
 * hall-alesia-jura-framing (graphies françaises, attestations) ; positions des villes actuelles en degrés.
 */
const ancientCities = [
  ["Lutèce", "Paris", [2.3488, 48.8534], "César, BG VI, 3 et VII, 57"],
  ["Lugdunum", "Lyon", [4.8357, 45.764], "Dion Cassius, fondation de 43 av. J.-C."],
  ["Genava", "Genève", [6.1432, 46.2044], "César, BG I, 6–7"],
  ["Massalie", "Marseille", [5.3698, 43.2965], "fondation phocéenne vers 600 av. J.-C."],
  ["Tolosa", "Toulouse", [1.4442, 43.6047], "César, BG I, 10 ; Strabon IV"],
  ["Burdigala", "Bordeaux", [-0.5792, 44.8378], "Strabon IV, 2, 1"],
  ["Argentorate", "Strasbourg", [7.7521, 48.5734], "Ptolémée"],
  ["Durocortorum", "Reims", [4.0317, 49.2583], "César, BG VI, 44"],
  ["Vesontio", "Besançon", [6.0241, 47.2378], "César, BG I, 38"],
  ["Cenabum", "Orléans", [1.9093, 47.9029], "César, BG VII, 3 et 11"],
  ["Augustonemetum", "Clermont-Ferrand", [3.0863, 45.7772], "Ptolémée"],
  ["Cularo", "Grenoble", [5.7245, 45.1885], "lettre de Plancus à Cicéron, 43 av. J.-C."],
  ["Rotomagus", "Rouen", [1.0993, 49.4432], "Ptolémée"],
  ["Divodurum", "Metz", [6.1757, 49.1193], "Tacite, Histoires I, 63"],
  ["Samarobriva", "Amiens", [2.2958, 49.8941], "César, BG V, 24"],
  ["Nemausus", "Nîmes", [4.3601, 43.8367], "Strabon IV, 1, 12"],
  ["Divio", "Dijon", [5.0415, 47.322], "Grégoire de Tours"],
  ["Condevincum", "Nantes", [-1.5536, 47.2184], "Ptolémée"],
];
const alesiaFocus = [5.957, 46.6677];

function usage() {
  console.error(
    "Usage: node scripts/prepare-launch-geodata.mjs <dossier téléchargé> [chemin de mapshaper]\n" +
      "Le dossier contient departements.geojson (france-geojson) et communes/communes-<code>.geojson (geo.api.gouv.fr).",
  );
  process.exit(1);
}

const downloadDirectory = process.argv[2];
if (!downloadDirectory) usage();
const mapshaper = process.argv[3] ?? resolve(desktopRoot, "../../prototypes/launch-screen/node_modules/.bin/mapshaper");

const radians = Math.PI / 180;
const phi1 = parallels[0] * radians;
const phi2 = parallels[1] * radians;
const cone =
  Math.log(Math.cos(phi1) / Math.cos(phi2)) /
  Math.log(Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2));
const coneConstant = (Math.cos(phi1) * Math.tan(Math.PI / 4 + phi1 / 2) ** cone) / cone;

/** Projection conique conforme de Lambert sur la sphère, y vers le nord. */
function lambert([longitude, latitude]) {
  const rho = coneConstant / Math.tan(Math.PI / 4 + (latitude * radians) / 2) ** cone;
  const theta = cone * (longitude - centralMeridian) * radians;
  return [rho * Math.sin(theta), -rho * Math.cos(theta)];
}

function simplify(input, output, fields, percentage) {
  execFileSync(
    mapshaper,
    [
      input,
      "-filter-fields",
      fields,
      "-simplify",
      percentage,
      "weighted",
      "keep-shapes",
      "-clean",
      "-o",
      output,
      "format=geojson",
      "precision=0.00001",
    ],
    { stdio: "pipe" },
  );
  return JSON.parse(readFileSync(output, "utf8"));
}

function polygonsOf(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function signedArea(ring) {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return sum / 2;
}

/**
 * Anneaux plans en entiers, extérieur dans le sens direct, trous dans le sens indirect, sans point de fermeture ;
 * le premier point est absolu, les suivants sont des écarts au point précédent.
 */
function encodeArea(geometry, toPlane) {
  return polygonsOf(geometry).map((rings) =>
    rings
      .map((ring, index) => {
        const points = ring.map(toPlane);
        if (signedArea(points) > 0 !== (index === 0)) points.reverse();
        const flat = [];
        let previous = [0, 0];
        for (const [x, y] of points.slice(0, -1)) {
          const current = [Math.round(x * unitsPerCoordinate), Math.round(y * unitsPerCoordinate)];
          if (flat.length > 0 && current[0] === previous[0] && current[1] === previous[1]) continue;
          flat.push(current[0] - previous[0], current[1] - previous[1]);
          previous = current;
        }
        return flat;
      })
      .filter((flat) => flat.length >= 6),
  );
}

const workDirectory = mkdtempSync(join(tmpdir(), "hall-launch-geodata-"));
try {
  const departements = simplify(
    join(downloadDirectory, "departements.geojson"),
    join(workDirectory, "departements.json"),
    "code,nom",
    "6%",
  );
  const metropolitan = departements.features.filter((feature) => !feature.properties.code.startsWith("97"));
  const projected = metropolitan.flatMap((feature) => polygonsOf(feature.geometry).flat(2).map(lambert));
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = extent / Math.max(maxX - minX, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const toPlane = (position) => {
    const [x, y] = lambert(position);
    return [(x - centerX) * scale, (y - centerY) * scale];
  };

  rmSync(join(outputDirectory, "communes"), { recursive: true, force: true });
  mkdirSync(join(outputDirectory, "communes"), { recursive: true });
  const projection = {
    name: "Lambert conique conforme, sphère",
    parallels,
    centralMeridian,
    center: [centerX, centerY],
    scale,
    unitsPerCoordinate,
    encoding: "anneaux à plat [x0, y0, dx1, dy1, …], premier point absolu",
  };
  writeFileSync(
    join(outputDirectory, "departements.json"),
    JSON.stringify({
      projection,
      departements: metropolitan
        .map((feature) => ({
          code: feature.properties.code,
          name: feature.properties.nom,
          polygons: encodeArea(feature.geometry, toPlane),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }),
  );

  writeFileSync(
    join(outputDirectory, "landmarks.json"),
    JSON.stringify({
      source: "topic hall-alesia-jura-framing, clés villes_antiques et emprise.point_focal, 31 octobre 2026",
      ancientCities: ancientCities.map(([name, modernName, position, attestation]) => ({
        name,
        modernName,
        attestation,
        position: toPlane(position).map((value) => Math.round(value * unitsPerCoordinate)),
      })),
      alesiaFocus: toPlane(alesiaFocus).map((value) => Math.round(value * unitsPerCoordinate)),
    }),
  );

  const communeDirectory = join(downloadDirectory, "communes");
  for (const file of readdirSync(communeDirectory).filter((name) => /^communes-[0-9AB]{2}\.geojson$/.test(name))) {
    const code = file.slice("communes-".length, -".geojson".length);
    const communes = simplify(
      join(communeDirectory, file),
      join(workDirectory, `communes-${code}.json`),
      "code,nom",
      "7%",
    );
    writeFileSync(
      join(outputDirectory, "communes", `${code}.json`),
      JSON.stringify({
        departement: code,
        communes: communes.features
          .map((feature) => ({
            code: feature.properties.code,
            name: feature.properties.nom,
            polygons: encodeArea(feature.geometry, toPlane),
          }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      }),
    );
  }
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

let total = 0;
const sizes = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) sizes(path);
    else total += stats.size;
  }
};
sizes(outputDirectory);
console.log(`geodata : ${(total / 1024 / 1024).toFixed(2)} Mo`);
