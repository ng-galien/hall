import type { Spot } from "./scenes";

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

export const siegeSites = {
  confluence: wgs(5.9426, 46.69),
  plateau: wgs(5.962, 46.67),
  rachet: wgs(5.9693, 46.6502),
  tower: { x: -2160, y: 340 },
  cornu: wgs(5.957, 46.6677),
  granary: wgs(5.959, 46.6687),
  plain: wgs(5.95, 46.695),
  westRampart: wgs(5.9465, 46.663),
  northCurtain: wgs(5.953, 46.6777),
  hall: wgs(5.9705, 46.6655),
  square: wgs(5.968, 46.6705),
  lookout: { x: -3230, y: 2497 },
  meeting: wgs(5.9505, 46.6935),
};

/** Local metres shared by the visible village and the paths through it. */
export const oppidumStreet = [
  { x: 5, y: -70 },
  { x: 160, y: -66 },
  { x: 340, y: -60 },
  { x: 470, y: -60 },
];

export const oppidumNorthStreet = [
  { x: 5, y: -70 },
  { x: 5, y: 70 },
  { x: -28, y: 150 },
  { x: -28, y: 340 },
  { x: -28, y: 460 },
];

export const oppidumHomes = [
  [-285, 70, 66, 85],
  [-205, 190, 78, 100],
  [-80, 230, 65, 85],
  [65, 245, 73, 95],
  [205, 180, 82, 110],
  [300, 65, 64, 85],
  [-290, -145, 72, 95],
  [-175, -240, 66, 90],
  [-30, -265, 78, 105],
  [125, -245, 68, 90],
  [260, -175, 75, 100],
  [185, 50, 55, 78],
  [-180, 25, 55, 75],
  [40, 135, 55, 70],
] as const;

export const oppidumGranaries = [
  [-60, 0, 75, 105],
  [65, 30, 65, 90],
] as const;

/** Local metres: a free approach, the southern gate and the command tent forecourt. */
export const romanCampAccess = {
  westPost: { x: -52, y: -256 },
  eastPost: { x: 52, y: -267 },
  street: [
    { x: 0, y: -500 },
    { x: 0, y: -410 },
    { x: 0, y: -262 },
    { x: 0, y: 10 },
    { x: 0, y: 110 },
  ],
  delivery: { x: 0, y: 110 },
};
