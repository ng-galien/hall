export type PlanarPoint = [number, number];
export type PlanarRing = PlanarPoint[];
export type PlanarPolygon = PlanarRing[];

export interface Area {
  code: string;
  name: string;
  polygons: PlanarPolygon[];
}

export interface AncientCity {
  name: string;
  modernName: string;
  position: PlanarPoint;
}

/** Projection de la carte : Lambert conique conforme sur la sphère, recentrée et ramenée à l'emprise de la métropole. */
export interface MapProjection {
  parallels: [number, number];
  centralMeridian: number;
  center: [number, number];
  scale: number;
}

export interface LaunchGeodata {
  projection: MapProjection;
  departements: Area[];
  communes: Area[];
  ancientCities: AncientCity[];
  alesiaFocus: PlanarPoint;
}

interface EncodedArea {
  code: string;
  name: string;
  polygons: number[][][];
}

const unitsPerCoordinate = 20;

/** Anneau à plat [x0, y0, dx1, dy1, …] en entiers vers des points en unités de la carte. */
function decodeRing(flat: number[]): PlanarRing {
  const ring: PlanarRing = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index];
    y += flat[index + 1];
    ring.push([x / unitsPerCoordinate, y / unitsPerCoordinate]);
  }
  return ring;
}

function decodeArea(area: EncodedArea): Area {
  return {
    code: area.code,
    name: area.name,
    polygons: area.polygons.map((rings) => rings.map(decodeRing)),
  };
}

function decodePoint([x, y]: number[]): PlanarPoint {
  return [x / unitsPerCoordinate, y / unitsPerCoordinate];
}

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Géométrie introuvable : ${path}`);
  return (await response.json()) as T;
}

/** Charge les départements, les repères et les communes du seul département visé. */
export async function loadGeodata(departementCode: string): Promise<LaunchGeodata> {
  const [departements, communes, landmarks] = await Promise.all([
    readJson<{ projection: MapProjection; departements: EncodedArea[] }>("geodata/departements.json"),
    readJson<{ communes: EncodedArea[] }>(`geodata/communes/${encodeURIComponent(departementCode)}.json`),
    readJson<{
      ancientCities: { name: string; modernName: string; position: number[] }[];
      alesiaFocus: number[];
    }>("geodata/landmarks.json"),
  ]);
  return {
    projection: departements.projection,
    departements: departements.departements.map(decodeArea),
    communes: communes.communes.map(decodeArea),
    ancientCities: landmarks.ancientCities.map((city) => ({
      name: city.name,
      modernName: city.modernName,
      position: decodePoint(city.position),
    })),
    alesiaFocus: decodePoint(landmarks.alesiaFocus),
  };
}

/** Moyenne des sommets : suffisante pour cadrer un territoire. */
export function planarCentroid(polygons: PlanarPolygon[]): PlanarPoint {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const [outer] of polygons) {
    for (const [px, py] of outer) {
      x += px;
      y += py;
      count += 1;
    }
  }
  return count === 0 ? [0, 0] : [x / count, y / count];
}

/** Point de la carte d'une longitude et d'une latitude en degrés, par la projection de la carte. */
export function projectToMap(projection: MapProjection, longitude: number, latitude: number): PlanarPoint {
  const radians = Math.PI / 180;
  const [phi1, phi2] = projection.parallels.map((value) => value * radians) as [number, number];
  const cone =
    Math.log(Math.cos(phi1) / Math.cos(phi2)) /
    Math.log(Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2));
  const constant = (Math.cos(phi1) * Math.tan(Math.PI / 4 + phi1 / 2) ** cone) / cone;
  const rho = constant / Math.tan(Math.PI / 4 + (latitude * radians) / 2) ** cone;
  const theta = cone * (longitude - projection.centralMeridian) * radians;
  return [
    (rho * Math.sin(theta) - projection.center[0]) * projection.scale,
    (-rho * Math.cos(theta) - projection.center[1]) * projection.scale,
  ];
}
