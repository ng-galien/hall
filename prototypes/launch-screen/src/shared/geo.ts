import { type GeoProjection, geoConicConformal } from "d3-geo";
import type { Feature, FeatureCollection, GeometryCollection, MultiPolygon, Polygon, Position } from "geojson";
import communesData from "../data/communes-39.json";
import contourData from "../data/contour-39.json";
import departementsData from "../data/departements.json";
import franceData from "../data/france.json";

export interface AreaProperties {
  code: string;
  nom: string;
  population?: number;
}

export type AreaGeometry = Polygon | MultiPolygon;
export type Area = Feature<AreaGeometry, AreaProperties>;

function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}

/** Oriente les anneaux comme l'attend d3-geo : extérieur dans le sens horaire, trous dans le sens inverse. */
function rewind(geometry: AreaGeometry): AreaGeometry {
  for (const polygon of polygonsOf(geometry)) {
    polygon.forEach((ring, index) => {
      const clockwise = signedArea(ring) < 0;
      if (clockwise !== (index === 0)) ring.reverse();
    });
  }
  return geometry;
}

function rewindAll(collection: FeatureCollection<AreaGeometry, AreaProperties>) {
  for (const feature of collection.features) rewind(feature.geometry);
  return collection;
}

export const departements = rewindAll(departementsData as FeatureCollection<AreaGeometry, AreaProperties>);
export const communes = rewindAll(communesData as FeatureCollection<AreaGeometry, AreaProperties>);
export const franceOutline = rewind((franceData as GeometryCollection<AreaGeometry>).geometries[0]);

export const territory = {
  departementCode: "39",
  departementName: "Jura",
  communeCode: "39129",
  communeName: "Chaux-des-Crotenay",
  placeLabel: "Alésia",
} as const;

export function findArea(collection: FeatureCollection<AreaGeometry, AreaProperties>, code: string): Area {
  const area = collection.features.find((feature) => feature.properties.code === code);
  if (!area) throw new Error(`Territoire introuvable : ${code}`);
  return area;
}

export const departement = findArea(departements, territory.departementCode);
/** Contour détaillé du Jura, union des communes, au même niveau de détail que celles-ci. */
export const departementContour = rewind((contourData as GeometryCollection<AreaGeometry>).geometries[0]);
export const commune = findArea(communes, territory.communeCode);

/** Projection conique conforme de Lambert, parallèles 44° et 49° comme le Lambert-93. */
export function lambert(): GeoProjection {
  return geoConicConformal().parallels([44, 49]).rotate([-3, 0]);
}

/** Projection plane centrée sur la France métropolitaine, emprise de `size` unités, axe y vers le nord. */
export function planarProjection(size: number): (position: Position) => [number, number] {
  const projection = lambert().fitExtent(
    [
      [-size / 2, -size / 2],
      [size / 2, size / 2],
    ],
    departements,
  );
  return (position) => {
    const point = projection([position[0], position[1]]) ?? [0, 0];
    return [point[0], -point[1]];
  };
}

/** Liste des polygones d'une géométrie, chacun sous forme d'anneaux (extérieur puis trous). */
export function polygonsOf(geometry: AreaGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function planarCentroid(rings: [number, number][][]): [number, number] {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const ring of rings) {
    for (const [px, py] of ring) {
      x += px;
      y += py;
      count += 1;
    }
  }
  return count === 0 ? [0, 0] : [x / count, y / count];
}
